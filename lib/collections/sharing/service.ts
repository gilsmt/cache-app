import "server-only";

import { createId, verifyId } from "legid";
import { userHasProAccess } from "@/lib/billing/service";
import {
    LIBRARY_COLLECTION_TAG_SELECT,
    toLibraryCollectionTag,
} from "@/lib/collections/utils";
import {
    FREE_LIBRARY_PREVIEW_ITEMS,
    PRISMA_UNIQUE_CONSTRAINT_ERROR,
    SORT_DESC,
} from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { withRetry } from "@/lib/common/retry";
import { prisma } from "@/prisma";
import { Prisma } from "@/prisma/client/client";
import { LibraryItemKind, type LibraryItemSource } from "@/prisma/client/enums";
import { CollectionShareError } from "./error";

const log = createLogger("collection-sharing:service");

const COLLECTION_SHARE_ID_APPROXIMATE_LENGTH = 12;
const COLLECTION_SHARE_ID_ATTEMPT_COUNT_MAX = 3;

type CollectionShareTransaction = Prisma.TransactionClient;

interface PublicCollectionShareItem {
    caption: string | null;
    createdAt: Date;
    id: string;
    kind: LibraryItemKind;
    noteContentText: string | null;
    postedAt: Date | null;
    scrapedAt: Date | null;
    source: LibraryItemSource;
    url: string;
}

interface PublicCollectionShare {
    description: string | null;
    itemCount: number;
    items: PublicCollectionShareItem[];
    name: string;
    ownerName: string;
    sharedAt: Date;
    shareId: string;
    updatedAt: Date;
}

export type SharedLibraryCollectionTag = ReturnType<
    typeof toLibraryCollectionTag
> & {
    shareId: string;
    sharedAt: Date;
};

function findCollectionTagOwned(args: {
    collectionId: string;
    tx?: CollectionShareTransaction;
    userId: string;
}) {
    const tx = args.tx ?? prisma;

    return tx.collection.findFirst({
        select: LIBRARY_COLLECTION_TAG_SELECT,
        where: {
            id: args.collectionId,
            userId: args.userId,
        },
    });
}

async function requireCollectionTagOwned(args: {
    collectionId: string;
    operation: string;
    tx?: CollectionShareTransaction;
    userId: string;
}) {
    const collection = await findCollectionTagOwned(args);
    if (!collection) {
        throw new CollectionShareError({
            code: "not_found",
            message: "That collection is no longer available.",
            operation: args.operation,
        });
    }
    return collection;
}

function requireCollectionTagShared(
    collection: ReturnType<typeof toLibraryCollectionTag>,
    operation: string
): SharedLibraryCollectionTag {
    if (!(collection.shareId && collection.sharedAt)) {
        throw new CollectionShareError({
            code: "share_generation_failed",
            message: "We couldn't create a public link right now.",
            operation,
        });
    }

    return {
        ...collection,
        sharedAt: collection.sharedAt,
        shareId: collection.shareId,
    };
}

function isPrismaUniqueConstraintError(error: unknown): boolean {
    return (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR
    );
}

async function getFreePreviewItemIdsInTransaction(
    tx: CollectionShareTransaction,
    userId: string
): Promise<string[]> {
    const previewItems = await tx.libraryItem.findMany({
        orderBy: [{ scrapedAt: SORT_DESC }, { updatedAt: SORT_DESC }],
        select: { id: true },
        take: FREE_LIBRARY_PREVIEW_ITEMS,
        where: {
            deletedAt: null,
            kind: { not: LibraryItemKind.folder },
            userId,
        },
    });

    return previewItems.map((item) => item.id);
}

async function hasPublicShareAccess(args: {
    collectionId: string;
    tx: CollectionShareTransaction;
    userId: string;
}): Promise<boolean> {
    if (await userHasProAccess(args.userId, args.tx)) {
        return true;
    }

    const previewItemIds = await getFreePreviewItemIdsInTransaction(
        args.tx,
        args.userId
    );
    const hiddenCollectionItemCount = await args.tx.libraryItem.count({
        where: {
            collections: { some: { id: args.collectionId } },
            deletedAt: null,
            id:
                previewItemIds.length > 0
                    ? { notIn: previewItemIds }
                    : undefined,
            kind: { not: LibraryItemKind.folder },
            userId: args.userId,
        },
    });

    return hiddenCollectionItemCount === 0;
}

async function assertCollectionShareAccess(args: {
    collectionId: string;
    operation: string;
    tx: CollectionShareTransaction;
    userId: string;
}) {
    if (
        !(await hasPublicShareAccess({
            collectionId: args.collectionId,
            tx: args.tx,
            userId: args.userId,
        }))
    ) {
        throw new CollectionShareError({
            code: "subscription_required",
            message: "Upgrade to share every item in this collection.",
            operation: args.operation,
        });
    }
}

export async function enablePublicCollectionShare(input: {
    collectionId: string;
    userId: string;
}): Promise<SharedLibraryCollectionTag> {
    try {
        return await withRetry(
            () =>
                prisma.$transaction(
                    async (tx) => {
                        const existingCollection =
                            await requireCollectionTagOwned({
                                collectionId: input.collectionId,
                                operation: "enablePublicCollectionShare",
                                tx,
                                userId: input.userId,
                            });

                        await assertCollectionShareAccess({
                            collectionId: existingCollection.id,
                            operation: "enablePublicCollectionShare",
                            tx,
                            userId: input.userId,
                        });

                        if (
                            existingCollection.shareId &&
                            existingCollection.sharedAt
                        ) {
                            return requireCollectionTagShared(
                                toLibraryCollectionTag(existingCollection),
                                "enablePublicCollectionShare"
                            );
                        }

                        const shareId = await createId({
                            approximateLength:
                                COLLECTION_SHARE_ID_APPROXIMATE_LENGTH,
                        });

                        const sharedCollection = await tx.collection.update({
                            data: {
                                sharedAt: new Date(),
                                shareId,
                            },
                            select: LIBRARY_COLLECTION_TAG_SELECT,
                            where: {
                                id: existingCollection.id,
                            },
                        });

                        log.info("Enabled public collection share", {
                            collectionId: sharedCollection.id,
                            shareId: sharedCollection.shareId,
                            userId: input.userId,
                        });

                        return requireCollectionTagShared(
                            toLibraryCollectionTag(sharedCollection),
                            "enablePublicCollectionShare"
                        );
                    },
                    {
                        isolationLevel:
                            Prisma.TransactionIsolationLevel.RepeatableRead,
                    }
                ),
            // A unique share-ID collision is resolved by generating a fresh ID;
            // waiting does not improve the outcome, so retry immediately.
            {
                factor: 1,
                maxTimeout: 0,
                minTimeout: 0,
                retries: COLLECTION_SHARE_ID_ATTEMPT_COUNT_MAX - 1,
                shouldRetry: ({ error }) =>
                    isPrismaUniqueConstraintError(error),
            }
        );
    } catch (error) {
        if (CollectionShareError.isInstance(error)) {
            throw error;
        }
        throw new CollectionShareError(
            {
                code: "share_generation_failed",
                message: "We couldn't create a public link right now.",
                operation: "enablePublicCollectionShare",
            },
            { cause: error }
        );
    }
}

export async function disablePublicCollectionShare(input: {
    collectionId: string;
    userId: string;
}): Promise<{
    collection: ReturnType<typeof toLibraryCollectionTag>;
    revokedShareId: string | null;
}> {
    const existingCollection = await requireCollectionTagOwned({
        collectionId: input.collectionId,
        operation: "disablePublicCollectionShare",
        userId: input.userId,
    });

    if (!(existingCollection.shareId || existingCollection.sharedAt)) {
        return {
            collection: toLibraryCollectionTag(existingCollection),
            revokedShareId: null,
        };
    }

    const revokedShareId = existingCollection.shareId;

    const disabledCollection = await prisma.collection.update({
        data: {
            sharedAt: null,
            shareId: null,
        },
        select: LIBRARY_COLLECTION_TAG_SELECT,
        where: {
            id: existingCollection.id,
        },
    });

    log.info("Disabled public collection share", {
        collectionId: disabledCollection.id,
        userId: input.userId,
    });

    return {
        collection: toLibraryCollectionTag(disabledCollection),
        revokedShareId,
    };
}

export async function getPublicCollectionShareById(
    shareId: string
): Promise<PublicCollectionShare | null> {
    const normalizedShareId = shareId.trim();
    if (normalizedShareId.length === 0) {
        return null;
    }

    const isValidShareId = await verifyId(normalizedShareId);
    if (!isValidShareId) {
        return null;
    }

    return await prisma.$transaction(
        async (tx) => {
            const sharedCollectionLookup = await tx.collection.findFirst({
                select: {
                    id: true,
                    sharedAt: true,
                    shareId: true,
                    userId: true,
                },
                where: {
                    shareId: normalizedShareId,
                },
            });

            if (
                !(
                    sharedCollectionLookup?.shareId &&
                    sharedCollectionLookup.sharedAt
                )
            ) {
                return null;
            }

            const canViewPublicShare = await hasPublicShareAccess({
                collectionId: sharedCollectionLookup.id,
                tx,
                userId: sharedCollectionLookup.userId,
            });

            if (!canViewPublicShare) {
                return null;
            }

            const sharedCollection = await tx.collection.findFirst({
                select: {
                    description: true,
                    items: {
                        orderBy: [
                            { scrapedAt: SORT_DESC },
                            { updatedAt: SORT_DESC },
                        ],
                        select: {
                            caption: true,
                            createdAt: true,
                            id: true,
                            kind: true,
                            noteContentText: true,
                            postedAt: true,
                            scrapedAt: true,
                            source: true,
                            url: true,
                        },
                        where: {
                            // Public viewers must not see items the owner
                            // has trashed — tombstones are private until
                            // hard-deleted.
                            deletedAt: null,
                            kind: {
                                not: LibraryItemKind.folder,
                            },
                        },
                    },
                    name: true,
                    sharedAt: true,
                    shareId: true,
                    updatedAt: true,
                    user: {
                        select: {
                            name: true,
                        },
                    },
                },
                where: {
                    id: sharedCollectionLookup.id,
                    shareId: normalizedShareId,
                },
            });

            if (!(sharedCollection?.shareId && sharedCollection.sharedAt)) {
                return null;
            }

            return {
                description: sharedCollection.description,
                itemCount: sharedCollection.items.length,
                items: sharedCollection.items,
                name: sharedCollection.name,
                ownerName: sharedCollection.user.name,
                sharedAt: sharedCollection.sharedAt,
                shareId: sharedCollection.shareId,
                updatedAt: sharedCollection.updatedAt,
            };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
}
