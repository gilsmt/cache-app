import { parseDisplayUrl } from "@/lib/common/url";
import type { LibraryItemSource } from "@/prisma/client/enums";

export type CollectionMembershipFilter =
    | "all"
    | "in-collections"
    | "not-in-collections";

export const COLLECTION_MEMBERSHIP_FILTER_VALUES: CollectionMembershipFilter[] =
    ["all", "in-collections", "not-in-collections"];

export const DEFAULT_COLLECTION_MEMBERSHIP_FILTER: CollectionMembershipFilter =
    "all";

export const UNSPECIFIC_LIBRARY_DOMAIN = "Other";

export function getLibraryItemDomain(url: string): string {
    return parseDisplayUrl(url) || UNSPECIFIC_LIBRARY_DOMAIN;
}

interface FilterableComposerItem {
    caption: string | null;
    collections: Array<{ id: string }>;
    id: string;
    noteContentText: string | null;
    source: LibraryItemSource;
    url: string;
}

interface FilterComposerItemsInput {
    collectionMembershipFilter: CollectionMembershipFilter;
    domainFilters: string[];
    duplicateItemIds: ReadonlySet<string>;
    duplicatesFilterEnabled: boolean;
    lastVisitedItemIds: string[];
    searchTerms: string[];
    selectedCollectionIds: string[];
    sourceFilters: LibraryItemSource[];
    unreachableFilterEnabled: boolean;
    unreachableItemIds: ReadonlySet<string>;
}

export function browserHasActiveFilters(
    input: Omit<
        FilterComposerItemsInput,
        "duplicateItemIds" | "unreachableItemIds"
    >
): boolean {
    return (
        input.searchTerms.length > 0 ||
        input.selectedCollectionIds.length > 0 ||
        input.sourceFilters.length > 0 ||
        input.domainFilters.length > 0 ||
        input.collectionMembershipFilter !==
            DEFAULT_COLLECTION_MEMBERSHIP_FILTER ||
        input.lastVisitedItemIds.length > 0 ||
        input.duplicatesFilterEnabled ||
        input.unreachableFilterEnabled
    );
}

export function filterComposerItems<T extends FilterableComposerItem>(
    items: T[],
    input: FilterComposerItemsInput
): T[] {
    if (!browserHasActiveFilters(input)) {
        return items;
    }

    let list = [...items];
    const normalizedSearchTerms = input.searchTerms.map((term) =>
        term.trim().toLowerCase()
    );

    if (input.lastVisitedItemIds.length > 0) {
        const lastVisitedIdSet = new Set(input.lastVisitedItemIds);
        list = list.filter((item) => lastVisitedIdSet.has(item.id));
    }

    if (input.duplicatesFilterEnabled) {
        list = list.filter((item) => input.duplicateItemIds.has(item.id));
    }

    if (input.unreachableFilterEnabled) {
        list = list.filter((item) => input.unreachableItemIds.has(item.id));
    }

    // Selections suspend while "not in collections" is active: the two
    // filters are mutually exclusive, and AND-ing them always yields
    // zero results.
    if (
        input.selectedCollectionIds.length > 0 &&
        input.collectionMembershipFilter !== "not-in-collections"
    ) {
        const selectedCollectionIdSet = new Set(input.selectedCollectionIds);
        list = list.filter((item) =>
            item.collections.some((collection) =>
                selectedCollectionIdSet.has(collection.id)
            )
        );
    }

    if (input.collectionMembershipFilter === "in-collections") {
        list = list.filter((item) => item.collections.length > 0);
    }

    if (input.collectionMembershipFilter === "not-in-collections") {
        list = list.filter((item) => item.collections.length === 0);
    }

    if (normalizedSearchTerms.length > 0) {
        list = list.filter((item) => {
            const cap = item.caption?.toLowerCase() ?? "";
            const noteText = item.noteContentText?.toLowerCase() ?? "";
            const url = item.url.toLowerCase();
            return normalizedSearchTerms.some(
                (term) =>
                    cap.includes(term) ||
                    noteText.includes(term) ||
                    url.includes(term)
            );
        });
    }

    if (input.sourceFilters.length > 0) {
        const sourceFilterSet = new Set(input.sourceFilters);
        list = list.filter((item) => sourceFilterSet.has(item.source));
    }

    if (input.domainFilters.length > 0) {
        const domainFilterSet = new Set(input.domainFilters);
        list = list.filter((item) =>
            domainFilterSet.has(getLibraryItemDomain(item.url))
        );
    }

    return list;
}
