"use server";

import * as z from "zod";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import {
    type ActionError,
    COLLECTION_VALIDATION_MESSAGES,
    type LibraryCollectionTag,
    STATUS_MAP_NOT_FOUND,
} from "@/lib/collections/utils";
import {
    getValidationErrorMessage,
    handleActionError,
} from "@/lib/common/action";
import { ACTION_STATUS } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { invalidateShareMetadataCache } from "./cache";
import { CollectionShareError } from "./error";
import {
    disablePublicCollectionShare,
    enablePublicCollectionShare,
    type SharedLibraryCollectionTag,
} from "./service";
import { buildPublicCollectionShareUrl } from "./url";

const log = createLogger("collection-sharing:actions");

const CollectionShareInputSchema = z.object({
    collectionId: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.shareIdRequired),
});

const CollectionShareDisableInputSchema = z.object({
    collectionId: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.unshareIdRequired),
});

interface SubscriptionRequiredActionError {
    message: string;
    status: typeof ACTION_STATUS.SUBSCRIPTION_REQUIRED;
}

export type CollectionPublicShareResult =
    | {
          collection: SharedLibraryCollectionTag;
          shareUrl: string;
          status: typeof ACTION_STATUS.SHARED;
      }
    | ActionError
    | SubscriptionRequiredActionError;

export type CollectionPublicShareDisableResult =
    | {
          collection: LibraryCollectionTag;
          status: typeof ACTION_STATUS.DISABLED;
      }
    | ActionError;

export async function shareCollectionPublicly(input: {
    collectionId: string;
}): Promise<CollectionPublicShareResult> {
    const parsed = CollectionShareInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.shareIdRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to share collections."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const collection = await enablePublicCollectionShare({
            collectionId: parsed.data.collectionId,
            userId: actor.userId,
        });

        invalidateShareMetadataCache(collection.shareId);

        return {
            collection,
            shareUrl: buildPublicCollectionShareUrl(collection.shareId),
            status: ACTION_STATUS.SHARED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: {
                not_found: ACTION_STATUS.NOT_FOUND,
                subscription_required: ACTION_STATUS.SUBSCRIPTION_REQUIRED,
            },
            error,
            errorFactory: CollectionShareError,
            fallbackMessage: "We couldn't create a public link right now.",
            log,
        });
    }
}

export async function disableCollectionSharing(input: {
    collectionId: string;
}): Promise<CollectionPublicShareDisableResult> {
    const parsed = CollectionShareDisableInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.unshareIdRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to manage shared collections."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const { collection, revokedShareId } =
            await disablePublicCollectionShare({
                collectionId: parsed.data.collectionId,
                userId: actor.userId,
            });

        if (revokedShareId) {
            invalidateShareMetadataCache(revokedShareId);
        }

        return {
            collection,
            status: ACTION_STATUS.DISABLED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_NOT_FOUND,
            error,
            errorFactory: CollectionShareError,
            fallbackMessage:
                "We couldn't stop sharing this collection right now.",
            log,
        });
    }
}
