"use server";

import * as z from "zod";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import { invalidateShareMetadataCache } from "@/lib/collections/sharing/cache";
import {
    type ActionError,
    type ActionErrorWithDuplicate,
    type ActionErrorWithoutNotFound,
    COLLECTION_VALIDATION_MESSAGES,
    collectionNameSchema,
    type LibraryCollectionSummary,
    type LibraryCollectionTag,
    STATUS_MAP_DUPLICATE_OR_NOT_FOUND,
    STATUS_MAP_NOT_FOUND,
} from "@/lib/collections/utils";
import {
    getValidationErrorMessage,
    handleActionError,
} from "@/lib/common/action";
import { unique } from "@/lib/common/array";
import {
    ACTION_STATUS,
    COLLECTION_CREATE_FROM_ITEMS_MAX_ITEMS,
    DESCRIPTION_MAX_LENGTH,
} from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import type { CollectionPriority } from "@/prisma/client/enums";
import { LibraryCollectionError } from "./error";
import * as service from "./service";

const log = createLogger("library:actions");

const CollectionCreateInputSchema = z.object({
    assignToItemId: z.string().trim().min(1).optional(),
    description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
    name: collectionNameSchema,
});

const CollectionCreateFromItemsInputSchema = z.object({
    description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
    itemIds: z
        .array(z.string().trim().min(1))
        .min(1)
        .max(
            COLLECTION_CREATE_FROM_ITEMS_MAX_ITEMS,
            `Collections can hold up to ${COLLECTION_CREATE_FROM_ITEMS_MAX_ITEMS} items at a time. Refine the results and try again.`
        ),
    name: collectionNameSchema,
});

const CollectionDeleteInputSchema = z.object({
    collectionId: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.deleteIdRequired),
});

const CollectionDuplicateInputSchema = z.object({
    collectionId: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.duplicateIdRequired),
});

const CollectionPriorityUpdateInputSchema = z.object({
    collectionId: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.manageIdRequired),
    priority: z.enum([
        "none",
        "very_relevant",
        "relevant",
        "peripheral",
        "archive",
    ] satisfies [CollectionPriority, ...CollectionPriority[]]),
});

const CollectionRenameInputSchema = z.object({
    collectionId: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.renameIdRequired),
    name: collectionNameSchema,
});

export type CollectionCreateResult =
    | {
          assignedItemId: string | null;
          collection: LibraryCollectionSummary;
          status: typeof ACTION_STATUS.CREATED;
      }
    | ActionErrorWithDuplicate;

export type CollectionCreateFromItemsResult =
    | {
          assignedItemIds: string[];
          collection: LibraryCollectionSummary;
          status: typeof ACTION_STATUS.CREATED;
      }
    | ActionErrorWithDuplicate;

export type CollectionDeleteResult =
    | {
          collection: Pick<LibraryCollectionSummary, "id" | "name">;
          status: typeof ACTION_STATUS.DELETED;
      }
    | ActionError;

export type CollectionDuplicateResult =
    | {
          assignedItemIds: string[];
          collection: LibraryCollectionSummary;
          status: typeof ACTION_STATUS.CREATED;
      }
    | ActionError;

export type CollectionPriorityUpdateResult =
    | {
          collection: LibraryCollectionTag;
          status: typeof ACTION_STATUS.UPDATED;
      }
    | ActionError;

export type CollectionRenameResult =
    | {
          collection: LibraryCollectionTag;
          status: typeof ACTION_STATUS.UPDATED;
      }
    | ActionErrorWithDuplicate;

export async function createCollection(input: {
    assignToItemId?: string;
    description?: string;
    name: string;
}): Promise<CollectionCreateResult> {
    const auth = await requireActionUserId(
        "Sign in again to create collections."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    const parsed = CollectionCreateInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.nameRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    try {
        const result = await service.createCollection({
            assignToItemId: parsed.data.assignToItemId,
            description: parsed.data.description,
            name: parsed.data.name,
            userId: auth.userId,
        });

        return {
            ...result,
            status: ACTION_STATUS.CREATED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_DUPLICATE_OR_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage: "We couldn't create this collection right now.",
            log,
        });
    }
}

export async function createCollectionFromItems(input: {
    description?: string;
    itemIds: string[];
    name: string;
}): Promise<CollectionCreateFromItemsResult> {
    const parsed = CollectionCreateFromItemsInputSchema.safeParse({
        ...input,
        itemIds: unique(input.itemIds),
    });

    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.nameAndItemsRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to create collections."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const result = await service.createCollectionFromItems({
            description: parsed.data.description,
            itemIds: parsed.data.itemIds,
            name: parsed.data.name,
            userId: auth.userId,
        });

        return {
            ...result,
            status: ACTION_STATUS.CREATED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_DUPLICATE_OR_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage: "We couldn't create this collection right now.",
            log,
        });
    }
}

export async function deleteCollection(input: {
    collectionId: string;
}): Promise<CollectionDeleteResult> {
    const parsed = CollectionDeleteInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.deleteIdRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to manage collections."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const collection = await service.deleteCollection({
            collectionId: parsed.data.collectionId,
            userId: auth.userId,
        });

        return {
            collection,
            status: ACTION_STATUS.DELETED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage: "We couldn't delete this collection right now.",
            log,
        });
    }
}

export async function duplicateCollection(input: {
    collectionId: string;
}): Promise<CollectionDuplicateResult> {
    const parsed = CollectionDuplicateInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.duplicateIdRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to manage collections."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const result = await service.duplicateCollection({
            collectionId: parsed.data.collectionId,
            userId: auth.userId,
        });

        return {
            ...result,
            status: ACTION_STATUS.CREATED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage:
                "We couldn't make a copy of this collection right now.",
            log,
        });
    }
}

export async function renameCollection(input: {
    collectionId: string;
    name: string;
}): Promise<CollectionRenameResult> {
    const parsed = CollectionRenameInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.nameRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to manage collections."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const collection = await service.renameCollection({
            collectionId: parsed.data.collectionId,
            name: parsed.data.name,
            userId: auth.userId,
        });

        if (collection.shareId) {
            invalidateShareMetadataCache(collection.shareId);
        }

        return {
            collection,
            status: ACTION_STATUS.UPDATED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_DUPLICATE_OR_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage: "We couldn't rename this collection right now.",
            log,
        });
    }
}

export async function updateCollectionPriority(input: {
    collectionId: string;
    priority: CollectionPriority;
}): Promise<CollectionPriorityUpdateResult> {
    const parsed = CollectionPriorityUpdateInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.priorityRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to manage collections."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const collection = await service.updateCollectionPriority({
            collectionId: parsed.data.collectionId,
            priority: parsed.data.priority,
            userId: auth.userId,
        });

        return {
            collection,
            status: ACTION_STATUS.UPDATED,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP_NOT_FOUND,
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage:
                "We couldn't update this collection priority right now.",
            log,
        });
    }
}

export async function getSmartCollectionsPreference(): Promise<
    | { disabled: boolean; status: typeof ACTION_STATUS.SUCCESS }
    | {
          message: string;
          status:
              | typeof ACTION_STATUS.ERROR
              | typeof ACTION_STATUS.UNAUTHORIZED;
      }
> {
    const auth = await requireActionUserId(
        "Sign in again to manage smart collections."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const enabled = await service.getUserSmartCollectionsPreference({
            userId: auth.userId,
        });
        return { disabled: !enabled, status: ACTION_STATUS.SUCCESS };
    } catch (error) {
        return handleActionError({
            codeToStatus: {},
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage:
                "We couldn't fetch your smart collections preference.",
            log,
        });
    }
}

export async function setSmartCollectionsPreference(input: {
    enabled: boolean;
}): Promise<
    | { status: typeof ACTION_STATUS.UPDATED }
    | {
          message: string;
          status:
              | typeof ACTION_STATUS.ERROR
              | typeof ACTION_STATUS.INVALID
              | typeof ACTION_STATUS.UNAUTHORIZED;
      }
> {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(input);
    if (!parsed.success) {
        return {
            message: parsed.error.issues[0]?.message ?? "Invalid request.",
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to manage smart collections."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        await service.setSmartCollectionsPreference({
            enabled: parsed.data.enabled,
            userId: auth.userId,
        });

        return { status: ACTION_STATUS.UPDATED };
    } catch (error) {
        return handleActionError({
            codeToStatus: {},
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage:
                "We couldn't update your smart collections preference.",
            log,
        });
    }
}

const MediaDownloadInputSchema = z.object({
    url: z
        .string()
        .trim()
        .min(1, COLLECTION_VALIDATION_MESSAGES.downloadUrlRequired),
});

export type MediaDownloadResult =
    | {
          downloadUrl: string;
          status: typeof ACTION_STATUS.SUCCESS;
      }
    | ActionErrorWithoutNotFound;

export async function downloadMedia(url: string): Promise<MediaDownloadResult> {
    const parsed = MediaDownloadInputSchema.safeParse({ url });
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                COLLECTION_VALIDATION_MESSAGES.downloadUrlRequired
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId("Sign in again to download media.");
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const downloadUrl = await service.downloadMedia(parsed.data.url);
        return {
            downloadUrl,
            status: ACTION_STATUS.SUCCESS,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: {},
            error,
            errorFactory: LibraryCollectionError,
            fallbackMessage:
                "We hit an unexpected error while preparing your download.",
            log,
        });
    }
}
