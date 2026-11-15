import "server-only";

/**
 * Snapshot imports hold a transaction-scoped advisory lock for each
 * user/source/profile through reconciliation. Server fetches start under the
 * lock so an older run cannot overwrite or prune a newer run's data.
 * Extension snapshots are serialized at server admission; the lock cannot
 * establish the freshness of a capture made before upload.
 * PostgreSQL releases the locks when the transaction ends.
 */

import { chunk, mapConcurrent } from "@/lib/common/array";
import {
    DEFAULT_BROWSER_PROFILE_ID,
    ITEM_KIND_BOOKMARK,
    ITEM_KIND_FOLDER,
} from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { IntegrationImportConflictError } from "@/lib/integrations/error";
import { prisma } from "@/prisma";
import { Prisma } from "@/prisma/client/client";
import type { LibraryItemSource } from "@/prisma/client/enums";

const log = createLogger("integrations:import");

const EXISTING_IMPORT_LOOKUP_BATCH_SIZE = 250;
const IMPORT_UPSERT_CONCURRENCY = 4;
const SNAPSHOT_IMPORT_WRITE_BATCH_SIZE = 250;
const SNAPSHOT_IMPORT_TRANSACTION_MAX_WAIT_MS = 10_000;
// Bound the full fetch and reconciliation; a timeout rolls back all changes.
const SNAPSHOT_IMPORT_TRANSACTION_TIMEOUT_MS = 5 * 60_000;
/**
 * Snapshot prunes treat "absent from an upstream API response" as deletion
 * authority, which upstream incidents (valid-looking truncated pages, mass
 * author suspensions) can corrupt into wiping a library. A legitimate prune
 * rarely removes more than half of an established library at once, so beyond
 * these bounds the prune is aborted and reported instead of executed.
 */
const SNAPSHOT_PRUNE_GUARD_MIN_LIVE_ROWS = 20;
const SNAPSHOT_PRUNE_GUARD_MAX_RATIO = 0.5;

type LibraryItemImportKind =
    | typeof ITEM_KIND_BOOKMARK
    | typeof ITEM_KIND_FOLDER;

interface LibraryItemImportIdentity {
    browserProfileId: string;
    externalId: string;
}

interface LibraryItemImportContent {
    caption: string | null;
    kind: LibraryItemImportKind;
    parentExternalId: string | null;
    postedAt: Date | null;
    sourceDeviceId: string | null;
    sourceDeviceName: string | null;
    sourceMetadata: Prisma.InputJsonObject | null;
    url: string;
}

interface LibraryItemImportRow extends LibraryItemImportIdentity {
    content: LibraryItemImportContent;
    scrapedAt: Date;
    source: LibraryItemSource;
}

export interface LibraryItemImportInput {
    browserProfileId?: string | null;
    caption?: string | null;
    externalId?: string | null;
    kind?: LibraryItemImportKind;
    parentExternalId?: string | null;
    postedAt?: Date | null;
    scrapedAt?: Date | null;
    sourceDeviceId?: string | null;
    sourceDeviceName?: string | null;
    sourceMetadata?: Prisma.InputJsonObject | null;
    url: string;
}

/** Comparable projection of item content; DB rows and incoming rows render through the same builder so change detection is exact. */
interface ImportContentSnapshot {
    caption: string | null;
    kind: string;
    parentExternalId: string | null;
    postedAtMs: number | null;
    sourceDeviceId: string | null;
    sourceDeviceName: string | null;
    sourceMetadataJson: string;
    url: string;
}

interface ExistingLibraryItemImport extends LibraryItemImportIdentity {
    deletedAt: Date | null;
    snapshot: ImportContentSnapshot;
}

type LibraryItemDelegate = Pick<
    Prisma.TransactionClient["libraryItem"],
    "upsert"
>;

interface PersistedLibraryItemImports {
    importedCount: number;
    smartCollectionItemIds: string[];
    unchangedCount: number;
    updatedCount: number;
}

const EXISTING_IMPORT_SELECT = {
    browserProfileId: true,
    caption: true,
    deletedAt: true,
    externalId: true,
    kind: true,
    parentExternalId: true,
    postedAt: true,
    sourceDeviceId: true,
    sourceDeviceName: true,
    sourceMetadata: true,
    url: true,
} satisfies Prisma.LibraryItemSelect;

function normalizeLibraryItemImportRows(args: {
    items: LibraryItemImportInput[];
    source: LibraryItemSource;
}): { rows: LibraryItemImportRow[]; skippedCount: number } {
    const rowsByIdentity = new Map<string, LibraryItemImportRow>();
    let skippedCount = 0;

    for (const item of args.items) {
        const externalId = item.externalId?.trim();
        if (!externalId) {
            skippedCount += 1;
            continue;
        }

        // A bookmark without a URL cannot be opened or enriched; guid-only
        // RSS entries land here. Count them as skipped rather than
        // persisting dead rows.
        if (!item.url.trim()) {
            skippedCount += 1;
            continue;
        }

        const row: LibraryItemImportRow = {
            browserProfileId:
                item.browserProfileId?.trim() || DEFAULT_BROWSER_PROFILE_ID,
            content: {
                caption: item.caption?.trim() || null,
                kind:
                    item.kind === ITEM_KIND_FOLDER
                        ? ITEM_KIND_FOLDER
                        : ITEM_KIND_BOOKMARK,
                parentExternalId: item.parentExternalId ?? null,
                postedAt: item.postedAt ?? null,
                sourceDeviceId: item.sourceDeviceId ?? null,
                sourceDeviceName: item.sourceDeviceName ?? null,
                sourceMetadata: item.sourceMetadata ?? null,
                url: item.url.trim(),
            },
            externalId,
            // Callers pass scrape time when the fetch happened; default to
            // now so a missing stamp still sorts sanely.
            scrapedAt: item.scrapedAt ?? new Date(),
            source: args.source,
        };

        rowsByIdentity.set(libraryItemIdentityKey(row), row);
    }

    return {
        rows: [...rowsByIdentity.values()],
        skippedCount,
    };
}

function libraryItemIdentityKey({
    browserProfileId,
    externalId,
}: LibraryItemImportIdentity): string {
    return `${browserProfileId}\u0000${externalId}`;
}

/**
 * Deterministic JSON rendering for change detection. Postgres jsonb does not
 * preserve key order, so both sides render through this sorted serializer
 * before comparison.
 */
function canonicalJsonStringify(value: unknown): string {
    if (value instanceof Date) {
        return JSON.stringify(value.toISOString()) ?? "null";
    }
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value) ?? "null";
    }
    if (Array.isArray(value)) {
        return `[${value.map(canonicalJsonStringify).join(",")}]`;
    }
    const entries = Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([leftKey], [rightKey]) => (leftKey < rightKey ? -1 : 1));
    return `{${entries
        .map(
            ([key, entryValue]) =>
                `${JSON.stringify(key)}:${canonicalJsonStringify(entryValue)}`
        )
        .join(",")}}`;
}

function buildContentSnapshot(args: {
    caption: string | null;
    kind: string;
    parentExternalId: string | null;
    postedAt: Date | null;
    sourceDeviceId: string | null;
    sourceDeviceName: string | null;
    sourceMetadata: unknown;
    url: string;
}): ImportContentSnapshot {
    return {
        caption: args.caption,
        kind: args.kind,
        parentExternalId: args.parentExternalId,
        postedAtMs: args.postedAt?.getTime() ?? null,
        sourceDeviceId: args.sourceDeviceId,
        sourceDeviceName: args.sourceDeviceName,
        sourceMetadataJson: canonicalJsonStringify(args.sourceMetadata),
        url: args.url,
    };
}

function isSameImportSnapshot(
    left: ImportContentSnapshot,
    right: ImportContentSnapshot
): boolean {
    return (
        left.caption === right.caption &&
        left.kind === right.kind &&
        left.parentExternalId === right.parentExternalId &&
        left.postedAtMs === right.postedAtMs &&
        left.sourceDeviceId === right.sourceDeviceId &&
        left.sourceDeviceName === right.sourceDeviceName &&
        left.sourceMetadataJson === right.sourceMetadataJson &&
        left.url === right.url
    );
}

function rowToExistingLibraryItemImport(row: {
    browserProfileId: string;
    caption: string | null;
    deletedAt: Date | null;
    externalId: string;
    kind: string;
    parentExternalId: string | null;
    postedAt: Date | null;
    sourceDeviceId: string | null;
    sourceDeviceName: string | null;
    sourceMetadata: Prisma.JsonValue;
    url: string;
}): ExistingLibraryItemImport {
    return {
        browserProfileId: row.browserProfileId,
        deletedAt: row.deletedAt,
        externalId: row.externalId,
        snapshot: buildContentSnapshot({
            caption: row.caption,
            kind: row.kind,
            parentExternalId: row.parentExternalId,
            postedAt: row.postedAt,
            sourceDeviceId: row.sourceDeviceId,
            sourceDeviceName: row.sourceDeviceName,
            sourceMetadata: row.sourceMetadata,
            url: row.url,
        }),
    };
}

function indexExistingByIdentityKey(
    existingRows: ExistingLibraryItemImport[]
): Map<string, ExistingLibraryItemImport> {
    return new Map(
        existingRows.map((row) => [libraryItemIdentityKey(row), row])
    );
}

function buildLibraryItemCreateData(
    row: LibraryItemImportRow,
    userId: string
): Prisma.LibraryItemUncheckedCreateInput {
    return {
        ...row.content,
        browserProfileId: row.browserProfileId,
        externalId: row.externalId,
        scrapedAt: row.scrapedAt,
        source: row.source,
        sourceMetadata: row.content.sourceMetadata ?? Prisma.DbNull,
        userId,
    };
}

function buildLibraryItemUpdateData(
    row: LibraryItemImportRow
): Prisma.LibraryItemUncheckedUpdateInput {
    return {
        ...row.content,
        deletedAt: null,
        scrapedAt: row.scrapedAt,
        sourceMetadata: row.content.sourceMetadata ?? Prisma.DbNull,
    };
}

/**
 * Selects only rows that are new or whose content changed against
 * `existingByIdentity`. Tombstoned identities are never written: a trashed
 * item stays trashed and syncs must not resurrect user deletions. Unchanged
 * rows are skipped entirely so steady-state syncs cost no writes, which also
 * preserves each item's original `scrapedAt` until its content actually
 * changes upstream.
 */
function partitionChangedLibraryItemImports(args: {
    existingByIdentity: ReadonlyMap<string, ExistingLibraryItemImport>;
    rows: readonly LibraryItemImportRow[];
}) {
    const createdRows: LibraryItemImportRow[] = [];
    const updatedRows: LibraryItemImportRow[] = [];
    let unchangedCount = 0;
    for (const row of args.rows) {
        const existing = args.existingByIdentity.get(
            libraryItemIdentityKey(row)
        );
        if (existing?.deletedAt) {
            continue;
        }
        if (!existing) {
            createdRows.push(row);
            continue;
        }
        if (
            isSameImportSnapshot(
                existing.snapshot,
                buildContentSnapshot(row.content)
            )
        ) {
            unchangedCount += 1;
            continue;
        }
        updatedRows.push(row);
    }
    return { createdRows, unchangedCount, updatedRows };
}

async function persistChangedLibraryItemImports(args: {
    delegate: LibraryItemDelegate;
    existingByIdentity: ReadonlyMap<string, ExistingLibraryItemImport>;
    rows: readonly LibraryItemImportRow[];
    shouldAddToSmartCollections?: (row: LibraryItemImportRow) => boolean;
    upsertConcurrency: number;
    userId: string;
}): Promise<PersistedLibraryItemImports> {
    const { createdRows, unchangedCount, updatedRows } =
        partitionChangedLibraryItemImports(args);
    const smartCollectionItemIds: string[] = [];
    const shouldAddToSmartCollections =
        args.shouldAddToSmartCollections ??
        ((row: LibraryItemImportRow) => row.content.kind !== ITEM_KIND_FOLDER);

    await mapConcurrent(
        [...createdRows, ...updatedRows],
        async (row) => {
            const saved = await args.delegate.upsert({
                create: buildLibraryItemCreateData(row, args.userId),
                select: { id: true },
                update: buildLibraryItemUpdateData(row),
                where: {
                    userId_source_browserProfileId_externalId: {
                        browserProfileId: row.browserProfileId,
                        externalId: row.externalId,
                        source: row.source,
                        userId: args.userId,
                    },
                },
            });
            if (
                !args.existingByIdentity.has(libraryItemIdentityKey(row)) &&
                shouldAddToSmartCollections(row)
            ) {
                smartCollectionItemIds.push(saved.id);
            }
        },
        args.upsertConcurrency
    );

    return {
        importedCount: createdRows.length,
        smartCollectionItemIds,
        unchangedCount,
        updatedCount: updatedRows.length,
    };
}

async function persistSnapshotLibraryItemImports(args: {
    tx: Prisma.TransactionClient;
    existingByIdentity: ReadonlyMap<string, ExistingLibraryItemImport>;
    rows: readonly LibraryItemImportRow[];
    source: LibraryItemSource;
    userId: string;
}): Promise<PersistedLibraryItemImports> {
    const { createdRows, unchangedCount, updatedRows } =
        partitionChangedLibraryItemImports(args);
    const smartCollectionItemIds: string[] = [];
    // A transaction has one connection. Batch writes to avoid a round trip per item.
    for (const batch of chunk(createdRows, SNAPSHOT_IMPORT_WRITE_BATCH_SIZE)) {
        const saved = await args.tx.libraryItem.createManyAndReturn({
            data: batch.map((row) =>
                buildLibraryItemCreateData(row, args.userId)
            ),
            select: { id: true, kind: true },
        });
        for (const item of saved) {
            if (item.kind !== ITEM_KIND_FOLDER) {
                smartCollectionItemIds.push(item.id);
            }
        }
    }

    let updatedCount = 0;
    for (const batch of chunk(updatedRows, SNAPSHOT_IMPORT_WRITE_BATCH_SIZE)) {
        const values = batch.map(
            (row) => Prisma.sql`(
            ${row.browserProfileId}::text, ${row.externalId}::text,
            ${row.content.kind}::"LibraryItemKind", ${row.content.caption}::text,
            ${row.content.parentExternalId}::text, ${row.content.postedAt}::timestamp,
            ${row.content.sourceDeviceId}::text, ${row.content.sourceDeviceName}::text,
            ${row.content.sourceMetadata === null ? null : JSON.stringify(row.content.sourceMetadata)}::jsonb,
            ${row.content.url}::text, ${row.scrapedAt}::timestamp
        )`
        );
        updatedCount += await args.tx.$executeRaw`
            UPDATE "library_item" AS item
            SET "kind" = incoming.kind, "caption" = incoming.caption,
                "parentExternalId" = incoming.parent_external_id,
                "postedAt" = incoming.posted_at,
                "sourceDeviceId" = incoming.source_device_id,
                "sourceDeviceName" = incoming.source_device_name,
                "sourceMetadata" = incoming.source_metadata,
                "url" = incoming.url, "scrapedAt" = incoming.scraped_at,
                "updatedAt" = timezone('UTC', statement_timestamp())
            FROM (VALUES ${Prisma.join(values)}) AS incoming(
                browser_profile_id, external_id, kind, caption, parent_external_id,
                posted_at, source_device_id, source_device_name, source_metadata,
                url, scraped_at
            )
            WHERE item."userId" = ${args.userId}
                AND item."source" = ${args.source}::"LibraryItemSource"
                AND item."browserProfileId" = incoming.browser_profile_id
                AND item."externalId" = incoming.external_id
                AND item."deletedAt" IS NULL
        `;
    }
    return {
        importedCount: createdRows.length,
        smartCollectionItemIds,
        unchangedCount,
        updatedCount,
    };
}

async function findExistingImportRows(args: {
    rows: LibraryItemImportRow[];
    source: LibraryItemSource;
    userId: string;
}): Promise<ExistingLibraryItemImport[]> {
    const batchResults = await mapConcurrent(
        chunk(args.rows, EXISTING_IMPORT_LOOKUP_BATCH_SIZE),
        async (batch) => {
            const dbRows = await prisma.libraryItem.findMany({
                select: EXISTING_IMPORT_SELECT,
                where: {
                    OR: batch.map((row) => ({
                        browserProfileId: row.browserProfileId,
                        externalId: row.externalId,
                    })),
                    source: args.source,
                    userId: args.userId,
                },
            });
            return dbRows.map(rowToExistingLibraryItemImport);
        },
        IMPORT_UPSERT_CONCURRENCY
    );

    return batchResults.flat();
}

export async function upsertLibraryItemImports(args: {
    items: LibraryItemImportInput[];
    shouldAddToSmartCollections?: (row: LibraryItemImportRow) => boolean;
    source: LibraryItemSource;
    userId: string;
}) {
    const { rows, skippedCount } = normalizeLibraryItemImportRows(args);
    if (rows.length === 0) {
        return {
            skippedCount,
            smartCollectionItemIds: [],
            unchangedCount: 0,
            upsertedCount: 0,
        };
    }

    const result = await persistChangedLibraryItemImports({
        delegate: prisma.libraryItem,
        existingByIdentity: indexExistingByIdentityKey(
            await findExistingImportRows({
                rows,
                source: args.source,
                userId: args.userId,
            })
        ),
        rows,
        shouldAddToSmartCollections: args.shouldAddToSmartCollections,
        upsertConcurrency: IMPORT_UPSERT_CONCURRENCY,
        userId: args.userId,
    });

    return {
        skippedCount,
        smartCollectionItemIds: result.smartCollectionItemIds,
        unchangedCount: result.unchangedCount,
        upsertedCount: result.importedCount + result.updatedCount,
    };
}

function groupRowsByProfile(rows: LibraryItemImportRow[]) {
    const grouped = new Map<string, LibraryItemImportRow[]>();

    for (const row of rows) {
        const profileRows = grouped.get(row.browserProfileId);
        if (profileRows) {
            profileRows.push(row);
            continue;
        }
        grouped.set(row.browserProfileId, [row]);
    }

    return grouped;
}

/**
 * A removable share beyond these bounds means the upstream response likely
 * under-reported rather than the user really deleting that much at once.
 */
function shouldAbortPrune(args: {
    liveRowCount: number;
    removableCount: number;
}): boolean {
    if (args.liveRowCount < SNAPSHOT_PRUNE_GUARD_MIN_LIVE_ROWS) {
        return false;
    }
    return (
        args.removableCount >
        Math.floor(args.liveRowCount * SNAPSHOT_PRUNE_GUARD_MAX_RATIO)
    );
}

async function importSnapshotProfileRows(args: {
    tx: Prisma.TransactionClient;
    browserProfileId: string;
    rows: LibraryItemImportRow[];
    snapshotComplete: boolean;
    source: LibraryItemSource;
    userId: string;
}): Promise<
    PersistedLibraryItemImports & { prunedCount: number; pruneAborted: boolean }
> {
    // The advisory lock covers this read through the final prune.
    const existingRows = await args.tx.libraryItem.findMany({
        select: EXISTING_IMPORT_SELECT,
        where: {
            browserProfileId: args.browserProfileId,
            source: args.source,
            userId: args.userId,
        },
    });
    const existingByIdentity = indexExistingByIdentityKey(
        existingRows.map(rowToExistingLibraryItemImport)
    );

    const persisted = await persistSnapshotLibraryItemImports({
        tx: args.tx,
        existingByIdentity,
        rows: args.rows,
        source: args.source,
        userId: args.userId,
    });

    if (!args.snapshotComplete) {
        log.debug("Snapshot prune skipped: partial fetch", {
            retainedCount: args.rows.length,
            source: args.source,
            userId: args.userId,
        });
        return {
            ...persisted,
            pruneAborted: false,
            prunedCount: 0,
        };
    }

    const retainedExternalIds = args.rows.map((row) => row.externalId);
    const retainedSet = new Set(retainedExternalIds);
    let liveRowCount = 0;
    let removableCount = 0;
    for (const row of existingRows) {
        if (row.deletedAt !== null) {
            continue;
        }
        liveRowCount += 1;
        if (!retainedSet.has(row.externalId)) {
            removableCount += 1;
        }
    }

    // An empty "complete" snapshot is far more likely an upstream anomaly than
    // a user deleting their entire upstream collection, and pruning on it is
    // unrecoverable: with no retained ids the deleteMany filter omits its
    // `notIn` clause and removes every live row. The ratio guard below cannot
    // catch this, because it exempts libraries under
    // SNAPSHOT_PRUNE_GUARD_MIN_LIVE_ROWS.
    if (retainedExternalIds.length === 0 && liveRowCount > 0) {
        log.warn("Snapshot prune skipped: complete fetch returned no rows", {
            liveRowCount,
            source: args.source,
            userId: args.userId,
        });
        return {
            ...persisted,
            pruneAborted: true,
            prunedCount: 0,
        };
    }

    if (shouldAbortPrune({ liveRowCount, removableCount })) {
        log.warn("Snapshot prune aborted by guard", {
            liveRowCount,
            removableCount,
            source: args.source,
            userId: args.userId,
        });
        return {
            ...persisted,
            pruneAborted: true,
            prunedCount: 0,
        };
    }

    const { count: prunedCount } = await args.tx.libraryItem.deleteMany({
        where: {
            browserProfileId: args.browserProfileId,
            deletedAt: null,
            ...(retainedExternalIds.length > 0
                ? { externalId: { notIn: retainedExternalIds } }
                : {}),
            source: args.source,
            userId: args.userId,
        },
    });

    return {
        ...persisted,
        pruneAborted: false,
        prunedCount,
    };
}

/** Fetch server snapshots inside the callback so the lock covers their lifetime. */
export function importLibraryItemSnapshot<TMetadata>(args: {
    browserProfileIdsToSync?: string[];
    fetchSnapshot: () => Promise<{
        items: LibraryItemImportInput[];
        metadata: TMetadata;
        snapshotComplete: boolean;
    }>;
    source: LibraryItemSource;
    userId: string;
}) {
    const profileIds = new Set<string>();
    for (const profileId of args.browserProfileIdsToSync ?? []) {
        profileIds.add(profileId.trim() || DEFAULT_BROWSER_PROFILE_ID);
    }
    if (profileIds.size === 0) {
        profileIds.add(DEFAULT_BROWSER_PROFILE_ID);
    }

    return prisma.$transaction(
        async (tx) => {
            // A stable lock order prevents deadlocks for overlapping profile sets.
            for (const browserProfileId of [...profileIds].sort()) {
                const scope = JSON.stringify([
                    "library-item-snapshot",
                    args.userId,
                    args.source,
                    browserProfileId,
                ]);
                const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`
                    SELECT pg_try_advisory_xact_lock(hashtextextended(${scope}, 0)) AS acquired
                `;
                if (!lock?.acquired) {
                    throw new IntegrationImportConflictError({
                        message:
                            "An import is already running. Try again when it finishes.",
                        operation: "importLibraryItemSnapshot",
                    });
                }
            }

            const snapshot = await args.fetchSnapshot();
            const { rows, skippedCount } = normalizeLibraryItemImportRows({
                items: snapshot.items,
                source: args.source,
            });
            const rowsByProfile = groupRowsByProfile(rows);
            for (const browserProfileId of rowsByProfile.keys()) {
                if (!profileIds.has(browserProfileId)) {
                    throw new Error(
                        "Snapshot profile must be locked before fetching its items."
                    );
                }
            }

            const result = {
                importedCount: 0,
                pruneAborted: false,
                prunedCount: 0,
                skippedCount,
                smartCollectionItemIds: new Set<string>(),
                updatedCount: 0,
            };
            for (const browserProfileId of profileIds) {
                const profileResult = await importSnapshotProfileRows({
                    browserProfileId,
                    rows: rowsByProfile.get(browserProfileId) ?? [],
                    snapshotComplete: snapshot.snapshotComplete,
                    source: args.source,
                    tx,
                    userId: args.userId,
                });
                result.importedCount += profileResult.importedCount;
                result.prunedCount += profileResult.prunedCount;
                result.pruneAborted ||= profileResult.pruneAborted;
                result.updatedCount += profileResult.updatedCount;
                for (const itemId of profileResult.smartCollectionItemIds) {
                    result.smartCollectionItemIds.add(itemId);
                }
            }

            return {
                ...result,
                metadata: snapshot.metadata,
                smartCollectionItemIds: [...result.smartCollectionItemIds],
            };
        },
        {
            maxWait: SNAPSHOT_IMPORT_TRANSACTION_MAX_WAIT_MS,
            timeout: SNAPSHOT_IMPORT_TRANSACTION_TIMEOUT_MS,
        }
    );
}
