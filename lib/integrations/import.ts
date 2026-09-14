import "server-only";

/**
 * Concurrency stance: concurrent imports of the same source are tolerated,
 * not prevented. Upserts are idempotent by identity key, change detection
 * skips unchanged rows, and every snapshot prune derives its retained set
 * from its own fetch, so overlapping runs converge without corruption at the
 * cost of some duplicated upstream/API work. Revisit only if that waste
 * becomes measurable in production.
 */

import { chunk, mapConcurrent } from "@/lib/common/array";
import { ITEM_KIND_BOOKMARK, ITEM_KIND_FOLDER } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { DEFAULT_BROWSER_PROFILE_ID } from "@/lib/integrations/browser-profiles";
import { prisma } from "@/prisma";
import { Prisma } from "@/prisma/client/client";
import type { LibraryItemSource } from "@/prisma/client/enums";

const log = createLogger("integrations:import");

const EXISTING_IMPORT_LOOKUP_BATCH_SIZE = 250;
const IMPORT_UPSERT_CONCURRENCY = 4;
const SNAPSHOT_IMPORT_CHUNK_SIZE = 200;
const SNAPSHOT_IMPORT_TRANSACTION_MAX_WAIT_MS = 10_000;
const SNAPSHOT_IMPORT_TRANSACTION_TIMEOUT_MS = 60_000;
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

interface LibraryItemImportInput {
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
 * Persists only rows that are new or whose content changed against
 * `existingByIdentity`. Tombstoned identities are never written: a trashed
 * item stays trashed and syncs must not resurrect user deletions. Unchanged
 * rows are skipped entirely so steady-state syncs cost no writes, which also
 * preserves each item's original `scrapedAt` until its content actually
 * changes upstream.
 */
async function persistChangedLibraryItemImports(args: {
    delegate: LibraryItemDelegate;
    existingByIdentity: ReadonlyMap<string, ExistingLibraryItemImport>;
    rows: readonly LibraryItemImportRow[];
    shouldAddToSmartCollections?: (row: LibraryItemImportRow) => boolean;
    upsertConcurrency: number;
    userId: string;
}): Promise<PersistedLibraryItemImports> {
    const importedKeys = new Set<string>();
    const smartCollectionItemIds = new Set<string>();
    const unchangedKeys = new Set<string>();
    const updatedKeys = new Set<string>();
    const shouldAddToSmartCollections =
        args.shouldAddToSmartCollections ??
        ((row: LibraryItemImportRow) => row.content.kind !== ITEM_KIND_FOLDER);

    await mapConcurrent(
        args.rows,
        async (row) => {
            const key = libraryItemIdentityKey(row);
            const existing = args.existingByIdentity.get(key);

            if (existing && existing.deletedAt !== null) {
                return;
            }

            if (
                existing &&
                isSameImportSnapshot(
                    existing.snapshot,
                    buildContentSnapshot(row.content)
                )
            ) {
                unchangedKeys.add(key);
                return;
            }

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

            if (existing) {
                updatedKeys.add(key);
            } else {
                importedKeys.add(key);
                if (shouldAddToSmartCollections(row)) {
                    smartCollectionItemIds.add(saved.id);
                }
            }
        },
        args.upsertConcurrency
    );

    return {
        importedCount: importedKeys.size,
        smartCollectionItemIds: [...smartCollectionItemIds],
        unchangedCount: unchangedKeys.size,
        updatedCount: updatedKeys.size,
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
    browserProfileId: string;
    rows: LibraryItemImportRow[];
    snapshotComplete: boolean;
    source: LibraryItemSource;
    userId: string;
}): Promise<
    PersistedLibraryItemImports & { prunedCount: number; pruneAborted: boolean }
> {
    // One read covers change detection and prune candidate selection; chunk
    // transactions below stay short because they skip the read phase.
    const existingRows = await prisma.libraryItem.findMany({
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

    const accumulated = {
        importedCount: 0,
        smartCollectionItemIds: new Set<string>(),
        unchangedCount: 0,
        updatedCount: 0,
    };

    // Chunked transactions instead of one long interactive transaction: a
    // mid-run failure keeps earlier chunks (upserts are idempotent by
    // identity key), the next sync re-persists the remainder, and no single
    // transaction lives long enough to hit the timeout cliff on large
    // libraries.
    for (const rowChunk of chunk(args.rows, SNAPSHOT_IMPORT_CHUNK_SIZE)) {
        const chunkResult = await prisma.$transaction(
            async (tx) =>
                persistChangedLibraryItemImports({
                    delegate: tx.libraryItem,
                    existingByIdentity,
                    rows: rowChunk,
                    upsertConcurrency: 1,
                    userId: args.userId,
                }),
            {
                maxWait: SNAPSHOT_IMPORT_TRANSACTION_MAX_WAIT_MS,
                timeout: SNAPSHOT_IMPORT_TRANSACTION_TIMEOUT_MS,
            }
        );
        accumulated.importedCount += chunkResult.importedCount;
        accumulated.unchangedCount += chunkResult.unchangedCount;
        accumulated.updatedCount += chunkResult.updatedCount;
        for (const itemId of chunkResult.smartCollectionItemIds) {
            accumulated.smartCollectionItemIds.add(itemId);
        }
    }

    if (!args.snapshotComplete) {
        log.debug("Snapshot prune skipped: partial fetch", {
            retainedCount: args.rows.length,
            source: args.source,
            userId: args.userId,
        });
        return {
            importedCount: accumulated.importedCount,
            pruneAborted: false,
            prunedCount: 0,
            smartCollectionItemIds: [...accumulated.smartCollectionItemIds],
            unchangedCount: accumulated.unchangedCount,
            updatedCount: accumulated.updatedCount,
        };
    }

    const liveRows = existingRows.filter((row) => row.deletedAt === null);
    const retainedExternalIds = args.rows.map((row) => row.externalId);
    const retainedSet = new Set(retainedExternalIds);
    const removableCount = liveRows.filter(
        (row) => !retainedSet.has(row.externalId)
    ).length;

    if (shouldAbortPrune({ liveRowCount: liveRows.length, removableCount })) {
        log.warn("Snapshot prune aborted by guard", {
            liveRowCount: liveRows.length,
            removableCount,
            source: args.source,
            userId: args.userId,
        });
        return {
            importedCount: accumulated.importedCount,
            pruneAborted: true,
            prunedCount: 0,
            smartCollectionItemIds: [...accumulated.smartCollectionItemIds],
            unchangedCount: accumulated.unchangedCount,
            updatedCount: accumulated.updatedCount,
        };
    }

    const { count: prunedCount } = await prisma.libraryItem.deleteMany({
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
        importedCount: accumulated.importedCount,
        pruneAborted: false,
        prunedCount,
        smartCollectionItemIds: [...accumulated.smartCollectionItemIds],
        unchangedCount: accumulated.unchangedCount,
        updatedCount: accumulated.updatedCount,
    };
}

export async function importLibraryItemSnapshot(args: {
    browserProfileIdsToSync?: string[];
    items: LibraryItemImportInput[];
    snapshotComplete: boolean;
    source: LibraryItemSource;
    userId: string;
}) {
    const { rows, skippedCount } = normalizeLibraryItemImportRows(args);
    const rowsByProfile = groupRowsByProfile(rows);
    const browserProfileIdsToSync = new Set(
        args.browserProfileIdsToSync?.length
            ? args.browserProfileIdsToSync
            : [DEFAULT_BROWSER_PROFILE_ID]
    );

    for (const browserProfileId of rowsByProfile.keys()) {
        browserProfileIdsToSync.add(browserProfileId);
    }

    const result = {
        importedCount: 0,
        pruneAborted: false,
        prunedCount: 0,
        skippedCount,
        smartCollectionItemIds: new Set<string>(),
        updatedCount: 0,
    };

    for (const browserProfileId of browserProfileIdsToSync) {
        const profileResult = await importSnapshotProfileRows({
            browserProfileId,
            rows: rowsByProfile.get(browserProfileId) ?? [],
            snapshotComplete: args.snapshotComplete,
            source: args.source,
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
        smartCollectionItemIds: [...result.smartCollectionItemIds],
    };
}
