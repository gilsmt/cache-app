"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import { LINK_REACHABILITY_BATCH_MAX } from "@/lib/collections/library-quality";
import {
    type LinkReachabilityResult,
    probeLibraryItemsReachability,
} from "@/lib/collections/link-reachability";
import {
    type ActionError,
    COLLECTION_VALIDATION_MESSAGES,
    type LibraryCollectionSummary,
    type LibraryCollectionTag,
    type LibraryItemWithCollections,
    STATUS_MAP_NOT_FOUND,
    STATUS_MAP_TRASHED_ITEM,
} from "@/lib/collections/utils";
import {
    getValidationErrorMessage,
    handleActionError,
} from "@/lib/common/action";
import { unique } from "@/lib/common/array";
import {
    ACTION_STATUS,
    BATCH_UPDATE_MAX_ITEMS,
    MAX_COLLECTIONS_PER_BATCH,
    MAX_COLLECTIONS_PER_ITEM,
} from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { LibraryCollectionError } from "./error";
import * as service from "./service";

const log = createLogger("library:actions:items");

const LibraryItemCollectionsUpdateInputSchema = z.object({
    collectionIds: z
        .array(z.string().trim().min(1))
        .max(MAX_COLLECTIONS_PER_ITEM),
    itemId: z.string().trim().min(1),
});

const LibraryItemsCollectionsUpdateInputSchema = z.object({
    itemIds: z
        .array(z.string().trim().min(1))
        .min(1)
        .max(BATCH_UPDATE_MAX_ITEMS),
    nextSharedCollectionIds: z
        .array(z.string().trim().min(1))
        .max(MAX_COLLECTIONS_PER_BATCH),
    previousSharedCollectionIds: z
        .array(z.string().trim().min(1))
        .max(MAX_COLLECTIONS_PER_BATCH),
});

const LibraryItemDeleteInputSchema = z.object({
    itemId: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.itemDeleteIdRequired),
});

const LibraryItemsDeleteInputSchema = z.object({
    itemIds: z
        .array(z.string().trim().min(1))
        .min(1)
        .max(BATCH_UPDATE_MAX_ITEMS),
});

const LibraryItemFavoriteToggleInputSchema = z.object({
    itemId: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.itemFavoriteIdRequired),
});

const LibraryItemRestoreInputSchema = z.object({
    itemId: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.itemRestoreIdRequired),
});

const LibraryItemPurgeInputSchema = z.object({
    itemId: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.itemPurgeIdRequired),
});

const LibraryItemsReachabilityProbeInputSchema = z.object({
    itemIds: z
        .array(z.string().trim().min(1))
        .min(1)
        .max(LINK_REACHABILITY_BATCH_MAX),
});

export type LibraryItemDeleteResult =
    | {
          collectionSummaries: LibraryCollectionSummary[];
          itemId: string;
          status: typeof ACTION_STATUS.DELETED;
      }
    | ActionError;

export type LibraryItemsDeleteResult =
    | {
          collectionSummaries: LibraryCollectionSummary[];
          itemIds: string[];
          status: typeof ACTION_STATUS.DELETED;
      }
    | ActionError;

export type LibraryItemRestoreResult =
    | {
          collectionSummaries: LibraryCollectionSummary[];
          itemId: string;
          status: typeof ACTION_STATUS.RESTORED;
      }
    | ActionError;

export type LibraryItemPurgeResult =
    | {
          itemId: string;
          status: typeof ACTION_STATUS.DELETED;
      }
    | ActionError;

export type LibraryItemPurgeExpiredResult =
    | {
          purgedItemIds: string[];
          status: typeof ACTION_STATUS.DELETED;
      }
    | ActionError;

export type LibraryItemCollectionsUpdateResult =
    | {
          collectionSummaries: LibraryCollectionSummary[];
          collections: LibraryCollectionTag[];
          itemId: string;
          status: typeof ACTION_STATUS.UPDATED;
      }
    | ActionError;

export type LibraryItemsCollectionsUpdateResult =
    | {
          collectionSummaries: LibraryCollectionSummary[];
          itemCollections: Array<{
              collections: LibraryCollectionTag[];
              itemId: string;
          }>;
          status: typeof ACTION_STATUS.UPDATED;
      }
    | ActionError;

export type LibraryItemFavoriteToggleResult =
    | {
          item: LibraryItemWithCollections;
          status: typeof ACTION_STATUS.UPDATED;
      }
    | ActionError;

export type LibraryItemsReachabilityProbeResult =
    | {
          rateLimited: boolean;
          results: LinkReachabilityResult[];
          retryAfterMs: number;
          status: typeof ACTION_STATUS.SUCCESS;
      }
    | ActionError;

export async function deleteLibraryItem(
    itemId: string
): Promise<LibraryItemDeleteResult> {
    const parsed = LibraryItemDeleteInputSchema.safeParse({ itemId });
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.itemDeleteIdRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to manage saved items."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await service.trashLibraryItem({
            itemId: parsed.data.itemId,
            userId: actor.userId,
        });

        revalidatePath("/library");
        revalidatePath("/recently-deleted");
        return {
            ...result,
            status: ACTION_STATUS.DELETED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage: "We couldn't delete this saved item right now.",
            log,
        });
    }
}

export async function deleteLibraryItems(input: {
    itemIds: string[];
}): Promise<LibraryItemsDeleteResult> {
    const parsed = LibraryItemsDeleteInputSchema.safeParse({
        itemIds: unique(input.itemIds),
    });
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.itemDeleteIdRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to manage saved items."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await service.trashLibraryItems({
            itemIds: parsed.data.itemIds,
            userId: actor.userId,
        });

        revalidatePath("/library");
        revalidatePath("/recently-deleted");
        return {
            ...result,
            status: ACTION_STATUS.DELETED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage: "We couldn't delete those saved items right now.",
            log,
        });
    }
}

export async function restoreLibraryItem(
    itemId: string
): Promise<LibraryItemRestoreResult> {
    const parsed = LibraryItemRestoreInputSchema.safeParse({ itemId });
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.itemRestoreIdRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to manage saved items."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await service.restoreLibraryItem({
            itemId: parsed.data.itemId,
            userId: actor.userId,
        });

        revalidatePath("/library");
        revalidatePath("/recently-deleted");
        return {
            ...result,
            status: ACTION_STATUS.RESTORED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_TRASHED_ITEM,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage: "We couldn't restore this saved item right now.",
            log,
        });
    }
}

export async function purgeLibraryItem(
    itemId: string
): Promise<LibraryItemPurgeResult> {
    const parsed = LibraryItemPurgeInputSchema.safeParse({ itemId });
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.itemPurgeIdRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to manage saved items."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await service.purgeLibraryItem({
            itemId: parsed.data.itemId,
            userId: actor.userId,
        });

        revalidatePath("/recently-deleted");
        return {
            itemId: result.itemId,
            status: ACTION_STATUS.DELETED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_TRASHED_ITEM,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage:
                "We couldn't permanently delete this saved item right now.",
            log,
        });
    }
}

export type LibraryItemPurgeAllResult =
    | {
          purgedItemIds: string[];
          status: typeof ACTION_STATUS.DELETED;
      }
    | ActionError;

export async function purgeAllRecentlyDeletedItems(): Promise<LibraryItemPurgeAllResult> {
    const actor = await requireActionUserId(
        "Sign in again to manage saved items."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await service.purgeAllRecentlyDeletedItems({
            userId: actor.userId,
        });

        revalidatePath("/recently-deleted");
        return {
            purgedItemIds: result.purgedItemIds,
            status: ACTION_STATUS.DELETED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: {},
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage:
                "We couldn't permanently delete your items right now.",
            log,
        });
    }
}

export async function purgeExpiredLibraryItems(): Promise<LibraryItemPurgeExpiredResult> {
    const actor = await requireActionUserId(
        "Sign in again to manage saved items."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await service.purgeExpiredLibraryItems({
            userId: actor.userId,
        });
        revalidatePath("/recently-deleted");
        return {
            purgedItemIds: result.purgedItemIds,
            status: ACTION_STATUS.DELETED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: {},
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage:
                "We couldn't finish cleaning up Recently deleted right now.",
            log,
        });
    }
}

export async function updateLibraryItemsCollections(input: {
    itemIds: string[];
    nextSharedCollectionIds: string[];
    previousSharedCollectionIds: string[];
}): Promise<LibraryItemsCollectionsUpdateResult> {
    const parsed = LibraryItemsCollectionsUpdateInputSchema.safeParse({
        itemIds: unique(input.itemIds),
        nextSharedCollectionIds: unique(input.nextSharedCollectionIds),
        previousSharedCollectionIds: unique(input.previousSharedCollectionIds),
    });

    if (!parsed.success) {
        return {
            message:
                COLLECTION_VALIDATION_MESSAGES.itemCollectionsBatchedIdRequired,
            status: ACTION_STATUS.INVALID,
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to manage collections."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await service.updateLibraryItemsCollections({
            itemIds: parsed.data.itemIds,
            nextSharedCollectionIds: parsed.data.nextSharedCollectionIds,
            previousSharedCollectionIds:
                parsed.data.previousSharedCollectionIds,
            userId: actor.userId,
        });

        return {
            ...result,
            status: ACTION_STATUS.UPDATED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage: "We couldn't update collections for those items.",
            log,
        });
    }
}

export async function toggleLibraryItemFavorite(
    itemId: string
): Promise<LibraryItemFavoriteToggleResult> {
    const parsed = LibraryItemFavoriteToggleInputSchema.safeParse({ itemId });
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.itemFavoriteIdRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to manage saved items."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await service.toggleLibraryItemFavorite({
            itemId: parsed.data.itemId,
            userId: actor.userId,
        });

        return {
            item: result.item,
            status: ACTION_STATUS.UPDATED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage: "We couldn't update this favorite right now.",
            log,
        });
    }
}

export async function probeLibraryItemsReachabilityAction(input: {
    itemIds: string[];
}): Promise<LibraryItemsReachabilityProbeResult> {
    const parsed = LibraryItemsReachabilityProbeInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Select items to check."
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to check saved links."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const outcome = await probeLibraryItemsReachability({
            itemIds: parsed.data.itemIds,
            userId: actor.userId,
        });

        if (outcome.didPersist) {
            revalidatePath("/library");
        }

        return {
            rateLimited: outcome.rateLimited,
            results: outcome.results,
            retryAfterMs: outcome.retryAfterMs,
            status: ACTION_STATUS.SUCCESS,
        };
    } catch (error) {
        log.error("Failed to probe library item reachability", error);
        return {
            message: "We couldn't check those links right now.",
            status: ACTION_STATUS.ERROR,
        };
    }
}

export async function updateLibraryItemCollections(input: {
    collectionIds: string[];
    itemId: string;
}): Promise<LibraryItemCollectionsUpdateResult> {
    const parsed = LibraryItemCollectionsUpdateInputSchema.safeParse({
        collectionIds: unique(input.collectionIds),
        itemId: input.itemId,
    });

    if (!parsed.success) {
        return {
            message: COLLECTION_VALIDATION_MESSAGES.itemCollectionsIdRequired,
            status: ACTION_STATUS.INVALID,
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to manage collections."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await service.updateLibraryItemCollections({
            collectionIds: parsed.data.collectionIds,
            itemId: parsed.data.itemId,
            userId: actor.userId,
        });

        return {
            ...result,
            status: ACTION_STATUS.UPDATED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage: "We couldn't update collections for this item.",
            log,
        });
    }
}
