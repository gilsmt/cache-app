import "server-only";

import * as z from "zod";
import { LibraryCollectionError } from "@/lib/collections/error";
import {
    createCollection,
    listCollections,
    updateLibraryItemCollections,
} from "@/lib/collections/service";
import {
    COLLECTION_VALIDATION_MESSAGES,
    type LibraryCollectionSummary,
} from "@/lib/collections/utils";
import { unique } from "@/lib/common/array";
import { NamedError } from "@/lib/common/error";
import { canonicalBookmarkUrl, parseStandaloneUrl } from "@/lib/common/url";
import { DEFAULT_BROWSER_PROFILE_ID } from "@/lib/integrations/browser-profiles";
import {
    type ExtensionClipBody,
    extensionClipExternalId,
} from "@/lib/integrations/extension-clip/schema";
import { upsertLibraryItemImports } from "@/lib/integrations/import";
import { prisma } from "@/prisma";
import type { CollectionPriority } from "@/prisma/client/enums";
import { LibraryItemSource } from "@/prisma/client/enums";

export const ExtensionClipError = NamedError.create(
    "ExtensionClipError",
    z.object({
        code: z.enum(["invalid_collections", "invalid_url", "upsert_failed"]),
        message: z.string(),
        operation: z.string(),
    })
);

export interface ExtensionCollectionDto {
    id: string;
    itemCount: number;
    name: string;
    priority: CollectionPriority;
}

export interface ExtensionClipUserDto {
    email: string;
    image: string | null;
    name: string | null;
}

export interface ExtensionListCollectionsResult {
    collections: ExtensionCollectionDto[];
    user: ExtensionClipUserDto;
}

export interface ExtensionCreateCollectionResult {
    collection: ExtensionCollectionDto;
}

export interface ExtensionClipResult {
    collectionIds: string[];
    created: boolean;
    itemId: string;
    smartCollectionItemIds: string[];
}

function toExtensionCollectionDto(
    collection: LibraryCollectionSummary
): ExtensionCollectionDto {
    return {
        id: collection.id,
        itemCount: collection.itemCount,
        name: collection.name,
        priority: collection.priority,
    };
}

export async function listExtensionCollections(args: {
    userId: string;
}): Promise<ExtensionListCollectionsResult> {
    const [collections, user] = await Promise.all([
        listCollections({ userId: args.userId }),
        prisma.user.findUniqueOrThrow({
            select: {
                email: true,
                image: true,
                name: true,
            },
            where: { id: args.userId },
        }),
    ]);

    return {
        collections: collections.map(toExtensionCollectionDto),
        user: {
            email: user.email,
            image: user.image,
            name: user.name,
        },
    };
}

export async function createExtensionCollection(args: {
    description?: string;
    name: string;
    userId: string;
}): Promise<ExtensionCreateCollectionResult> {
    const result = await createCollection({
        description: args.description,
        name: args.name,
        userId: args.userId,
    });

    return {
        collection: toExtensionCollectionDto(result.collection),
    };
}

export async function clipPageFromExtension(args: {
    body: ExtensionClipBody;
    userId: string;
}): Promise<ExtensionClipResult> {
    const collectionIds = unique(args.body.collectionIds);
    const validatedUrl = parseStandaloneUrl(args.body.url);
    if (!validatedUrl) {
        throw new ExtensionClipError({
            code: "invalid_url",
            message: "Enter a valid http(s) URL to clip.",
            operation: "clipPageFromExtension",
        });
    }

    const canonical = canonicalBookmarkUrl(validatedUrl.href);
    if (!canonical) {
        throw new ExtensionClipError({
            code: "invalid_url",
            message: "Enter a valid http(s) URL to clip.",
            operation: "clipPageFromExtension",
        });
    }

    const externalId = extensionClipExternalId(canonical);
    const existing = await prisma.libraryItem.findFirst({
        select: { id: true },
        where: {
            browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
            deletedAt: null,
            externalId,
            source: LibraryItemSource.extension_clip,
            userId: args.userId,
        },
    });

    const upsertResult = await upsertLibraryItemImports({
        items: [
            {
                browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
                caption: args.body.caption?.trim() || null,
                externalId,
                url: validatedUrl.href,
            },
        ],
        shouldAddToSmartCollections: () => false,
        source: LibraryItemSource.extension_clip,
        userId: args.userId,
    });

    if (upsertResult.upsertedCount + upsertResult.unchangedCount === 0) {
        throw new ExtensionClipError({
            code: "upsert_failed",
            message: "We couldn't save that page right now.",
            operation: "clipPageFromExtension",
        });
    }

    const item = await prisma.libraryItem.findFirst({
        select: { id: true },
        where: {
            browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
            deletedAt: null,
            externalId,
            source: LibraryItemSource.extension_clip,
            userId: args.userId,
        },
    });

    if (!item) {
        throw new ExtensionClipError({
            code: "upsert_failed",
            message: "We couldn't save that page right now.",
            operation: "clipPageFromExtension",
        });
    }

    try {
        const membership = await updateLibraryItemCollections({
            collectionIds,
            itemId: item.id,
            userId: args.userId,
        });

        const appliedIds = membership.collections.map(
            (collection) => collection.id
        );

        return {
            collectionIds: appliedIds,
            created: existing === null,
            itemId: item.id,
            smartCollectionItemIds:
                collectionIds.length === 0 && existing === null
                    ? [item.id]
                    : [],
        };
    } catch (error) {
        if (
            LibraryCollectionError.isInstance(error) &&
            error.data.code === "not_found"
        ) {
            throw new ExtensionClipError(
                {
                    code: "invalid_collections",
                    message:
                        error.data.message ||
                        COLLECTION_VALIDATION_MESSAGES.itemCollectionsIdRequired,
                    operation: "clipPageFromExtension",
                },
                { cause: error }
            );
        }
        throw error;
    }
}
