import * as z from "zod";
import { unique } from "@/lib/common/array";
import {
    ACTION_STATUS,
    FALLBACK_URL,
    ITEM_KIND_BOOKMARK,
    ITEM_KIND_NOTE,
    SORT_ASC,
} from "@/lib/common/constants";
import { parseDate } from "@/lib/common/date";
import { escapeCsv, neutralizeCsvFormula } from "@/lib/common/string";
import { normalizeURL, toValidUrl } from "@/lib/common/url";
import { isCobaltHost } from "@/lib/integrations/cobalt/utils";
import type { LibraryItem, Prisma } from "@/prisma/client/client";
import type {
    CollectionPriority,
    LibraryItemSource,
} from "@/prisma/client/enums";

/**
 * How long a card stays eligible for the Smart Collections “just organized”
 * affordance (aria-label). Separate from the CSS animation duration (2.2s).
 */
export const SMART_COLLECTED_RECENT_WINDOW_MS = 3 * 60 * 1000;

/**
 * True when Smart Collections assigned memberships recently enough that the
 * library card may surface a temporary intelligence affordance.
 */
export function isRecentlySmartCollected(
    smartCollectedAt: Date | string | null | undefined,
    nowMs = Date.now()
): boolean {
    const collectedAt = parseDate(smartCollectedAt);
    if (!collectedAt) {
        return false;
    }
    const ageMs = nowMs - collectedAt.getTime();
    return ageMs >= 0 && ageMs < SMART_COLLECTED_RECENT_WINDOW_MS;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface LibraryCollectionTag {
    createdAt: Date;
    description: string | null;
    id: string;
    name: string;
    priority: CollectionPriority;
    sharedAt: Date | null;
    shareId: string | null;
    updatedAt: Date;
}

export interface LibraryCollectionSummary extends LibraryCollectionTag {
    itemCount: number;
    sources: LibraryItemSource[];
}

/** Field the collections list is sorted by; "text-match" ranks by name query match. */
export type CollectionSortField =
    | "count"
    | "created"
    | "name"
    | "priority"
    | "text-match"
    | "updated";

export interface LibraryItemWithCollections extends LibraryItem {
    collections: LibraryCollectionTag[];
}

export interface LibraryCollectionTagRecord {
    createdAt: Date;
    description: string | null;
    id: string;
    name: string;
    priority: LibraryCollectionTag["priority"];
    sharedAt: Date | null;
    shareId: string | null;
    updatedAt: Date;
}

export interface LibraryCollectionSummaryRecord
    extends LibraryCollectionTagRecord {
    _count: {
        items: number;
    };
    items: Array<{
        source: LibraryItemSource;
    }>;
}

// ---------------------------------------------------------------------------
// Shared action error shapes
// ---------------------------------------------------------------------------

export interface ActionError {
    message: string;
    status:
        | typeof ACTION_STATUS.ERROR
        | typeof ACTION_STATUS.INVALID
        | typeof ACTION_STATUS.NOT_FOUND
        | typeof ACTION_STATUS.UNAUTHORIZED;
}

export interface ActionErrorWithDuplicate {
    message: string;
    status:
        | typeof ACTION_STATUS.DUPLICATE
        | typeof ACTION_STATUS.ERROR
        | typeof ACTION_STATUS.INVALID
        | typeof ACTION_STATUS.NOT_FOUND
        | typeof ACTION_STATUS.UNAUTHORIZED;
}

export interface ActionErrorWithoutNotFound {
    message: string;
    status:
        | typeof ACTION_STATUS.ERROR
        | typeof ACTION_STATUS.INVALID
        | typeof ACTION_STATUS.UNAUTHORIZED;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export const COLLECTION_NAME_LENGTH_MAX = 64;

const DEDUPE_STRING_MAX_LENGTH = 64;

export const COLLECTION_VALIDATION_MESSAGES = {
    deleteIdRequired: "Select a collection to delete.",
    downloadUrlRequired: "A valid URL is required to download media.",
    duplicateIdRequired: "Select a collection to copy.",
    itemCollectionsBatchedIdRequired:
        "Pick valid collections and saved items before saving.",
    itemCollectionsIdRequired: "Pick valid collections before saving.",
    itemDeleteIdRequired: "Select a saved item before trying to delete it.",
    itemFavoriteIdRequired: "Select a saved item before favoriting.",
    itemPurgeIdRequired: "Select a trashed item to permanently delete.",
    itemRestoreIdRequired: "Select a trashed item to restore.",
    manageIdRequired: "Select a collection to update.",
    nameAndItemsRequired:
        "Enter a valid collection name and at least one saved item.",
    nameRequired: "Enter a valid collection name.",
    priorityRequired: "Pick a valid priority before saving.",
    renameIdRequired: "Select a collection to rename.",
    shareIdRequired: "Select a collection to share.",
    unshareIdRequired: "Select a collection to stop sharing.",
} as const;

export const collectionNameSchema = z
    .string()
    .trim()
    .min(1, "Enter a collection name.")
    .max(
        COLLECTION_NAME_LENGTH_MAX,
        `Collection names can be up to ${COLLECTION_NAME_LENGTH_MAX} characters.`
    );

// ---------------------------------------------------------------------------
// Prisma selections
// ---------------------------------------------------------------------------

export const LIBRARY_COLLECTION_TAG_SELECT = {
    createdAt: true,
    description: true,
    id: true,
    name: true,
    priority: true,
    sharedAt: true,
    shareId: true,
    updatedAt: true,
} as const satisfies Prisma.CollectionSelect;

export const LIBRARY_ITEM_COLLECTIONS_INCLUDE = {
    collections: {
        orderBy: {
            name: SORT_ASC,
        },
        select: LIBRARY_COLLECTION_TAG_SELECT,
    },
} as const;

export const LIBRARY_ITEM_COLLECTIONS_SELECT = {
    collections: {
        orderBy: {
            name: SORT_ASC,
        },
        select: LIBRARY_COLLECTION_TAG_SELECT,
    },
    id: true,
} as const satisfies Prisma.LibraryItemSelect;

// ---------------------------------------------------------------------------
// Shared status maps
// ---------------------------------------------------------------------------

export const STATUS_MAP_NOT_FOUND = {
    not_found: ACTION_STATUS.NOT_FOUND,
} as const;

export const STATUS_MAP_DUPLICATE_OR_NOT_FOUND = {
    duplicate_name: ACTION_STATUS.DUPLICATE,
    not_found: ACTION_STATUS.NOT_FOUND,
} as const;

export const STATUS_MAP_TRASHED_ITEM = {
    not_found: ACTION_STATUS.NOT_FOUND,
    not_trashed: ACTION_STATUS.NOT_FOUND,
} as const;

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

export function uniqueLibraryItemSources(
    items: readonly { source: LibraryItemSource }[]
): LibraryItemSource[] {
    return unique(items.map((item) => item.source));
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

export function toLibraryCollectionTag(
    collection: LibraryCollectionTagRecord
): LibraryCollectionTag {
    return {
        createdAt: collection.createdAt,
        description: collection.description,
        id: collection.id,
        name: collection.name,
        priority: collection.priority,
        sharedAt: collection.sharedAt,
        shareId: collection.shareId,
        updatedAt: collection.updatedAt,
    };
}

export function toLibraryCollectionSummary(
    collection: LibraryCollectionSummaryRecord
): LibraryCollectionSummary {
    return {
        ...toLibraryCollectionTag(collection),
        itemCount: collection._count.items,
        sources: uniqueLibraryItemSources(collection.items),
    };
}

export function toLibraryCollectionSummaryFromTagRecord(
    collection: LibraryCollectionTagRecord,
    items: Array<{ source: LibraryItemSource }>
): LibraryCollectionSummary {
    return {
        ...toLibraryCollectionTag(collection),
        itemCount: items.length,
        sources: uniqueLibraryItemSources(items),
    };
}

export function toLibraryItemWithCollections(
    item: Prisma.LibraryItemGetPayload<{
        include: typeof LIBRARY_ITEM_COLLECTIONS_INCLUDE;
    }>
): LibraryItemWithCollections {
    return {
        ...item,
        collections: item.collections.map(toLibraryCollectionTag),
    };
}

function internString<T extends string>(
    cache: Map<string, string>,
    value: T
): T {
    if (value.length > DEDUPE_STRING_MAX_LENGTH) {
        return value;
    }
    const cached = cache.get(value);
    if (cached !== undefined) {
        return cached as T;
    }
    cache.set(value, value);
    return value;
}

function deduplicateCollection(
    collection: LibraryCollectionTag,
    stringCache: Map<string, string>,
    collectionCache: Map<string, LibraryCollectionTag>
): LibraryCollectionTag {
    const cached = collectionCache.get(collection.id);
    if (cached !== undefined) {
        return cached;
    }
    const interned: LibraryCollectionTag = {
        ...collection,
        description:
            collection.description === null
                ? null
                : internString(stringCache, collection.description),
        id: internString(stringCache, collection.id),
        name: internString(stringCache, collection.name),
        priority: internString(stringCache, collection.priority),
        shareId:
            collection.shareId === null
                ? null
                : internString(stringCache, collection.shareId),
    };
    collectionCache.set(interned.id, interned);
    return Object.freeze(interned);
}

export function deduplicateLibraryItems(
    items: readonly LibraryItemWithCollections[]
): LibraryItemWithCollections[] {
    if (items.length === 0) {
        return [];
    }
    const stringCache = new Map<string, string>();
    const collectionCache = new Map<string, LibraryCollectionTag>();
    return items.map((item) => {
        const kind = internString(stringCache, item.kind);
        const source = internString(stringCache, item.source);
        const browserProfileId = internString(
            stringCache,
            item.browserProfileId
        );
        const userId = internString(stringCache, item.userId);
        const sourceDeviceId =
            item.sourceDeviceId === null
                ? null
                : internString(stringCache, item.sourceDeviceId);
        const sourceDeviceName =
            item.sourceDeviceName === null
                ? null
                : internString(stringCache, item.sourceDeviceName);
        const parentExternalId =
            item.parentExternalId === null
                ? null
                : internString(stringCache, item.parentExternalId);
        const collections = item.collections.map((collection) =>
            deduplicateCollection(collection, stringCache, collectionCache)
        );
        return {
            ...item,
            browserProfileId,
            collections,
            kind,
            parentExternalId,
            source,
            sourceDeviceId,
            sourceDeviceName,
            userId,
        };
    });
}

/**
 * Returns the API proxy URL for a bookmark's preview image.
 * Notes and invalid URLs return null.
 */
export function itemPreviewImageUrl(item: {
    kind: string;
    url: string;
}): string | null {
    if (item.kind !== ITEM_KIND_BOOKMARK) {
        return null;
    }

    const href = toValidUrl(item.url);
    if (href === FALLBACK_URL) {
        return null;
    }

    return `/api/preview?url=${encodeURIComponent(href)}&delivery=redirect`;
}

/**
 * Returns the API proxy URL for a bookmark's video preview.
 * Only supported hosts (YouTube, X, Instagram, TikTok) return a URL.
 */
export function itemPreviewVideoUrl(item: {
    kind: string;
    url: string;
}): string | null {
    if (item.kind !== ITEM_KIND_BOOKMARK) {
        return null;
    }

    const href = toValidUrl(item.url);
    if (href === FALLBACK_URL) {
        return null;
    }

    if (!isCobaltHost(href)) {
        return null;
    }

    return `/api/preview?url=${encodeURIComponent(href)}&type=video`;
}

export function getLibraryItemTitle(item: LibraryItemWithCollections): string {
    if (item.kind === ITEM_KIND_NOTE) {
        return "";
    }
    const caption = item.caption?.trim();
    if (caption) {
        return caption;
    }
    return item.url;
}

export function getLibraryItemPrimaryText(
    item: LibraryItemWithCollections
): string {
    if (item.kind === ITEM_KIND_NOTE) {
        return item.noteContentText?.trim() || "Untitled note";
    }
    const caption = item.caption?.trim();
    return caption && caption.length > 0 ? caption : item.url;
}

/**
 * Builds a CSV export of library items prefixed with a leading grouping
 * column whose header cell is `headerLabel` and whose data cells are `label`.
 * Defaults to the RFC 4180 CRLF record separator.
 */
export function buildItemsCsv(
    headerLabel: string,
    label: string,
    items: LibraryItemWithCollections[],
    recordSeparator = "\r\n"
): string {
    const headers = [
        neutralizeCsvFormula(headerLabel),
        "Caption",
        "URL",
        "Source",
        "Kind",
        "Saved At",
        "Posted At",
    ];
    const rows = items.map((item) => [
        neutralizeCsvFormula(label),
        neutralizeCsvFormula(item.caption ?? ""),
        neutralizeCsvFormula(normalizeURL(item.url)),
        item.source,
        item.kind,
        item.createdAt.toISOString(),
        item.postedAt?.toISOString() ?? "",
    ]);

    return [headers, ...rows]
        .map((row) => row.map(escapeCsv).join(","))
        .join(recordSeparator);
}
