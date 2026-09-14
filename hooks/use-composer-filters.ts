"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import {
    parseAsArrayOf,
    parseAsBoolean,
    parseAsString,
    parseAsStringEnum,
    useQueryStates,
} from "nuqs";
import {
    COLUMN_COUNT_MODE_VALUES,
    type ColumnCountMode,
    DEFAULT_COLUMN_COUNT_MODE,
    DEFAULT_SORT_MODE,
    GROUP_BY_MODE_VALUES,
    type GroupByMode,
    SORT_MODE_VALUES,
    type SortMode,
} from "@/components/library/composer";
import {
    COLLECTION_MEMBERSHIP_FILTER_VALUES,
    type CollectionMembershipFilter,
    DEFAULT_COLLECTION_MEMBERSHIP_FILTER,
} from "@/components/library/filters";
import { LibraryItemSource } from "@/prisma/client/enums";

const COMPOSER_FILTER_PARSERS = {
    collectionMembership: parseAsStringEnum<CollectionMembershipFilter>(
        COLLECTION_MEMBERSHIP_FILTER_VALUES
    ).withDefault(DEFAULT_COLLECTION_MEMBERSHIP_FILTER),
    columns: parseAsStringEnum<ColumnCountMode>([
        ...COLUMN_COUNT_MODE_VALUES,
    ]).withDefault(DEFAULT_COLUMN_COUNT_MODE),
    domain: parseAsArrayOf(parseAsString).withDefault([]),
    duplicates: parseAsBoolean.withDefault(false),
    group: parseAsStringEnum<GroupByMode>([
        ...GROUP_BY_MODE_VALUES,
    ]).withDefault("none"),
    lastVisited: parseAsBoolean.withDefault(false),
    search: parseAsArrayOf(parseAsString).withDefault([]),
    sort: parseAsStringEnum<SortMode>([...SORT_MODE_VALUES]).withDefault(
        DEFAULT_SORT_MODE
    ),
    source: parseAsArrayOf(
        parseAsStringEnum<LibraryItemSource>(Object.values(LibraryItemSource))
    ).withDefault([]),
    unreachable: parseAsBoolean.withDefault(false),
};

export interface ComposerFiltersState {
    clearComposerFilters: () => void;
    collectionMembershipFilter: CollectionMembershipFilter;
    columnCountMode: ColumnCountMode;
    domainFilters: string[];
    duplicatesFilterEnabled: boolean;
    groupBy: GroupByMode;
    lastVisitedFilterEnabled: boolean;
    searchTerms: string[];
    setCollectionMembershipFilter: (value: CollectionMembershipFilter) => void;
    setColumnCountMode: (value: ColumnCountMode) => void;
    setDomainFilters: (
        value: string[] | ((current: string[]) => string[])
    ) => void;
    setDuplicatesFilterEnabled: (value: boolean) => void;
    setGroupBy: (value: GroupByMode) => void;
    setLastVisitedFilterEnabled: (value: boolean) => void;
    setSearchTerms: (
        value: string[] | ((current: string[]) => string[])
    ) => void;
    setSortMode: (value: SortMode) => void;
    setSourceFilters: (
        value:
            | LibraryItemSource[]
            | ((current: LibraryItemSource[]) => LibraryItemSource[])
    ) => void;
    setUnreachableFilterEnabled: (value: boolean) => void;
    sortMode: SortMode;
    sourceFilters: LibraryItemSource[];
    unreachableFilterEnabled: boolean;
}

export function useComposerFilters(): ComposerFiltersState {
    const [filters, setFilters] = useQueryStates(COMPOSER_FILTER_PARSERS);

    const setSearchTerms = useStableCallback(
        (value: string[] | ((current: string[]) => string[])) => {
            setFilters((current) => ({
                search:
                    typeof value === "function" ? value(current.search) : value,
            }));
        }
    );

    const setSourceFilters = useStableCallback(
        (
            value:
                | LibraryItemSource[]
                | ((current: LibraryItemSource[]) => LibraryItemSource[])
        ) => {
            setFilters((current) => ({
                source:
                    typeof value === "function" ? value(current.source) : value,
            }));
        }
    );

    const setDomainFilters = useStableCallback(
        (value: string[] | ((current: string[]) => string[])) => {
            setFilters((current) => ({
                domain:
                    typeof value === "function" ? value(current.domain) : value,
            }));
        }
    );

    const setCollectionMembershipFilter = useStableCallback(
        (value: CollectionMembershipFilter) => {
            setFilters({ collectionMembership: value });
        }
    );

    const setGroupBy = useStableCallback((value: GroupByMode) => {
        setFilters({ group: value });
    });

    const setSortMode = useStableCallback((value: SortMode) => {
        setFilters({ sort: value });
    });

    const setColumnCountMode = useStableCallback((value: ColumnCountMode) => {
        setFilters({ columns: value });
    });

    const setLastVisitedFilterEnabled = useStableCallback((value: boolean) => {
        setFilters({ lastVisited: value });
    });

    const setDuplicatesFilterEnabled = useStableCallback((value: boolean) => {
        setFilters({ duplicates: value });
    });

    const setUnreachableFilterEnabled = useStableCallback((value: boolean) => {
        setFilters({ unreachable: value });
    });

    const clearComposerFilters = useStableCallback(() => {
        setFilters(null);
    });

    return {
        clearComposerFilters,
        collectionMembershipFilter: filters.collectionMembership,
        columnCountMode: filters.columns,
        domainFilters: filters.domain,
        duplicatesFilterEnabled: filters.duplicates,
        groupBy: filters.group,
        lastVisitedFilterEnabled: filters.lastVisited,
        searchTerms: filters.search,
        setCollectionMembershipFilter,
        setColumnCountMode,
        setDomainFilters,
        setDuplicatesFilterEnabled,
        setGroupBy,
        setLastVisitedFilterEnabled,
        setSearchTerms,
        setSortMode,
        setSourceFilters,
        setUnreachableFilterEnabled,
        sortMode: filters.sort,
        sourceFilters: filters.source,
        unreachableFilterEnabled: filters.unreachable,
    };
}
