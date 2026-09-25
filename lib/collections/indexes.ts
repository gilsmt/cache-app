import {
    itemPreviewImageUrl,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { fnv1aHash } from "@/lib/common/hash";

const COLLECTION_PREVIEW_THUMBNAIL_LIMIT = 5;

type LibraryItemPreviewUrlCache = WeakMap<
    LibraryItemWithCollections,
    string | null
>;

interface PreviewEntry {
    orderSeed: number;
    url: string;
}

export interface LibraryItemIndexes {
    collectionPreviewThumbnailUrlsById: Map<string, string[]>;
    favoriteItemIdSet: ReadonlySet<string>;
    favoriteItems: LibraryItemWithCollections[];
    itemsByCollectionId: Map<string, LibraryItemWithCollections[]>;
}

export function buildLibraryItemIndexes(
    items: readonly LibraryItemWithCollections[],
    previewUrlCache: LibraryItemPreviewUrlCache = new WeakMap()
): LibraryItemIndexes {
    const itemsByCollectionId = new Map<string, LibraryItemWithCollections[]>();
    const previewEntriesByCollectionId = new Map<string, PreviewEntry[]>();
    const favoriteItems: Array<
        LibraryItemWithCollections & { favoritedAt: Date }
    > = [];

    for (const item of items) {
        if (isFavoritedItem(item)) {
            favoriteItems.push(item);
        }

        let previewUrl: string | null = null;
        if (item.collections.length > 0) {
            const cachedPreviewUrl = previewUrlCache.get(item);
            previewUrl =
                cachedPreviewUrl === undefined
                    ? itemPreviewImageUrl(item)
                    : cachedPreviewUrl;
            if (cachedPreviewUrl === undefined) {
                previewUrlCache.set(item, previewUrl);
            }
        }

        for (const collection of item.collections) {
            const entries = itemsByCollectionId.get(collection.id);
            if (entries) {
                entries.push(item);
            } else {
                itemsByCollectionId.set(collection.id, [item]);
            }

            let previewEntries = previewEntriesByCollectionId.get(
                collection.id
            );
            if (!previewEntries) {
                previewEntries = [];
                previewEntriesByCollectionId.set(collection.id, previewEntries);
            }

            if (previewUrl !== null) {
                addPreviewEntry(previewEntries, {
                    orderSeed: fnv1aHash(`${collection.id}:${item.id}`),
                    url: previewUrl,
                });
            }
        }
    }

    const collectionPreviewThumbnailUrlsById = new Map<string, string[]>();
    for (const [collectionId, previewEntries] of previewEntriesByCollectionId) {
        collectionPreviewThumbnailUrlsById.set(
            collectionId,
            previewEntries.map((entry) => entry.url)
        );
    }

    favoriteItems.sort(
        (left, right) =>
            right.favoritedAt.getTime() - left.favoritedAt.getTime()
    );
    const favoriteItemIdSet = new Set<string>();
    for (const item of favoriteItems) {
        favoriteItemIdSet.add(item.id);
    }

    return {
        collectionPreviewThumbnailUrlsById,
        favoriteItemIdSet,
        favoriteItems,
        itemsByCollectionId,
    };
}

function addPreviewEntry(
    entries: PreviewEntry[],
    candidate: PreviewEntry
): void {
    let insertionIndex = entries.length;
    while (insertionIndex > 0) {
        const previousEntry = entries[insertionIndex - 1];
        if (
            previousEntry === undefined ||
            previousEntry.orderSeed <= candidate.orderSeed
        ) {
            break;
        }
        insertionIndex -= 1;
    }

    if (insertionIndex >= COLLECTION_PREVIEW_THUMBNAIL_LIMIT) {
        return;
    }

    entries.splice(insertionIndex, 0, candidate);
    if (entries.length > COLLECTION_PREVIEW_THUMBNAIL_LIMIT) {
        entries.pop();
    }
}

function isFavoritedItem(
    item: LibraryItemWithCollections
): item is LibraryItemWithCollections & { favoritedAt: Date } {
    return item.favoritedAt !== null;
}
