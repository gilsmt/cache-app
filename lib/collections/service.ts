import "server-only";

import { templateDescriptionForNameKey } from "@/lib/collections/templates";
import {
    deduplicateLibraryItems,
    LIBRARY_COLLECTION_TAG_SELECT,
    LIBRARY_ITEM_COLLECTIONS_INCLUDE,
    LIBRARY_ITEM_COLLECTIONS_SELECT,
    type LibraryCollectionSummary,
    type LibraryCollectionTag,
    type LibraryCollectionTagRecord,
    type LibraryItemWithCollections,
    toLibraryCollectionSummary,
    toLibraryCollectionSummaryFromTagRecord,
    toLibraryCollectionTag,
    toLibraryItemWithCollections,
    uniqueLibraryItemSources,
} from "@/lib/collections/utils";
import {
    FREE_LIBRARY_PREVIEW_ITEMS,
    ITEM_KIND_FOLDER,
    LIBRARY_ITEM_TRASH_WINDOW_DAYS,
    SORT_ASC,
    SORT_DESC,
} from "@/lib/common/constants";
import {
    getIncrementedName,
    normalizeCollectionName,
} from "@/lib/common/string";
import { resolveCobaltDownloadUrl } from "@/lib/integrations/cobalt/service";
import { prisma } from "@/prisma";
import { Prisma } from "@/prisma/client/client";
import type {
    CollectionPriority,
    LibraryItemSource,
} from "@/prisma/client/enums";
import { LibraryCollectionError } from "./error";

const COLLECTION_LIST_LIMIT_MAX = 9999;
const LIBRARY_ITEMS_PAGE_LIMIT_DEFAULT = 9999;
const LIBRARY_ITEMS_PAGE_LIMIT_MAX = 9999;
/**
 * Rows per membership INSERT statement. Two params per row keeps every
 * statement far under the Postgres 65535 parameter cap.
 */
const COLLECTION_ITEMS_INSERT_CHUNK_SIZE = 1000;
const LIBRARY_ITEM_TRASH_WINDOW_MS =
    LIBRARY_ITEM_TRASH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RECENTLY_DELETED_LIMIT_MAX = 200;

type CollectionTransaction = Prisma.TransactionClient;

interface CollectionLookupOwned {
    id: string;
    name: string;
    nameKey: string;
}

interface LibraryItemLookupOwned {
    id: string;
    source: LibraryItemSource;
}

interface LibraryItemCollectionsOwned {
    collections: Array<{ id: string }>;
    id: string;
}

function toIdConnections(ids: readonly string[]): Array<{
    id: string;
}> {
    return ids.map((id) => ({ id }));
}

function getChangedCollectionIds(
    previousIds: readonly string[],
    nextIds: readonly string[]
): string[] {
    if (previousIds.length === 0 && nextIds.length === 0) {
        return [];
    }
    const nextIdSet = new Set(nextIds);
    const previousIdSet = new Set(previousIds);
    const changed: string[] = [];
    for (const id of previousIdSet) {
        if (!nextIdSet.has(id)) {
            changed.push(id);
        }
    }
    for (const id of nextIdSet) {
        if (!previousIdSet.has(id)) {
            changed.push(id);
        }
    }
    return changed;
}

async function touchCollectionsUpdatedAt(
    tx: CollectionTransaction,
    args: { collectionIds: readonly string[]; now: Date; userId: string }
): Promise<void> {
    if (args.collectionIds.length === 0) {
        return;
    }
    await tx.collection.updateMany({
        data: { updatedAt: args.now },
        where: { id: { in: [...args.collectionIds] }, userId: args.userId },
    });
}

function createCollectionError(args: {
    code: "duplicate_name" | "not_found" | "not_trashed";
    message: string;
    operation: string;
}): InstanceType<typeof LibraryCollectionError> {
    return new LibraryCollectionError(args);
}

function throwCollectionNotFound(operation: string, message: string): never {
    throw createCollectionError({
        code: "not_found",
        message,
        operation,
    });
}

function throwCollectionNameDuplicate(
    operation: string,
    message = "A collection with that name already exists."
): never {
    throw createCollectionError({
        code: "duplicate_name",
        message,
        operation,
    });
}

function buildUniqueCollectionName(
    sourceName: string,
    existingNames: string[]
): string {
    const uniqueName = getIncrementedName(sourceName, [...existingNames]);
    return normalizeCollectionName(uniqueName).name;
}

async function requireCollectionOwned(
    tx: CollectionTransaction,
    args: {
        collectionId: string;
        message: string;
        operation: string;
        userId: string;
    }
): Promise<CollectionLookupOwned> {
    const collection = await tx.collection.findFirst({
        select: {
            id: true,
            name: true,
            nameKey: true,
        },
        where: {
            id: args.collectionId,
            userId: args.userId,
        },
    });

    if (!collection) {
        throwCollectionNotFound(args.operation, args.message);
    }

    return collection;
}

async function ensureCollectionNameAvailable(
    tx: CollectionTransaction,
    args: {
        excludeCollectionId?: string;
        message?: string;
        normalizedNameKey: string;
        operation: string;
        userId: string;
    }
): Promise<void> {
    const existingCollection = await tx.collection.findFirst({
        select: { id: true },
        where: {
            id: args.excludeCollectionId
                ? { not: args.excludeCollectionId }
                : undefined,
            nameKey: args.normalizedNameKey,
            userId: args.userId,
        },
    });

    if (existingCollection) {
        throwCollectionNameDuplicate(args.operation, args.message);
    }
}

async function findCollectionSummariesOwnedByIds(
    tx: CollectionTransaction,
    args: {
        collectionIds: string[];
        userId: string;
    }
): Promise<LibraryCollectionSummary[]> {
    if (args.collectionIds.length === 0) {
        return [];
    }

    const collections = await tx.collection.findMany({
        orderBy: {
            name: SORT_ASC,
        },
        select: {
            _count: {
                select: {
                    // Mirror `listCollections` so the sidebar/counts agree on
                    // what an item is: live-only, no folders, no tombstones.
                    items: {
                        where: {
                            deletedAt: null,
                            kind: { not: ITEM_KIND_FOLDER },
                        },
                    },
                },
            },
            ...LIBRARY_COLLECTION_TAG_SELECT,
            items: {
                select: {
                    source: true,
                },
                where: {
                    deletedAt: null,
                    kind: { not: ITEM_KIND_FOLDER },
                },
            },
        },
        where: {
            id: {
                in: args.collectionIds,
            },
            userId: args.userId,
        },
    });

    return collections.map((collection) =>
        toLibraryCollectionSummary(collection)
    );
}

async function findCollectionTagsOwnedByIds(
    tx: CollectionTransaction,
    args: {
        collectionIds: string[];
        userId: string;
    }
): Promise<LibraryCollectionTagRecord[]> {
    if (args.collectionIds.length === 0) {
        return [];
    }

    const collections = await tx.collection.findMany({
        orderBy: {
            name: SORT_ASC,
        },
        select: LIBRARY_COLLECTION_TAG_SELECT,
        where: {
            id: {
                in: args.collectionIds,
            },
            userId: args.userId,
        },
    });

    return collections;
}

async function requireLibraryItemsOwnedWithCollections(
    tx: CollectionTransaction,
    args: {
        itemIds: string[];
        message: string;
        operation: string;
        userId: string;
    }
): Promise<LibraryItemCollectionsOwned[]> {
    const items = await tx.libraryItem.findMany({
        select: {
            collections: {
                select: {
                    id: true,
                },
            },
            id: true,
        },
        where: {
            deletedAt: null,
            id: {
                in: args.itemIds,
            },
            userId: args.userId,
        },
    });

    if (items.length !== args.itemIds.length) {
        throwCollectionNotFound(args.operation, args.message);
    }

    const itemById = new Map(items.map((item) => [item.id, item]));
    return args.itemIds.map((itemId) => {
        const item = itemById.get(itemId);
        if (!item) {
            throwCollectionNotFound(args.operation, args.message);
        }
        return item;
    });
}

async function deleteSharedCollectionItems(
    tx: CollectionTransaction,
    args: {
        collectionIds: string[];
        itemIds: string[];
    }
): Promise<void> {
    if (args.collectionIds.length === 0 || args.itemIds.length === 0) {
        return;
    }

    await tx.$executeRaw`
        DELETE FROM "_CollectionToLibraryItem"
        WHERE "A" IN (${Prisma.join(args.collectionIds)})
            AND "B" IN (${Prisma.join(args.itemIds)})
    `;
}

async function insertSharedCollectionItems(
    tx: CollectionTransaction,
    args: {
        collectionIds: string[];
        itemIds: string[];
    }
): Promise<void> {
    if (args.collectionIds.length === 0 || args.itemIds.length === 0) {
        return;
    }

    // Chunk the cross product so no statement exceeds
    // COLLECTION_ITEMS_INSERT_CHUNK_SIZE rows. Sequential awaits are
    // required: the interactive transaction holds a single connection.
    for (const collectionId of args.collectionIds) {
        for (
            let offset = 0;
            offset < args.itemIds.length;
            offset += COLLECTION_ITEMS_INSERT_CHUNK_SIZE
        ) {
            const chunk = args.itemIds.slice(
                offset,
                offset + COLLECTION_ITEMS_INSERT_CHUNK_SIZE
            );
            await tx.$executeRaw`
                INSERT INTO "_CollectionToLibraryItem" ("A", "B")
                VALUES ${Prisma.join(
                    chunk.map(
                        (itemId) => Prisma.sql`(${collectionId}, ${itemId})`
                    )
                )}
                ON CONFLICT DO NOTHING
            `;
        }
    }
}

async function requireLibraryItemOwnedWithCollections(
    tx: CollectionTransaction,
    args: {
        itemId: string;
        message: string;
        operation: string;
        userId: string;
    }
): Promise<LibraryItemCollectionsOwned> {
    const item = await tx.libraryItem.findFirst({
        select: {
            collections: {
                select: {
                    id: true,
                },
            },
            id: true,
        },
        where: {
            deletedAt: null,
            id: args.itemId,
            userId: args.userId,
        },
    });

    if (!item) {
        throwCollectionNotFound(args.operation, args.message);
    }

    return item;
}

async function requireLibraryItemOwned(
    tx: CollectionTransaction,
    args: {
        itemId: string;
        message: string;
        operation: string;
        userId: string;
    }
): Promise<LibraryItemLookupOwned> {
    const item = await tx.libraryItem.findFirst({
        select: { id: true, source: true },
        where: {
            deletedAt: null,
            id: args.itemId,
            userId: args.userId,
        },
    });

    if (!item) {
        throwCollectionNotFound(args.operation, args.message);
    }

    return item;
}

async function requireLibraryItemsOwned(
    tx: CollectionTransaction,
    args: {
        itemIds: string[];
        message: string;
        operation: string;
        userId: string;
    }
): Promise<LibraryItemLookupOwned[]> {
    const items = await tx.libraryItem.findMany({
        select: { id: true, source: true },
        where: {
            deletedAt: null,
            id: { in: args.itemIds },
            userId: args.userId,
        },
    });

    if (items.length !== args.itemIds.length) {
        throwCollectionNotFound(args.operation, args.message);
    }

    return items;
}

export async function downloadMedia(url: string): Promise<string> {
    const result = await resolveCobaltDownloadUrl(url);
    if (result.status === "ERROR") {
        throw new Error(
            result.message || "The download service is currently unavailable."
        );
    }
    return result.downloadUrl;
}

export function createCollection({
    assignToItemId,
    description,
    name,
    userId,
}: {
    assignToItemId?: string;
    description?: string;
    name: string;
    userId: string;
}): Promise<{
    assignedItemId: string | null;
    collection: LibraryCollectionSummary;
}> {
    const normalized = normalizeCollectionName(name);
    const resolvedDescription =
        description ?? templateDescriptionForNameKey(normalized.nameKey);

    return prisma.$transaction(async (tx) => {
        const assignedItem = assignToItemId
            ? await requireLibraryItemOwned(tx, {
                  itemId: assignToItemId,
                  message: "We couldn't find that saved item to tag it.",
                  operation: "createCollection",
                  userId,
              })
            : null;

        await ensureCollectionNameAvailable(tx, {
            normalizedNameKey: normalized.nameKey,
            operation: "createCollection",
            userId,
        });

        const collection = await tx.collection.create({
            data: {
                description: resolvedDescription,
                items: assignedItem
                    ? { connect: { id: assignedItem.id } }
                    : undefined,
                name: normalized.name,
                nameKey: normalized.nameKey,
                userId,
            },
            select: LIBRARY_COLLECTION_TAG_SELECT,
        });

        return {
            assignedItemId: assignedItem?.id ?? null,
            collection: toLibraryCollectionSummaryFromTagRecord(
                collection,
                assignedItem ? [assignedItem] : []
            ),
        };
    });
}

export function createCollectionFromItems({
    description,
    itemIds,
    name,
    userId,
}: {
    description?: string;
    itemIds: string[];
    name: string;
    userId: string;
}): Promise<{
    assignedItemIds: string[];
    collection: LibraryCollectionSummary;
}> {
    const normalized = normalizeCollectionName(name);
    const resolvedDescription =
        description ?? templateDescriptionForNameKey(normalized.nameKey);

    return prisma.$transaction(async (tx) => {
        await ensureCollectionNameAvailable(tx, {
            normalizedNameKey: normalized.nameKey,
            operation: "createCollectionFromItems",
            userId,
        });

        const matchingItems = await requireLibraryItemsOwned(tx, {
            itemIds,
            message: "Some of those saved items are no longer available.",
            operation: "createCollectionFromItems",
            userId,
        });

        // Create the row first, then attach memberships with a chunked raw
        // INSERT. A Prisma nested `connect` fans out per item and degrades
        // past a few hundred ids; the raw statement writes 1000 rows each.
        const collection = await tx.collection.create({
            data: {
                description: resolvedDescription,
                name: normalized.name,
                nameKey: normalized.nameKey,
                userId,
            },
            select: LIBRARY_COLLECTION_TAG_SELECT,
        });

        await insertSharedCollectionItems(tx, {
            collectionIds: [collection.id],
            itemIds,
        });

        return {
            assignedItemIds: itemIds,
            collection: toLibraryCollectionSummaryFromTagRecord(
                collection,
                matchingItems
            ),
        };
    });
}

export function deleteCollection({
    collectionId,
    userId,
}: {
    collectionId: string;
    userId: string;
}): Promise<Pick<LibraryCollectionSummary, "id" | "name">> {
    return prisma.$transaction(async (tx) => {
        const collection = await requireCollectionOwned(tx, {
            collectionId,
            message: "This collection was already removed.",
            operation: "deleteCollection",
            userId,
        });

        await tx.collection.delete({
            where: { id: collection.id },
        });

        return collection;
    });
}

export function duplicateCollection({
    collectionId,
    userId,
}: {
    collectionId: string;
    userId: string;
}): Promise<{
    assignedItemIds: string[];
    collection: LibraryCollectionSummary;
}> {
    const operation = "duplicateCollection";

    return prisma.$transaction(async (tx) => {
        const sourceCollection = await tx.collection.findFirst({
            select: {
                description: true,
                items: {
                    select: { id: true, source: true },
                    where: { deletedAt: null },
                },
                name: true,
                priority: true,
            },
            where: { id: collectionId, userId },
        });

        if (!sourceCollection) {
            throwCollectionNotFound(
                operation,
                "That collection is no longer available."
            );
        }

        const existingNames = await tx.collection.findMany({
            select: { name: true },
            where: { userId },
        });

        const nextName = buildUniqueCollectionName(
            sourceCollection.name,
            existingNames.map((collection) => collection.name)
        );
        const normalized = normalizeCollectionName(nextName);

        const duplicatedCollection = await tx.collection.create({
            data: {
                description: sourceCollection.description,
                name: normalized.name,
                nameKey: normalized.nameKey,
                priority: sourceCollection.priority,
                userId,
            },
            select: LIBRARY_COLLECTION_TAG_SELECT,
        });

        // Same chunked raw INSERT as createCollectionFromItems: a nested
        // `connect` fans out per item and degrades on large collections.
        if (sourceCollection.items.length > 0) {
            await insertSharedCollectionItems(tx, {
                collectionIds: [duplicatedCollection.id],
                itemIds: sourceCollection.items.map((item) => item.id),
            });
        }

        return {
            assignedItemIds: sourceCollection.items.map((item) => item.id),
            collection: toLibraryCollectionSummaryFromTagRecord(
                duplicatedCollection,
                sourceCollection.items
            ),
        };
    });
}

export function updateCollectionPriority({
    collectionId,
    priority,
    userId,
}: {
    collectionId: string;
    priority: CollectionPriority;
    userId: string;
}): Promise<LibraryCollectionTag> {
    return prisma.$transaction(async (tx) => {
        const collection = await requireCollectionOwned(tx, {
            collectionId,
            message: "That collection is no longer available.",
            operation: "updateCollectionPriority",
            userId,
        });

        const updatedCollection = await tx.collection.update({
            data: { priority },
            select: LIBRARY_COLLECTION_TAG_SELECT,
            where: { id: collection.id },
        });

        return toLibraryCollectionTag(updatedCollection);
    });
}

export function renameCollection({
    collectionId,
    name,
    userId,
}: {
    collectionId: string;
    name: string;
    userId: string;
}): Promise<LibraryCollectionTag> {
    const normalized = normalizeCollectionName(name);

    return prisma.$transaction(async (tx) => {
        const collection = await tx.collection.findFirst({
            select: LIBRARY_COLLECTION_TAG_SELECT,
            where: { id: collectionId, userId },
        });

        if (!collection) {
            throwCollectionNotFound(
                "renameCollection",
                "That collection is no longer available."
            );
        }

        if (collection.name === normalized.name) {
            return toLibraryCollectionTag(collection);
        }

        await ensureCollectionNameAvailable(tx, {
            excludeCollectionId: collection.id,
            normalizedNameKey: normalized.nameKey,
            operation: "renameCollection",
            userId,
        });

        const updatedCollection = await tx.collection.update({
            data: {
                name: normalized.name,
                nameKey: normalized.nameKey,
            },
            select: LIBRARY_COLLECTION_TAG_SELECT,
            where: { id: collection.id },
        });

        return toLibraryCollectionTag(updatedCollection);
    });
}

export function deleteLibraryItem({
    itemId,
    userId,
}: {
    itemId: string;
    userId: string;
}): Promise<{
    collectionSummaries: LibraryCollectionSummary[];
    itemId: string;
}> {
    return trashLibraryItem({ itemId, userId });
}

export function trashLibraryItem({
    itemId,
    userId,
}: {
    itemId: string;
    userId: string;
}): Promise<{
    collectionSummaries: LibraryCollectionSummary[];
    itemId: string;
}> {
    return prisma.$transaction(async (tx) => {
        const item = await tx.libraryItem.findFirst({
            select: {
                collections: {
                    select: {
                        id: true,
                    },
                },
                deletedAt: true,
                id: true,
            },
            where: {
                deletedAt: null,
                id: itemId,
                userId,
            },
        });

        if (!item) {
            throw createCollectionError({
                code: "not_found",
                message: "This saved item was already removed.",
                operation: "trashLibraryItem",
            });
        }

        const now = new Date();
        await tx.libraryItem.update({
            data: {
                deletedAt: now,
            },
            where: {
                id: item.id,
            },
        });

        await tx.libraryActivityEvent.create({
            data: {
                kind: "item_deleted",
                libraryItemId: item.id,
                occurredAt: now,
                userId,
            },
        });

        return {
            collectionSummaries: await findCollectionSummariesOwnedByIds(tx, {
                collectionIds: item.collections.map(
                    (collection) => collection.id
                ),
                userId,
            }),
            itemId: item.id,
        };
    });
}

/**
 * Soft-deletes every live owned item among `itemIds`. Missing or already-trashed
 * ids are skipped (partial success) so bulk flows like remove-duplicates do not
 * fail an entire batch for one stale id. Returns only the ids this call trashed.
 */
export function trashLibraryItems({
    itemIds,
    userId,
}: {
    itemIds: string[];
    userId: string;
}): Promise<{
    collectionSummaries: LibraryCollectionSummary[];
    itemIds: string[];
}> {
    return prisma.$transaction(async (tx) => {
        const items = await tx.libraryItem.findMany({
            select: {
                collections: {
                    select: {
                        id: true,
                    },
                },
                id: true,
            },
            where: {
                deletedAt: null,
                id: {
                    in: itemIds,
                },
                userId,
            },
        });

        if (items.length === 0) {
            return {
                collectionSummaries: [],
                itemIds: [],
            };
        }

        const now = new Date();
        const candidateIds = items.map((item) => item.id);
        const trashedItems = await tx.libraryItem.updateManyAndReturn({
            data: {
                deletedAt: now,
            },
            select: {
                id: true,
            },
            where: {
                deletedAt: null,
                id: {
                    in: candidateIds,
                },
                userId,
            },
        });
        const trashedItemIds = trashedItems.map((item) => item.id);

        if (trashedItemIds.length > 0) {
            await tx.libraryActivityEvent.createMany({
                data: trashedItemIds.map((libraryItemId) => ({
                    kind: "item_deleted" as const,
                    libraryItemId,
                    occurredAt: now,
                    userId,
                })),
            });
        }

        const trashedItemIdSet = new Set(trashedItemIds);
        const collectionIds = Array.from(
            new Set(
                items
                    .filter((item) => trashedItemIdSet.has(item.id))
                    .flatMap((item) =>
                        item.collections.map((collection) => collection.id)
                    )
            )
        );

        return {
            collectionSummaries: await findCollectionSummariesOwnedByIds(tx, {
                collectionIds,
                userId,
            }),
            itemIds: trashedItemIds,
        };
    });
}

interface RestoreLibraryItemArgs {
    itemId: string;
    userId: string;
}

interface RestoreLibraryItemResult {
    collectionSummaries: LibraryCollectionSummary[];
    itemId: string;
}

/**
 * Restores a tombstoned item back to the library. Items already restored or
 * never trashed surface as `not_found`; items currently in the trash are
 * brought back via a single update plus an `item_restored` activity event.
 * Collection summaries are returned so callers can refresh sidebar counts.
 */
export function restoreLibraryItem({
    itemId,
    userId,
}: RestoreLibraryItemArgs): Promise<RestoreLibraryItemResult> {
    return prisma.$transaction(async (tx) => {
        const item = await tx.libraryItem.findFirst({
            select: {
                collections: {
                    select: {
                        id: true,
                    },
                },
                deletedAt: true,
                id: true,
            },
            where: {
                deletedAt: { not: null },
                id: itemId,
                userId,
            },
        });

        if (!item) {
            throw createCollectionError({
                code: "not_found",
                message: "That saved item is no longer in Recently deleted.",
                operation: "restoreLibraryItem",
            });
        }

        const now = new Date();
        await tx.libraryItem.update({
            data: { deletedAt: null },
            where: { id: item.id },
        });
        await tx.libraryActivityEvent.create({
            data: {
                kind: "item_restored",
                libraryItemId: item.id,
                occurredAt: now,
                userId,
            },
        });

        return {
            collectionSummaries: await findCollectionSummariesOwnedByIds(tx, {
                collectionIds: item.collections.map(
                    (collection) => collection.id
                ),
                userId,
            }),
            itemId: item.id,
        };
    });
}

interface PurgeLibraryItemArgs {
    itemId: string;
    userId: string;
}

interface PurgeLibraryItemResult {
    itemId: string;
}

/**
 * Permanently removes a tombstoned item from the library. Items not in
 * Recently deleted (live items or already-purged tombstones) surface as
 * `not_found` so callers do not accidentally hard-delete an active item.
 */
export function purgeLibraryItem({
    itemId,
    userId,
}: PurgeLibraryItemArgs): Promise<PurgeLibraryItemResult> {
    return prisma.$transaction(async (tx) => {
        const item = await tx.libraryItem.findFirst({
            select: { deletedAt: true, id: true },
            where: { deletedAt: { not: null }, id: itemId, userId },
        });

        if (!item) {
            throw createCollectionError({
                code: "not_found",
                message: "That saved item is no longer in Recently deleted.",
                operation: "purgeLibraryItem",
            });
        }

        await tx.libraryActivityEvent.create({
            data: {
                kind: "item_purged",
                libraryItemId: item.id,
                occurredAt: new Date(),
                userId,
            },
        });
        await tx.libraryItem.delete({ where: { id: item.id } });

        return { itemId: item.id };
    });
}

interface PurgeExpiredLibraryItemsArgs {
    now?: Date;
    userId: string;
}

interface PurgeExpiredLibraryItemsResult {
    purgedItemIds: string[];
}

/**
 * Lazily hard-deletes tombstones older than `LIBRARY_ITEM_TRASH_WINDOW_DAYS`
 * for one user. Each deletion writes an `item_purged` event so the activity
 * timeline reflects what was lost. Exposed for page-load sweeps so we never
 * ship a cron job for a feature that mostly writes Postgres rows.
 *
 * Pass `now` in tests; production callers use the default `new Date()`.
 */
export function purgeExpiredLibraryItems({
    now: nowArg,
    userId,
}: PurgeExpiredLibraryItemsArgs): Promise<PurgeExpiredLibraryItemsResult> {
    const now = nowArg ?? new Date();
    const cutoff = new Date(now.getTime() - LIBRARY_ITEM_TRASH_WINDOW_MS);

    return prisma.$transaction(async (tx) => {
        const purgedIds: string[] = [];
        const PURGE_BATCH_SIZE = 1000;

        // Repeat until no rows match the expired cutoff. A single batch
        // bounded at PURGE_BATCH_SIZE would leave stale tombstones visible
        // in listRecentlyDeletedItems, defeating the trash-window guarantee.
        for (;;) {
            const candidateIds = (
                await tx.libraryItem.findMany({
                    select: { id: true },
                    take: PURGE_BATCH_SIZE,
                    where: {
                        deletedAt: { lt: cutoff, not: null },
                        userId,
                    },
                })
            ).map((item) => item.id);

            if (candidateIds.length === 0) {
                break;
            }

            // Create activity events BEFORE the delete. The FK on
            // libraryItemId references libraryItem.id, so events must be
            // written while items still exist — otherwise the FK constraint
            // rejects rows pointing at already-deleted items. Survivors
            // (concurrently restored items) are cleaned up below.
            await tx.libraryActivityEvent.createMany({
                data: candidateIds.map((itemId) => ({
                    kind: "item_purged" as const,
                    libraryItemId: itemId,
                    occurredAt: now,
                    userId,
                })),
            });

            // deleteMany includes `deletedAt` so a concurrent restore that sets
            // `deletedAt = null` between the read above and this delete is
            // excluded — a restored item is no longer expired and must survive.
            await tx.libraryItem.deleteMany({
                where: {
                    deletedAt: { lt: cutoff, not: null },
                    id: { in: candidateIds },
                    userId,
                },
            });

            // Find which candidates survived the delete (were restored between
            // read and delete) so we can remove their premature events. A
            // restored item was never actually purged, so it must not carry an
            // `item_purged` event.
            const survivors = new Set(
                (
                    await tx.libraryItem.findMany({
                        select: { id: true },
                        where: { id: { in: candidateIds }, userId },
                    })
                ).map((item) => item.id)
            );

            if (survivors.size > 0) {
                await tx.libraryActivityEvent.deleteMany({
                    where: {
                        kind: "item_purged",
                        libraryItemId: { in: [...survivors] },
                        userId,
                    },
                });
            }

            const batchPurged = candidateIds.filter((id) => !survivors.has(id));
            purgedIds.push(...batchPurged);
        }

        return { purgedItemIds: purgedIds };
    });
}

interface PurgeAllRecentlyDeletedItemsArgs {
    userId: string;
}

interface PurgeAllRecentlyDeletedItemsResult {
    purgedItemIds: string[];
}

/**
 * Permanently removes every tombstoned item for a user — the "Delete all now"
 * path. Unlike `purgeExpiredLibraryItems` this ignores the trash window so
 * items are removed on demand regardless of how long ago they were deleted.
 */
export function purgeAllRecentlyDeletedItems({
    userId,
}: PurgeAllRecentlyDeletedItemsArgs): Promise<PurgeAllRecentlyDeletedItemsResult> {
    return prisma.$transaction(async (tx) => {
        const itemIds = (
            await tx.libraryItem.findMany({
                select: { id: true },
                where: {
                    deletedAt: { not: null },
                    userId,
                },
            })
        ).map((item) => item.id);

        if (itemIds.length === 0) {
            return { purgedItemIds: [] };
        }

        // Create activity events BEFORE the delete. The FK on
        // libraryItemId references libraryItem.id, so events must be
        // written while items still exist — otherwise the constraint
        // rejects rows pointing at already-deleted items.
        await tx.libraryActivityEvent.createMany({
            data: itemIds.map((id) => ({
                kind: "item_purged" as const,
                libraryItemId: id,
                occurredAt: new Date(),
                userId,
            })),
        });

        // deleteMany includes `deletedAt` so a concurrent restore that sets
        // `deletedAt = null` between the read above and this delete is
        // excluded — a restored item must survive.
        await tx.libraryItem.deleteMany({
            where: {
                deletedAt: { not: null },
                id: { in: itemIds },
                userId,
            },
        });

        // Remove premature events for survivors (concurrently restored items
        // that the delete excluded). A restored item was never purged.
        const survivors = new Set(
            (
                await tx.libraryItem.findMany({
                    select: { id: true },
                    where: { id: { in: itemIds }, userId },
                })
            ).map((item) => item.id)
        );

        if (survivors.size > 0) {
            await tx.libraryActivityEvent.deleteMany({
                where: {
                    kind: "item_purged",
                    libraryItemId: { in: [...survivors] },
                    userId,
                },
            });
        }

        return { purgedItemIds: itemIds.filter((id) => !survivors.has(id)) };
    });
}

interface ListRecentlyDeletedItemsArgs {
    limit?: number;
    userId: string;
}

interface CountRecentlyDeletedItemsArgs {
    userId: string;
}

interface RecentlyDeletedItem {
    collections: LibraryCollectionTag[];
    daysRemaining: number;
    deletedAt: Date;
    item: LibraryItemWithCollections;
}

/**
 * Loads the calling user's tombstones ordered by `deletedAt desc`. Returns
 * each row plus a derived `daysRemaining` countdown used by the UI to
 * communicate when hard deletion will occur. The lazy expiry sweep runs
 * before listing so the user never sees items the next page load would
 * purge anyway.
 */
export async function listRecentlyDeletedItems({
    limit,
    userId,
}: ListRecentlyDeletedItemsArgs): Promise<RecentlyDeletedItem[]> {
    const now = new Date();
    await purgeExpiredLibraryItems({ now, userId });

    const take = Math.max(
        1,
        Math.min(
            limit ?? RECENTLY_DELETED_LIMIT_MAX,
            RECENTLY_DELETED_LIMIT_MAX
        )
    );

    const rows = await prisma.libraryItem.findMany({
        include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
        orderBy: [{ deletedAt: SORT_DESC }, { id: SORT_DESC }],
        take,
        where: {
            deletedAt: { not: null },
            kind: { not: ITEM_KIND_FOLDER },
            userId,
        },
    });

    return rows.map((item) => {
        const deletedAt = item.deletedAt ?? now;
        const expiresAt = deletedAt.getTime() + LIBRARY_ITEM_TRASH_WINDOW_MS;
        const daysRemaining = Math.max(
            0,
            Math.round((expiresAt - now.getTime()) / DAY_IN_MS)
        );
        return {
            collections: item.collections,
            daysRemaining,
            deletedAt,
            item,
        };
    });
}

export function countRecentlyDeletedItems({
    userId,
}: CountRecentlyDeletedItemsArgs): Promise<number> {
    const cutoff = new Date(Date.now() - LIBRARY_ITEM_TRASH_WINDOW_MS);

    return prisma.libraryItem.count({
        where: {
            deletedAt: { gte: cutoff },
            kind: { not: ITEM_KIND_FOLDER },
            userId,
        },
    });
}

export async function toggleLibraryItemFavorite({
    itemId,
    userId,
}: {
    itemId: string;
    userId: string;
}): Promise<{ item: LibraryItemWithCollections }> {
    const updated = await prisma.$transaction(async (tx) => {
        const existing = await tx.libraryItem.findFirst({
            select: { favoritedAt: true },
            where: { deletedAt: null, id: itemId, userId },
        });

        if (!existing) {
            throwCollectionNotFound(
                "toggleLibraryItemFavorite",
                "We couldn't find that saved item."
            );
        }

        return tx.libraryItem.update({
            data: {
                favoritedAt: existing.favoritedAt ? null : new Date(),
            },
            include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
            where: {
                deletedAt: null,
                favoritedAt: existing.favoritedAt ? { not: null } : null,
                id: itemId,
                userId,
            },
        });
    });

    return { item: toLibraryItemWithCollections(updated) };
}

export function updateLibraryItemCollections({
    collectionIds,
    itemId,
    userId,
}: {
    collectionIds: string[];
    itemId: string;
    userId: string;
}): Promise<{
    collectionSummaries: LibraryCollectionSummary[];
    collections: LibraryCollectionTag[];
    itemId: string;
}> {
    return prisma.$transaction(async (tx) => {
        const item = await requireLibraryItemOwnedWithCollections(tx, {
            itemId,
            message: "We couldn't find that saved item.",
            operation: "updateLibraryItemCollections",
            userId,
        });

        const ownedCollections = await findCollectionTagsOwnedByIds(tx, {
            collectionIds,
            userId,
        });

        if (ownedCollections.length !== collectionIds.length) {
            throwCollectionNotFound(
                "updateLibraryItemCollections",
                "One of those collections is no longer available."
            );
        }

        const updatedItem = await tx.libraryItem.update({
            data: {
                collections: {
                    set: toIdConnections(
                        ownedCollections.map((collection) => collection.id)
                    ),
                },
            },
            select: LIBRARY_ITEM_COLLECTIONS_SELECT,
            where: { id: item.id },
        });

        const previousCollectionIds = item.collections.map(
            (collection) => collection.id
        );
        const nextCollectionIds = updatedItem.collections.map(
            (collection) => collection.id
        );
        const changedCollectionIds = getChangedCollectionIds(
            previousCollectionIds,
            nextCollectionIds
        );

        if (changedCollectionIds.length > 0) {
            await touchCollectionsUpdatedAt(tx, {
                collectionIds: changedCollectionIds,
                now: new Date(),
                userId,
            });
        }

        const affectedCollectionIds = Array.from(
            new Set([...previousCollectionIds, ...nextCollectionIds])
        );

        return {
            collectionSummaries: await findCollectionSummariesOwnedByIds(tx, {
                collectionIds: affectedCollectionIds,
                userId,
            }),
            collections: updatedItem.collections.map(toLibraryCollectionTag),
            itemId: updatedItem.id,
        };
    });
}

export function updateLibraryItemsCollections({
    itemIds,
    nextSharedCollectionIds,
    previousSharedCollectionIds,
    userId,
}: {
    itemIds: string[];
    nextSharedCollectionIds: string[];
    previousSharedCollectionIds: string[];
    userId: string;
}): Promise<{
    collectionSummaries: LibraryCollectionSummary[];
    itemCollections: Array<{
        collections: LibraryCollectionTag[];
        itemId: string;
    }>;
}> {
    if (itemIds.length === 0) {
        return Promise.resolve({
            collectionSummaries: [],
            itemCollections: [],
        });
    }

    return prisma.$transaction(async (tx) => {
        const previousItems = await requireLibraryItemsOwnedWithCollections(
            tx,
            {
                itemIds,
                message: "Some of those saved items are no longer available.",
                operation: "updateLibraryItemsCollections",
                userId,
            }
        );

        const referencedCollectionIds = Array.from(
            new Set([
                ...previousSharedCollectionIds,
                ...nextSharedCollectionIds,
            ])
        );

        const ownedCollections = await findCollectionTagsOwnedByIds(tx, {
            collectionIds: referencedCollectionIds,
            userId,
        });

        if (ownedCollections.length !== referencedCollectionIds.length) {
            throwCollectionNotFound(
                "updateLibraryItemsCollections",
                "One of those collections is no longer available."
            );
        }

        await deleteSharedCollectionItems(tx, {
            collectionIds: previousSharedCollectionIds,
            itemIds,
        });
        await insertSharedCollectionItems(tx, {
            collectionIds: nextSharedCollectionIds,
            itemIds,
        });

        const updatedItems = await tx.libraryItem.findMany({
            select: LIBRARY_ITEM_COLLECTIONS_SELECT,
            where: {
                deletedAt: null,
                id: {
                    in: itemIds,
                },
                userId,
            },
        });

        const previousCollectionIdsByItemId = new Map(
            previousItems.map((item) => [
                item.id,
                item.collections.map((collection) => collection.id),
            ])
        );
        const changedCollectionIdSet = new Set<string>();
        for (const item of updatedItems) {
            const nextCollectionIds = item.collections.map(
                (collection) => collection.id
            );
            const changedIds = getChangedCollectionIds(
                previousCollectionIdsByItemId.get(item.id) ?? [],
                nextCollectionIds
            );
            for (const id of changedIds) {
                changedCollectionIdSet.add(id);
            }
        }

        if (changedCollectionIdSet.size > 0) {
            await touchCollectionsUpdatedAt(tx, {
                collectionIds: [...changedCollectionIdSet],
                now: new Date(),
                userId,
            });
        }

        const updatedItemById = new Map(
            updatedItems.map((item) => [item.id, item])
        );

        return {
            collectionSummaries: await findCollectionSummariesOwnedByIds(tx, {
                collectionIds: referencedCollectionIds,
                userId,
            }),
            itemCollections: itemIds.map((itemId) => {
                const item = updatedItemById.get(itemId);
                if (!item) {
                    throwCollectionNotFound(
                        "updateLibraryItemsCollections",
                        "Some of those saved items are no longer available."
                    );
                }

                return {
                    collections: item.collections.map(toLibraryCollectionTag),
                    itemId: item.id,
                };
            }),
        };
    });
}

interface ListLibraryItemsArgs {
    collectionId?: string;
    limit?: number;
    offset?: number;
    search?: string;
    userId: string;
}

export async function listLibraryItems(
    args: ListLibraryItemsArgs
): Promise<{ items: LibraryItemWithCollections[]; total: number }> {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 50));
    const skip = Math.max(args.offset ?? 0, 0);
    const where: Prisma.LibraryItemWhereInput = {
        deletedAt: null,
        kind: { not: ITEM_KIND_FOLDER },
        userId: args.userId,
    };

    if (args.search) {
        where.OR = [
            { caption: { contains: args.search, mode: "insensitive" } },
            { url: { contains: args.search, mode: "insensitive" } },
            { noteContentText: { contains: args.search, mode: "insensitive" } },
        ];
    }

    if (args.collectionId) {
        where.collections = { some: { id: args.collectionId } };
    }

    const [items, total] = await Promise.all([
        prisma.libraryItem.findMany({
            include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
            orderBy: [
                { scrapedAt: SORT_DESC },
                { updatedAt: SORT_DESC },
                { id: SORT_DESC },
            ],
            skip,
            take: limit,
            where,
        }),
        prisma.libraryItem.count({ where }),
    ]);

    return {
        items: items.map(toLibraryItemWithCollections),
        total,
    };
}

interface GetLibraryItemArgs {
    itemId: string;
    userId: string;
}

export async function getLibraryItem(
    args: GetLibraryItemArgs
): Promise<LibraryItemWithCollections | null> {
    const item = await prisma.libraryItem.findFirst({
        include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
        where: { deletedAt: null, id: args.itemId, userId: args.userId },
    });

    return item ? toLibraryItemWithCollections(item) : null;
}

interface ListCollectionsArgs {
    userId: string;
}

export async function listCollections(
    args: ListCollectionsArgs
): Promise<LibraryCollectionSummary[]> {
    const collections = await prisma.collection.findMany({
        include: {
            // Folders persisted inside a collection (Chrome bookmark sync) are
            // dropped from the user-facing summary so both `list_library_items`
            // and `list_collections` agree on what counts. The `items` selection
            // (used to derive `sources`) must mirror the same predicate.
            _count: {
                select: {
                    items: {
                        where: {
                            deletedAt: null,
                            kind: { not: ITEM_KIND_FOLDER },
                        },
                    },
                },
            },
            items: {
                select: { source: true },
                where: {
                    deletedAt: null,
                    kind: { not: ITEM_KIND_FOLDER },
                },
            },
        },
        orderBy: { name: SORT_ASC },
        take: COLLECTION_LIST_LIMIT_MAX,
        where: { userId: args.userId },
    });

    return collections.map(toLibraryCollectionSummary);
}

/**
 * Reads the user's smart collections preference.
 *
 * Returns true when smart collections auto-tagging is enabled. Smart collections
 * is a library preference backed by `User.smartCollectionsEnabled` and runs
 * purely on the per-save event path; there is no scheduled catch-up batch.
 */
export async function getUserSmartCollectionsPreference(args: {
    userId: string;
}): Promise<boolean> {
    const user = await prisma.user.findUnique({
        select: { smartCollectionsEnabled: true },
        where: { id: args.userId },
    });
    return user?.smartCollectionsEnabled ?? false;
}

/**
 * Sets the user's smart collections preference.
 *
 * When `enabled` is false, in-flight `after()` callbacks from already-fired
 * saves may still observe the previous state for the remainder of the
 * request scope — the gate is best-effort at write time. Either way, all
 * future saves will respect the new value the next time
 * `autoTagLibraryItemsByIds` runs.
 */
export async function setSmartCollectionsPreference(args: {
    enabled: boolean;
    userId: string;
}): Promise<void> {
    await prisma.user.update({
        data: { smartCollectionsEnabled: args.enabled },
        where: { id: args.userId },
    });
}

export async function getLibrary(args: {
    hasAccess: boolean;
    limit?: number;
    userId: string;
}): Promise<{
    itemSources: Array<{ source: LibraryItemSource }>;
    items: LibraryItemWithCollections[];
    lockedItemCount: number;
    totalItemCount: number;
}> {
    const itemWhere: Prisma.LibraryItemWhereInput = {
        deletedAt: null,
        kind: { not: ITEM_KIND_FOLDER },
        userId: args.userId,
    };

    const limit = Math.min(
        args.limit ?? LIBRARY_ITEMS_PAGE_LIMIT_DEFAULT,
        LIBRARY_ITEMS_PAGE_LIMIT_MAX
    );

    const effectiveLimit = args.hasAccess
        ? limit
        : Math.min(limit, FREE_LIBRARY_PREVIEW_ITEMS);

    if (!args.hasAccess) {
        const [items, totalItemCount, itemSources] = await Promise.all([
            prisma.libraryItem.findMany({
                include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
                orderBy: [
                    { scrapedAt: SORT_DESC },
                    { updatedAt: SORT_DESC },
                    { id: SORT_DESC },
                ],
                take: effectiveLimit,
                where: itemWhere,
            }),
            prisma.libraryItem.count({ where: itemWhere }),
            prisma.libraryItem.findMany({
                distinct: ["source"],
                select: { source: true },
                where: itemWhere,
            }),
        ]);

        return {
            itemSources,
            items: deduplicateLibraryItems(
                items.map(toLibraryItemWithCollections)
            ),
            lockedItemCount: Math.max(totalItemCount - items.length, 0),
            totalItemCount,
        };
    }

    const [items, totalItemCount] = await Promise.all([
        prisma.libraryItem.findMany({
            include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
            orderBy: [
                { scrapedAt: SORT_DESC },
                { updatedAt: SORT_DESC },
                { id: SORT_DESC },
            ],
            take: effectiveLimit,
            where: itemWhere,
        }),
        prisma.libraryItem.count({ where: itemWhere }),
    ]);

    if (totalItemCount <= effectiveLimit) {
        const derivedSources = uniqueLibraryItemSources(items);

        return {
            itemSources: derivedSources.map((source) => ({ source })),
            items: deduplicateLibraryItems(
                items.map(toLibraryItemWithCollections)
            ),
            lockedItemCount: 0,
            totalItemCount,
        };
    }

    const itemSources = await prisma.libraryItem.findMany({
        distinct: ["source"],
        select: { source: true },
        where: itemWhere,
    });

    return {
        itemSources,
        items: deduplicateLibraryItems(items.map(toLibraryItemWithCollections)),
        lockedItemCount: Math.max(totalItemCount - items.length, 0),
        totalItemCount,
    };
}
