import "server-only";

import * as z from "zod";
import {
    LIBRARY_ITEM_COLLECTIONS_INCLUDE,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { chunk, mapConcurrent } from "@/lib/common/array";
import {
    DEFAULT_BROWSER_PROFILE_ID,
    ITEM_KIND_BOOKMARK,
    ITEM_KIND_FOLDER,
} from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { prisma } from "@/prisma";
import { Prisma } from "@/prisma/client/client";
import { LibraryItemSource } from "@/prisma/client/enums";

import type {
    ChromeBatchLookupState,
    ChromeBookmarkNode,
    ChromeLibraryItemDelegate,
} from "./lookup";
import {
    buildChromeBookmarkUpdateData,
    buildChromeLookupState,
    chromeDuplicateKey,
    normalizeChromeBookmarkRecord,
    promoteAliasToPrimary,
    removeChromeLookupRow,
    replaceChromeLookupRow,
    upsertChromeLookupRow,
} from "./lookup";

const log = createLogger("library:chrome-bookmarks");
const CHROME_BOOKMARK_SYNC_BATCH_SIZE = 25;
const CHROME_PRUNE_CONCURRENCY = 8;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const chromeBookmarkNodeSchema = z.object({
    dateAdded: z.number().int().nonnegative().optional(),
    dateGroupModified: z.number().int().nonnegative().optional(),
    externalId: z.string().min(1),
    index: z.number().int().nonnegative().optional(),
    kind: z.enum([ITEM_KIND_BOOKMARK, ITEM_KIND_FOLDER]),
    parentExternalId: z.string().min(1).optional(),
    title: z.string().optional(),
    url: z.url().optional(),
});

const chromeBookmarkEventSchema = z
    .object({
        bookmark: chromeBookmarkNodeSchema.optional(),
        externalId: z.string().min(1).optional(),
        occurredAt: z.string().optional(),
        snapshotExternalIds: z.array(z.string().min(1)).optional(),
        type: z.enum(["delete", "import_complete", "move", "upsert"]),
    })
    .superRefine((value, ctx) => {
        if (
            (value.type === "upsert" || value.type === "move") &&
            !value.bookmark
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "bookmark is required for upsert and move events",
                path: ["bookmark"],
            });
        }
        if (value.type === "delete" && !value.externalId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "externalId is required for delete events",
                path: ["externalId"],
            });
        }
        if (
            value.type === "import_complete" &&
            (!value.snapshotExternalIds ||
                value.snapshotExternalIds.length === 0)
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    "snapshotExternalIds is required for import_complete events",
                path: ["snapshotExternalIds"],
            });
        }
    });

export const chromeBookmarkSyncBodySchema = z.object({
    browserProfileId: z.string().min(1).default(DEFAULT_BROWSER_PROFILE_ID),
    device: z
        .object({
            id: z.string().min(1),
            name: z.string().optional(),
            os: z.string().optional(),
        })
        .optional(),
    events: z.array(chromeBookmarkEventSchema).min(1),
    mode: z
        .enum(["continuous_sync", "one_time_import"])
        .default("continuous_sync"),
    syncedAt: z.string().optional(),
});

export type ChromeBookmarkSyncBody = z.infer<
    typeof chromeBookmarkSyncBodySchema
>;

interface ChromeSyncResult {
    deduped: number;
    deleted: number;
    processed: number;
    pruned: number;
    smartCollectionItemIds: string[];
    upserted: number;
}

interface ChromeSyncAccumulator {
    deduped: number;
    deleted: number;
    processed: number;
    pruned: number;
    smartCollectionItemIds: string[];
    upserted: number;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

/**
 * Wraps the Prisma delegate's `update` so a tombstoning that races between the
 * in-memory lookup and the database write (P2025) becomes a silent no-op
 * instead of a sync 500. Mirrors the `deleteMany` path already used by the
 * delete-event branch — that gate is `deletedAt: null` in the `where`, and
 * Prisma resolves zero-row matches to a thrown `P2025`. Returning `null` lets
 * callers skip the `replaceChromeLookupRow` call without changing their
 * control flow.
 */
async function updateLiveChromeDelegate(
    delegate: ChromeLibraryItemDelegate,
    args: Parameters<ChromeLibraryItemDelegate["update"]>[0]
): Promise<Awaited<ReturnType<ChromeLibraryItemDelegate["update"]>> | null> {
    try {
        return await delegate.update(args);
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
        ) {
            return null;
        }
        throw error;
    }
}

async function handleChromeDeleteEvent(args: {
    delegate: ChromeLibraryItemDelegate;
    externalId: string;
    lookup: ChromeBatchLookupState;
}): Promise<boolean> {
    const exact = args.lookup.rowsByPrimaryExternalId.get(args.externalId);
    // Lookups are pre-filtered to live rows, but the gate below is the last
    // line of defense so a stale row that became tombstoned between
    // buildChromeLookupState and delete cannot be hard-removed by an
    // out-of-order Chrome delete event.
    const liveWhere = { deletedAt: null, id: exact?.id ?? "" };
    if (exact) {
        if (exact.sourceAliasIds.length > 0) {
            const [nextPrimary, ...remainingAliases] = exact.sourceAliasIds;
            const updated = await updateLiveChromeDelegate(args.delegate, {
                data: {
                    externalId: nextPrimary,
                    sourceAliasIds: [exact.externalId, ...remainingAliases],
                },
                where: liveWhere,
            });
            if (updated) {
                replaceChromeLookupRow(args.lookup, exact, updated);
            }
        } else {
            await args.delegate.deleteMany({
                where: liveWhere,
            });
            // Always remove from the lookup — the row is either gone now or
            // was already tombstoned. Either way, subsequent delete events
            // for the same externalId within this batch should be a no-op.
            removeChromeLookupRow(args.lookup, exact);
        }
        return true;
    }

    const aliasOwnerId = args.lookup.aliasToPrimaryId.get(args.externalId);
    const aliasOwner = aliasOwnerId
        ? args.lookup.rowsById.get(aliasOwnerId)
        : null;
    if (!aliasOwner) {
        return false;
    }

    const updated = await updateLiveChromeDelegate(args.delegate, {
        data: {
            sourceAliasIds: aliasOwner.sourceAliasIds.filter(
                (value) => value !== args.externalId
            ),
        },
        where: { deletedAt: null, id: aliasOwner.id },
    });
    if (updated) {
        replaceChromeLookupRow(args.lookup, aliasOwner, updated);
    }
    return true;
}

async function handleChromeBookmarkWriteEvent(args: {
    bookmark: ChromeBookmarkNode;
    browserProfileId: string;
    delegate: ChromeLibraryItemDelegate;
    device: ChromeBookmarkSyncBody["device"];
    lookup: ChromeBatchLookupState;
    occurredAt: string | undefined;
    userId: string;
}): Promise<{
    deduped: boolean;
    smartCollectionItemId?: string;
}> {
    const record = normalizeChromeBookmarkRecord(
        args.browserProfileId,
        args.bookmark,
        args.occurredAt,
        args.device
    );
    const exact = args.lookup.rowsByPrimaryExternalId.get(record.externalId);
    if (exact) {
        const updated = await updateLiveChromeDelegate(args.delegate, {
            data: buildChromeBookmarkUpdateData(record),
            where: { deletedAt: null, id: exact.id },
        });
        if (updated) {
            replaceChromeLookupRow(args.lookup, exact, updated);
        }
        return { deduped: false };
    }

    const aliasOwnerId = args.lookup.aliasToPrimaryId.get(record.externalId);
    const aliasOwner = aliasOwnerId
        ? args.lookup.rowsById.get(aliasOwnerId)
        : null;
    if (aliasOwner) {
        const promoted = await promoteAliasToPrimary(
            args.delegate,
            aliasOwner,
            record.externalId
        );
        const updated = await updateLiveChromeDelegate(args.delegate, {
            data: buildChromeBookmarkUpdateData(record),
            where: { id: promoted.id },
        });
        if (updated) {
            replaceChromeLookupRow(args.lookup, aliasOwner, updated);
        }
        return { deduped: false };
    }

    const duplicateKey = chromeDuplicateKey(
        record.kind,
        record.url,
        record.caption
    );
    const duplicateId = duplicateKey
        ? args.lookup.duplicateToPrimaryId.get(duplicateKey)
        : null;
    const duplicate = duplicateId
        ? args.lookup.rowsById.get(duplicateId)
        : null;
    if (duplicate) {
        const aliasIds = new Set(duplicate.sourceAliasIds);
        if (duplicate.externalId !== record.externalId) {
            aliasIds.add(record.externalId);
        }
        const updated = await args.delegate.update({
            data: {
                ...buildChromeBookmarkUpdateData(record),
                sourceAliasIds: [...aliasIds],
            },
            where: { id: duplicate.id },
        });
        replaceChromeLookupRow(args.lookup, duplicate, updated);
        return { deduped: true };
    }

    const created = await args.delegate.create({
        data: {
            ...record,
            user: {
                connect: { id: args.userId },
            },
        },
    });
    upsertChromeLookupRow(args.lookup, created);
    return {
        deduped: false,
        smartCollectionItemId:
            created.kind === ITEM_KIND_BOOKMARK ? created.id : undefined,
    };
}

async function pruneChromeSnapshot(
    delegate: ChromeLibraryItemDelegate,
    userId: string,
    browserProfileId: string,
    snapshotExternalIds: string[]
): Promise<number> {
    const seen = new Set(snapshotExternalIds);
    const rows = await delegate.findMany({
        select: {
            externalId: true,
            id: true,
            sourceAliasIds: true,
        },
        where: {
            browserProfileId,
            deletedAt: null,
            source: LibraryItemSource.chrome_bookmarks,
            userId,
        },
    });

    const candidates = rows.filter((row) => !seen.has(row.externalId));
    // externalId is unique per (user, source, profile). Pre-claim remap
    // targets so concurrent workers never race two rows onto the same id.
    // If the target is already live (or claimed by an earlier candidate),
    // the stale row is a duplicate and must be deleted instead.
    const reservedExternalIds = new Set(rows.map((row) => row.externalId));
    const remaps: Array<{
        aliasCandidate: string;
        row: (typeof candidates)[number];
    }> = [];
    const deletes: typeof candidates = [];

    for (const row of candidates) {
        const aliasCandidate = row.sourceAliasIds.find(
            (aliasId) => seen.has(aliasId) && !reservedExternalIds.has(aliasId)
        );
        if (aliasCandidate) {
            reservedExternalIds.add(aliasCandidate);
            remaps.push({ aliasCandidate, row });
            continue;
        }
        deletes.push(row);
    }

    // Bound concurrency so a large prune does not open unbounded DB writes.
    // Isolate per-row failures so one unique/DB error cannot skip remaps or
    // strand deletes — next snapshot will retry leftover stale rows.
    await mapConcurrent(
        remaps,
        async ({ aliasCandidate, row }) => {
            try {
                await delegate.updateMany({
                    data: {
                        externalId: aliasCandidate,
                        sourceAliasIds: [
                            row.externalId,
                            ...row.sourceAliasIds.filter(
                                (aliasId) => aliasId !== aliasCandidate
                            ),
                        ],
                    },
                    where: { deletedAt: null, id: row.id },
                });
            } catch (error) {
                log.error("Failed to remap chrome library item during prune", {
                    error:
                        error instanceof Error ? error.message : String(error),
                    externalId: row.externalId,
                    itemId: row.id,
                    targetExternalId: aliasCandidate,
                });
            }
        },
        CHROME_PRUNE_CONCURRENCY
    );

    const deleteOutcomes = await mapConcurrent(
        deletes,
        async (row) => {
            try {
                await delegate.deleteMany({
                    where: { deletedAt: null, id: row.id },
                });
                return true;
            } catch (error) {
                log.error("Failed to delete chrome library item during prune", {
                    error:
                        error instanceof Error ? error.message : String(error),
                    externalId: row.externalId,
                    itemId: row.id,
                });
                return false;
            }
        },
        CHROME_PRUNE_CONCURRENCY
    );

    return deleteOutcomes.filter(Boolean).length;
}

async function processChromeBookmarkEventBatch(args: {
    browserProfileId: string;
    device: ChromeBookmarkSyncBody["device"];
    events: ChromeBookmarkSyncBody["events"][number][];
    userId: string;
}): Promise<Omit<ChromeSyncResult, "processed" | "pruned">> {
    const delegate = prisma.libraryItem;
    const existingRows = await delegate.findMany({
        where: {
            browserProfileId: args.browserProfileId,
            // Tombstones are intentionally absent from the incremental sync
            // loop: the bookmark is gone from Chrome but the user has it in
            // their trash. Chrome sync must NEVER hard-delete tombstoned
            // items — the user has 30 days to restore. Snapshot prune
            // (already filtered) is the only path that may eventually purge.
            deletedAt: null,
            source: LibraryItemSource.chrome_bookmarks,
            userId: args.userId,
        },
    });
    const lookup = buildChromeLookupState(existingRows);
    let deleted = 0;
    let deduped = 0;
    const smartCollectionItemIds = new Set<string>();
    let upserted = 0;

    for (const event of args.events) {
        if (event.type === "delete") {
            if (
                await handleChromeDeleteEvent({
                    delegate,
                    externalId: event.externalId ?? "",
                    lookup,
                })
            ) {
                deleted += 1;
            }
            continue;
        }

        const { bookmark } = event;
        if (!bookmark) {
            continue;
        }

        const result = await handleChromeBookmarkWriteEvent({
            bookmark,
            browserProfileId: args.browserProfileId,
            delegate,
            device: args.device,
            lookup,
            occurredAt: event.occurredAt,
            userId: args.userId,
        });

        upserted += 1;
        if (result.deduped) {
            deduped += 1;
        }
        if (result.smartCollectionItemId) {
            smartCollectionItemIds.add(result.smartCollectionItemId);
        }
    }

    return {
        deduped,
        deleted,
        smartCollectionItemIds: [...smartCollectionItemIds],
        upserted,
    };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function applyChromeBookmarkSyncEvents(
    userId: string,
    body: ChromeBookmarkSyncBody
): Promise<ChromeSyncResult> {
    const browserProfileId =
        body.browserProfileId || DEFAULT_BROWSER_PROFILE_ID;
    const accumulator: ChromeSyncAccumulator = {
        deduped: 0,
        deleted: 0,
        processed: body.events.length,
        pruned: 0,
        smartCollectionItemIds: [],
        upserted: 0,
    };

    const snapshotEvents = body.events.filter(
        (event) => event.type === "import_complete"
    );
    const mutationEvents = body.events.filter(
        (event) => event.type !== "import_complete"
    );

    for (const batch of chunk(
        mutationEvents,
        CHROME_BOOKMARK_SYNC_BATCH_SIZE
    )) {
        const result = await processChromeBookmarkEventBatch({
            browserProfileId,
            device: body.device,
            events: batch,
            userId,
        });
        accumulator.deduped += result.deduped;
        accumulator.deleted += result.deleted;
        accumulator.smartCollectionItemIds.push(
            ...result.smartCollectionItemIds
        );
        accumulator.upserted += result.upserted;
    }

    for (const event of snapshotEvents) {
        accumulator.pruned += await pruneChromeSnapshot(
            prisma.libraryItem,
            userId,
            browserProfileId,
            event.snapshotExternalIds ?? []
        );
    }

    return {
        ...accumulator,
        smartCollectionItemIds: [
            ...new Set(accumulator.smartCollectionItemIds),
        ],
    };
}

export async function purgeChromeBookmarksForUser(
    userId: string
): Promise<number> {
    const result = await prisma.libraryItem.deleteMany({
        where: {
            // Tombstones survive disconnect/reconnect so the user can restore
            // bookmarks they deliberately trashed before booting Chrome.
            deletedAt: null,
            source: LibraryItemSource.chrome_bookmarks,
            userId,
        },
    });

    log.info("Purged Chrome bookmarks", {
        count: result.count,
        userId,
    });

    return result.count;
}

export function getChromeBookmarkItemForUserByExternalId(
    userId: string,
    externalId: string
): Promise<LibraryItemWithCollections | null> {
    return prisma.libraryItem.findFirst({
        include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
        where: {
            browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
            deletedAt: null,
            OR: [
                {
                    externalId,
                },
                {
                    sourceAliasIds: {
                        has: externalId,
                    },
                },
            ],
            source: LibraryItemSource.chrome_bookmarks,
            userId,
        },
    });
}
