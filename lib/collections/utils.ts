import * as z from "zod";
import { unique } from "@/lib/common/array";
import {
    ACTION_STATUS,
    FALLBACK_URL,
    ITEM_KIND_BOOKMARK,
    ITEM_KIND_NOTE,
    LIBRARY_ITEM_TRASH_WINDOW_DAYS,
    SORT_ASC,
} from "@/lib/common/constants";
import { toCsv } from "@/lib/common/csv";
import { parseDate } from "@/lib/common/date";
import { normalizeWhitespace, truncateText } from "@/lib/common/string";
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

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getRecentlyDeletedDaysRemaining(
    deletedAt: Date | string | null | undefined,
    nowMs = Date.now()
): number {
    const deletedAtMs = parseDate(deletedAt)?.getTime() ?? nowMs;
    const expiresAtMs =
        deletedAtMs + LIBRARY_ITEM_TRASH_WINDOW_DAYS * DAY_IN_MS;
    return Math.max(0, Math.round((expiresAtMs - nowMs) / DAY_IN_MS));
}

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
    priority: CollectionPriority;
    sharedAt: Date | null;
    shareId: string | null;
    updatedAt: Date;
}

/**
 * Maps collection ids to the shape Prisma uses to connect a many-to-many
 * relation.
 */
export function toIdConnections(ids: readonly string[]): Array<{
    id: string;
}> {
    return ids.map((id) => ({ id }));
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

export const COLLECTION_NAME_LENGTH_MAX = 64;

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

export const STATUS_MAP_NOT_FOUND = {
    not_found: ACTION_STATUS.NOT_FOUND,
} as const;

export const STATUS_MAP_DUPLICATE_OR_NOT_FOUND = {
    duplicate_name: ACTION_STATUS.DUPLICATE,
    not_found: ACTION_STATUS.NOT_FOUND,
} as const;

export function uniqueLibraryItemSources(
    items: readonly { source: LibraryItemSource }[]
): LibraryItemSource[] {
    return unique(items.map((item) => item.source));
}

export function truncateLabel(label: string, max = 22): string {
    return truncateText(label, max);
}

export function getNoteExcerpt(
    text: string | null | undefined,
    maxLength = 180
): string {
    return truncateText(normalizeWhitespace(text ?? ""), maxLength);
}

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

/**
 * Converts one query result. Shared collection references let React serialize
 * each collection once instead of repeating its fields for every membership.
 */
export function toLibraryItemsWithCollections(
    items: readonly Prisma.LibraryItemGetPayload<{
        include: typeof LIBRARY_ITEM_COLLECTIONS_INCLUDE;
    }>[]
): LibraryItemWithCollections[] {
    const collectionsById = new Map<string, LibraryCollectionTag>();
    return items.map((item) => ({
        ...item,
        collections: item.collections.map((collection) => {
            const cached = collectionsById.get(collection.id);
            if (cached !== undefined) {
                return cached;
            }
            const tag = toLibraryCollectionTag(collection);
            collectionsById.set(tag.id, tag);
            return tag;
        }),
    }));
}

/**
 * Returns the redirect URL for a bookmark's preview image.
 * The redirect points at the upstream image; use for <img> display.
 * Notes and invalid URLs return null.
 */
export function itemPreviewImageUrl(item: {
    kind: string;
    url: string;
}): string | null {
    return itemPreviewImageDeliveryUrl(item, "redirect");
}

/**
 * Returns the proxied URL for a bookmark's preview image.
 * Same-origin bytes; use for canvas pixel reads (palette extraction).
 * A redirect URL taints the canvas when the upstream host is
 * cross-origin, so Vibrant cannot read it. Notes and invalid URLs
 * return null.
 */
export function itemPreviewImageProxyUrl(item: {
    kind: string;
    url: string;
}): string | null {
    return itemPreviewImageDeliveryUrl(item, "proxy");
}

function itemPreviewImageDeliveryUrl(
    item: {
        kind: string;
        url: string;
    },
    delivery: "proxy" | "redirect"
): string | null {
    if (item.kind !== ITEM_KIND_BOOKMARK) {
        return null;
    }

    const href = toValidUrl(item.url);
    if (href === FALLBACK_URL) {
        return null;
    }

    return `/api/preview?url=${encodeURIComponent(href)}&delivery=${delivery}`;
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
 */
export function buildItemsCsv(
    headerLabel: string,
    label: string,
    items: LibraryItemWithCollections[]
): string {
    return toCsv([
        [
            headerLabel,
            "Caption",
            "URL",
            "Source",
            "Kind",
            "Saved At",
            "Posted At",
        ],
        ...items.map((item) => [
            label,
            item.caption ?? "",
            normalizeURL(item.url),
            item.source,
            item.kind,
            item.createdAt.toISOString(),
            item.postedAt?.toISOString() ?? "",
        ]),
    ]);
}
