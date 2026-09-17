"use client";

import type {
    AutocompleteRootChangeEventDetails,
    BaseUIEvent,
} from "@base-ui/react";
import { Toolbar } from "@base-ui/react/toolbar";
import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { Calligraph } from "calligraph";
import { cn } from "cn";
import { T } from "gt-next";
import {
    ArrowDownWideNarrow,
    Check,
    CopyIcon,
    CopyX,
    DownloadIcon,
    FolderOpen,
    Funnel,
    Globe,
    Grid2x2,
    Grid2x2X,
    History,
    Layers3,
    RotateCcw,
    SearchIcon,
    SearchX,
    Square,
    SquarePen,
    Tags,
    Volume2,
    XIcon,
} from "lucide-react";
import * as React from "react";
import { Streamdown } from "streamdown";
import { ThinkingOrb } from "thinking-orbs";
import {
    type CollectionMembershipFilter,
    DEFAULT_COLLECTION_MEMBERSHIP_FILTER,
    getLibraryItemDomain,
    UNSPECIFIC_LIBRARY_DOMAIN,
} from "@/components/session/filters";
import {
    Attachment,
    AttachmentInfo,
    AttachmentPreview,
    AttachmentPreviewCard,
    AttachmentPreviewCardPopup,
    AttachmentPreviewCardTrigger,
    AttachmentRemove,
    Attachments,
    getAttachmentLabel,
    getMediaCategory,
} from "@/components/ui/attachments";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel } from "@/components/ui/collapsible";
import { CollapsibleListHorizontal } from "@/components/ui/collapsible-list";
import {
    Command,
    CommandCollection,
    CommandEmpty,
    CommandGroup,
    CommandGroupLabel,
    CommandInput,
    CommandItem,
    CommandList,
    CommandPopup,
    CommandRow,
    CommandShortcut,
    useCommandFilter,
} from "@/components/ui/command";
import {
    DataList,
    DataListChart,
    DataListGroup,
    DataListHeader,
    DataListItem,
    DataListSection,
    DataListTitle,
} from "@/components/ui/data-list";
import { GradientWaveText } from "@/components/ui/gradient-wave-text";
import { CmdKbd, Kbd } from "@/components/ui/kbd";
import {
    Popover,
    PopoverClose,
    PopoverPopup,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useSpeechSynthesis } from "@/hooks/use-speech-synthesis";
import { itemCanonicalGroupKey } from "@/lib/collections/library-quality";
import type { LibraryMetricsSnapshot } from "@/lib/collections/metrics";
import type {
    LibraryCollectionSummary,
    LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { removeValue, toggleValue } from "@/lib/common/array";
import { CACHE_EXTENSION_DOWNLOAD_URL } from "@/lib/common/constants";
import type { createFileAttachment } from "@/lib/common/file";
import { filterValidImageUrls } from "@/lib/common/image";
import { createLogger } from "@/lib/common/logs/console/logger";
import { formatSharePercent } from "@/lib/common/number";
import { truncateLabel } from "@/lib/common/string";
import { openExternalUrl } from "@/lib/common/url";
import { LibraryItemSource } from "@/prisma/client/enums";

const MATCH_WORD_SEPARATOR_PATTERN = /[\s:./_-]+/;
const MARKDOWN_CODE_FENCE_PATTERN = /```[\s\S]*?```/g;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]*\)/g;
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\([^)]*\)/g;
const MARKDOWN_INLINE_CODE_PATTERN = /`([^`]*)`/g;
const MARKDOWN_BARE_URL_PATTERN = /https?:\/\/\S+/g;
const MARKDOWN_HTML_TAG_PATTERN = /<[^>]*>/g;
const MARKDOWN_HEADING_PATTERN = /^#{1,6}\s+/gm;
const MARKDOWN_QUOTE_MARKER_PATTERN = /^>[ \t]?/gm;
const MARKDOWN_LIST_MARKER_PATTERN = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm;
const MARKDOWN_TABLE_ROW_PATTERN = /^[ \t]*\|?[ \t:|-]+\|?[ \t]*$/gm;
const MARKDOWN_TABLE_EDGE_PIPE_PATTERN = /^[ \t]*\||\|[ \t]*$/gm;
const MARKDOWN_TABLE_PIPE_PATTERN = /\|/g;
const MARKDOWN_EMPHASIS_PATTERN = /(\*\*|__|\*|_|~~)(.+?)\1/g;
const WHITESPACE_COLLAPSE_PATTERN = /\s+/g;
const EMPHASIS_CLEANUP_PASS_COUNT = 3;

export const SUGGESTION_LIMIT = 3;
export const SUGGESTION_ICON_CLASS = "size-3.5 shrink-0";
export const MULTI_WORD_QUERY_PATTERN = /\S+\s+\S+/;
export const COMBOBOX_ITEM_PRESS_REASON = "item-press";
export const COMBOBOX_ESCAPE_KEY_REASON = "escape-key";
export const ALL_DOMAIN_FILTER = "__all_domains__";
export const COMPOSER_OPEN_HOTKEYS = [
    "ctrl+g",
    "ctrl+k",
    "ctrl+p",
    "cmd+g",
    "cmd+k",
    "cmd+p",
    "Meta+g",
    "Meta+k",
    "Meta+p",
] as const;
export const COLLECTION_NAME_MAX_LENGTH = 64;

export const FILTERABLE_LIBRARY_SOURCES = [
    LibraryItemSource.cache_note,
    LibraryItemSource.chrome_bookmarks,
    LibraryItemSource.extension_clip,
    LibraryItemSource.github_starred_repositories,
    LibraryItemSource.google_photos,
    LibraryItemSource.instagram,
    LibraryItemSource.markdown_import,
    LibraryItemSource.pinterest,
    LibraryItemSource.rss_feed,
    LibraryItemSource.tiktok,
    LibraryItemSource.x_bookmarks,
    LibraryItemSource.youtube_watch_later,
] as const satisfies LibraryItemSource[];

export const SOURCE_LABEL_BY_VALUE: Partial<Record<string, string>> = {
    [LibraryItemSource.cache_note]: "Notes",
    [LibraryItemSource.chrome_bookmarks]: "Chrome",
    [LibraryItemSource.extension_clip]: "Web",
    [LibraryItemSource.markdown_import]: "Markdown",
    [LibraryItemSource.github_starred_repositories]: "GitHub",
    [LibraryItemSource.google_photos]: "Google Photos",
    [LibraryItemSource.instagram]: "Instagram",
    [LibraryItemSource.pinterest]: "Pinterest",
    [LibraryItemSource.rss_feed]: "RSS",
    [LibraryItemSource.tiktok]: "TikTok",
    [LibraryItemSource.x_bookmarks]: "X",
    [LibraryItemSource.youtube_watch_later]: "YouTube",
};

export const PALETTE_PLACEHOLDER_BY_SECTION: Partial<
    Record<PaletteSection, string>
> = {
    columns: "Set the number of columns",
    filter: "Filter the library",
    group: "Group results",
    sort: "Sort results",
};

export const PALETTE_SORT_OPTIONS = [
    { label: "Added: Newest first", value: "added-newest" },
    { label: "Added: Oldest first", value: "added-oldest" },
    { label: "Created: Newest first", value: "created-newest" },
    { label: "Created: Oldest first", value: "created-oldest" },
    { label: "Count: Most items first", value: "count-desc" },
    { label: "Source", value: "source" },
    { label: "Domain", value: "domain" },
    { label: "Title", value: "title" },
] satisfies readonly { label: string; value: SortMode }[];

export const PALETTE_GROUP_OPTIONS = [
    { label: "No grouping", value: "none" },
    { label: "Source", value: "source" },
    { label: "Domain", value: "domain" },
    { label: "Collection", value: "collection" },
    { label: "Year Added", value: "year-added" },
    { label: "Year Created", value: "year-created" },
    { label: "Month Added", value: "month-added" },
    { label: "Month Created", value: "month-created" },
] satisfies readonly { label: string; value: GroupByMode }[];

export const PALETTE_COLUMN_OPTIONS = [
    { label: "Adjust automatically", value: "auto" },
    { label: "2 columns", value: "2" },
    { label: "3 columns", value: "3" },
    { label: "4 columns", value: "4" },
    { label: "5 columns", value: "5" },
    { label: "6 columns", value: "6" },
] satisfies readonly { label: string; value: ColumnCountMode }[];

export const PALETTE_SOURCE_OPTIONS = [
    { label: "All sources", value: "all" },
    ...FILTERABLE_LIBRARY_SOURCES.map((source) => ({
        label: SOURCE_LABEL_BY_VALUE[source] ?? "Other",
        value: source,
    })),
    {
        label: SOURCE_LABEL_BY_VALUE[LibraryItemSource.other] ?? "Other",
        value: LibraryItemSource.other,
    },
] satisfies readonly { label: string; value: LibraryItemSource | "all" }[];

export const PALETTE_SOURCE_FILTER_OPTIONS = PALETTE_SOURCE_OPTIONS.filter(
    (
        option
    ): option is {
        label: string;
        value: Exclude<(typeof PALETTE_SOURCE_OPTIONS)[number]["value"], "all">;
    } => option.value !== "all"
);

export const NAME_COLLATOR = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
});

export interface ComposerAttachment
    extends ReturnType<typeof createFileAttachment> {
    id: string;
}

export interface ComposerPaletteStackEntry {
    chip: React.ReactNode;
    key: string;
    onRemove: () => void;
}

export interface ComposerPaletteItem {
    description?: string;
    disabled?: boolean;
    isActive?: boolean;
    label: string;
    onSelect: (
        event: BaseUIEvent<React.MouseEvent> | KeyboardEvent
    ) => void | Promise<void>;
    render?: (item: ComposerPaletteItem) => React.ReactNode;
    shortcut?: string;
    value: string;
}

export interface ComposerPaletteGroup {
    items: ComposerPaletteItem[];
    label: string;
    layout?: "horizontal" | "vertical";
}

export interface ComposerSuggestion {
    icon?: React.ReactNode;
    label: string;
    onSelect: () => void;
}

export type GroupByMode =
    | "none"
    | "source"
    | "domain"
    | "collection"
    | "year-added"
    | "year-created"
    | "month-added"
    | "month-created";

export type EffectiveGroupByMode = GroupByMode | "canonical-url";

export type SortMode =
    | "added-newest"
    | "added-oldest"
    | "created-newest"
    | "created-oldest"
    | "count-desc"
    | "source"
    | "domain"
    | "title";

export type ColumnCountMode = "auto" | "2" | "3" | "4" | "5" | "6";

export const GROUP_BY_MODE_VALUES = [
    "none",
    "source",
    "domain",
    "collection",
    "year-added",
    "year-created",
    "month-added",
    "month-created",
] as const satisfies readonly GroupByMode[];

export const SORT_MODE_VALUES = [
    "added-newest",
    "added-oldest",
    "created-newest",
    "created-oldest",
    "count-desc",
    "source",
    "domain",
    "title",
] as const satisfies readonly SortMode[];

export const COLUMN_COUNT_MODE_VALUES = [
    "auto",
    "2",
    "3",
    "4",
    "5",
    "6",
] as const satisfies readonly ColumnCountMode[];

export type PaletteSection =
    | "search"
    | "filter"
    | "group"
    | "sort"
    | "columns"
    | "ai-response";

export const DEFAULT_SORT_MODE = "added-newest" as const;
export const DEFAULT_COLUMN_COUNT_MODE: ColumnCountMode = "auto";

export const ALL_GROUPING_MODES: GroupByMode[] = [
    "source",
    "domain",
    "collection",
    "year-added",
    "year-created",
    "month-added",
    "month-created",
];

export type AskCacheResponseState =
    | { prompt: string; status: "loading" }
    | {
          markdown: string;
          operationCount: number;
          prompt: string;
          status: "success";
      }
    | { message: string; prompt: string; status: "error" };

export interface BuildComposerSuggestionsInput {
    clearLibraryPalette: () => void;
    collectionMembershipFilter: CollectionMembershipFilter;
    collections: LibraryCollectionSummary[];
    domainFilters: string[];
    duplicatesFilterEnabled: boolean;
    groupBy: GroupByMode;
    isExtensionInstalled: boolean;
    items: LibraryItemWithCollections[];
    lastVisitedFilterEnabled: boolean;
    onClearCollectionFilters: () => void;
    onCreateCollection: () => void;
    onToggleCollectionSelection: (id: string) => void;
    searchTerms: string[];
    selectedCollectionIds: string[];
    setCollectionMembershipFilter: (value: CollectionMembershipFilter) => void;
    setDomainFilters: (
        value: string[] | ((value: string[]) => string[])
    ) => void;
    setGroupBy: (value: GroupByMode) => void;
    setIsComposerOpen: (value: boolean) => void;
    setQuery: (value: string) => void;
    setSearchTerms: (value: string[] | ((value: string[]) => string[])) => void;
    setSortMode: (value: SortMode) => void;
    setSourceFilters: (
        value:
            | LibraryItemSource[]
            | ((value: LibraryItemSource[]) => LibraryItemSource[])
    ) => void;
    sortMode: SortMode;
    sourceFilters: LibraryItemSource[];
    unreachableFilterEnabled: boolean;
}

export interface BuildPaletteStackEntriesInput {
    collectionMembershipFilter: CollectionMembershipFilter;
    collections: LibraryCollectionSummary[];
    columnCountMode: ColumnCountMode;
    composerAttachments: ComposerAttachment[];
    domainFilters: string[];
    duplicatesFilterEnabled: boolean;
    groupBy: GroupByMode;
    lastVisitedFilterEnabled: boolean;
    onRemoveCollectionFilter: (id: string) => void;
    onRemoveComposerAttachment: (id: string) => void;
    searchTerms: string[];
    selectedCollectionIds: string[];
    setCollectionMembershipFilter: (value: CollectionMembershipFilter) => void;
    setColumnCountMode: (value: ColumnCountMode) => void;
    setDomainFilters: (
        value: string[] | ((value: string[]) => string[])
    ) => void;
    setDuplicatesFilterEnabled: (value: boolean) => void;
    setGroupBy: (value: GroupByMode) => void;
    setLastVisitedFilterEnabled: (value: boolean) => void;
    setSearchTerms: (value: string[] | ((value: string[]) => string[])) => void;
    setSortMode: (value: SortMode) => void;
    setSourceFilters: (
        value:
            | LibraryItemSource[]
            | ((value: LibraryItemSource[]) => LibraryItemSource[])
    ) => void;
    setUnreachableFilterEnabled: (value: boolean) => void;
    sortMode: SortMode;
    sourceFilters: LibraryItemSource[];
    unreachableFilterEnabled: boolean;
}

export interface BuildPaletteGroupsInput {
    askCacheResponse: AskCacheResponseState | null;
    clearLibraryPalette: () => void;
    collectionMembershipFilter: CollectionMembershipFilter;
    collectionPreviewThumbnailUrlsById: Map<string, string[]>;
    collections: LibraryCollectionSummary[];
    columnCountMode: ColumnCountMode;
    domainFilters: string[];
    domainOptions: {
        itemCount: number;
        label: string;
        value: string;
    }[];
    duplicateItemCount: number;
    duplicatesFilterEnabled: boolean;
    groupBy: GroupByMode;
    lastVisitedFilterEnabled: boolean;
    lastVisitedItemIds: string[];
    onAskCacheSubmit: (prompt: string) => void | Promise<void>;
    onClearCollectionFilters: () => void;
    onClearSearchHistory: () => void;
    onToggleCollectionSelection: (id: string) => void;
    openPaletteSection: (
        section: Exclude<PaletteSection, "search">,
        event: BaseUIEvent<React.MouseEvent> | KeyboardEvent
    ) => void;
    paletteSection: PaletteSection;
    query: string;
    returnToSearchSection: () => void;
    searchHistory: string[];
    searchTerms: string[];
    selectedCollectionIds: string[];
    setCollectionMembershipFilter: (value: CollectionMembershipFilter) => void;
    setColumnCountMode: (value: ColumnCountMode) => void;
    setDomainFilters: (
        value: string[] | ((value: string[]) => string[])
    ) => void;
    setDuplicatesFilterEnabled: (value: boolean) => void;
    setGroupBy: (value: GroupByMode) => void;
    setIsComposerOpen: (value: boolean) => void;
    setLastVisitedFilterEnabled: (value: boolean) => void;
    setQuery: (value: string) => void;
    setSearchTerms: (value: string[] | ((value: string[]) => string[])) => void;
    setSortMode: (value: SortMode) => void;
    setSourceFilters: (
        value:
            | LibraryItemSource[]
            | ((value: LibraryItemSource[]) => LibraryItemSource[])
    ) => void;
    setUnreachableFilterEnabled: (value: boolean) => void;
    sortMode: SortMode;
    sourceFilters: LibraryItemSource[];
    unreachableFilterEnabled: boolean;
}

export type ComposerSortMode = Exclude<SortMode, "count-desc">;

export interface DecoratedComposerItem {
    domain: string;
    item: LibraryItemWithCollections;
    primaryText: string;
    sourceLabel: string;
    timestamp: number;
}

interface ComposerItemRank {
    index: number;
    score: number;
}

interface ComposerItemSearchFields {
    lowerDescription: string;
    lowerLabel: string;
    lowerValue: string;
    words: string[];
}

interface RankedComposerItem {
    item: ComposerPaletteItem;
    rank: ComposerItemRank;
}

interface ComposerActions {
    canClear: boolean;
    duplicatesFilterEnabled: boolean;
    groupBy: string;
    onClearPalette: () => void;
    onCreateNote: () => void;
    onRemoveDuplicates: () => void;
    removableDuplicateCount: number;
    resultsSummary: string;
    sectionsLength: number;
}

interface ComposerActionsContext extends ComposerActions {
    metrics: LibraryMetricsSnapshot;
}

const log = createLogger("library:composer");

const ComposerActionsContext =
    React.createContext<ComposerActionsContext | null>(null);

function useComposerActionsContext(): ComposerActionsContext {
    const context = React.use(ComposerActionsContext);
    if (!context) {
        throw new Error(
            "Composer action components must be used inside <ComposerActionsList>."
        );
    }
    return context;
}

interface UseVisibleItemGroupsProps {
    groups: ComposerPaletteGroup[];
    query: string;
}

function useVisibleItemGroups({
    groups,
    query,
}: UseVisibleItemGroupsProps): ComposerPaletteGroup[] {
    const filter = useCommandFilter();
    const normalizedQuery = query.trim();

    if (normalizedQuery.length === 0) {
        return groups;
    }

    const lowerQuery = normalizedQuery.toLowerCase();
    const visibleGroups: ComposerPaletteGroup[] = [];

    for (const group of groups) {
        const rankedItems: RankedComposerItem[] = [];

        for (const [index, item] of group.items.entries()) {
            const score = getComposerItemScore(filter, item, lowerQuery);
            if (score !== null) {
                rankedItems.push({
                    item,
                    rank: { index, score },
                });
            }
        }

        if (rankedItems.length === 0) {
            continue;
        }

        rankedItems.sort(
            (first, second) =>
                first.rank.score - second.rank.score ||
                first.rank.index - second.rank.index
        );

        visibleGroups.push({
            ...group,
            items: rankedItems.map(({ item }) => item),
        });
    }

    return visibleGroups;
}

function getComposerItemSearchFields(
    item: ComposerPaletteItem
): ComposerItemSearchFields {
    const lowerLabel = item.label.trim().toLowerCase();
    return {
        lowerDescription: (item.description ?? "").toLowerCase(),
        lowerLabel,
        lowerValue: item.value.toLowerCase(),
        words: lowerLabel.split(MATCH_WORD_SEPARATOR_PATTERN),
    };
}

function getComposerItemScore(
    filter: ReturnType<typeof useCommandFilter>,
    item: ComposerPaletteItem,
    lowerQuery: string
): number | null {
    const { lowerDescription, lowerLabel, lowerValue, words } =
        getComposerItemSearchFields(item);

    if (lowerLabel === lowerQuery) {
        return 0;
    }
    if (filter.startsWith(lowerLabel, lowerQuery)) {
        return 1;
    }
    if (filter.contains(lowerLabel, lowerQuery)) {
        for (const word of words) {
            if (filter.startsWith(word, lowerQuery)) {
                return 2;
            }
        }
        return 3;
    }
    if (filter.startsWith(lowerValue, lowerQuery)) {
        return 4;
    }
    if (filter.contains(lowerValue, lowerQuery)) {
        return 5;
    }
    if (
        lowerDescription !== "" &&
        filter.contains(lowerDescription, lowerQuery)
    ) {
        return 6;
    }

    return null;
}

export function getSourceLabel(source: LibraryItemSource): string {
    return SOURCE_LABEL_BY_VALUE[source] ?? "Other";
}

export function groupByLabel(mode: GroupByMode): string {
    return (
        PALETTE_GROUP_OPTIONS.find((opt) => opt.value === mode)?.label ?? "None"
    );
}

export function sortModeLabel(mode: SortMode): string {
    return (
        PALETTE_SORT_OPTIONS.find((opt) => opt.value === mode)?.label ??
        sortModeLabel(DEFAULT_SORT_MODE)
    );
}

export function columnCountLabel(mode: ColumnCountMode): string {
    return (
        PALETTE_COLUMN_OPTIONS.find((opt) => opt.value === mode)?.label ??
        "Adjust automatically"
    );
}

export function collectionMembershipFilterLabel(
    filter: CollectionMembershipFilter
): string {
    if (filter === "in-collections") {
        return "In collections";
    }
    if (filter === "not-in-collections") {
        return "Not in collections";
    }
    return "All items";
}

export function collectionItemCountLabel(count: number): string {
    return `${count} item${count === 1 ? "" : "s"}`;
}

export function buildCollectionPaletteDescription(
    collection: LibraryCollectionSummary,
    isActive: boolean
): string {
    const details = [collectionItemCountLabel(collection.itemCount)];
    if (collection.sources.length > 0) {
        details.push(collection.sources.map(getSourceLabel).join(", "));
    }
    return isActive
        ? `Active collection filter. ${details.join(". ")}`
        : details.join(". ");
}

export function buildCollectionPaletteItems({
    collections,
    onClearCollectionFilters,
    onToggleCollectionSelection,
    selectedCollectionIds,
    wrapOnSelect,
}: {
    collections: LibraryCollectionSummary[];
    onClearCollectionFilters: () => void;
    onToggleCollectionSelection: (id: string) => void;
    selectedCollectionIds: string[];
    wrapOnSelect: (fn: () => void) => () => void;
}): ComposerPaletteItem[] {
    return [
        {
            description:
                selectedCollectionIds.length === 0
                    ? "Show items from every collection"
                    : "Clear the selected collection filters",
            isActive: selectedCollectionIds.length === 0,
            label: "Collections: All collections",
            onSelect: wrapOnSelect(onClearCollectionFilters),
            value: "filter collection all",
        },
        ...collections.map((collection) => {
            const isActive = selectedCollectionIds.includes(collection.id);
            return {
                description: buildCollectionPaletteDescription(
                    collection,
                    isActive
                ),
                isActive,
                label: `Collection: ${collection.name}`,
                onSelect: wrapOnSelect(() =>
                    onToggleCollectionSelection(collection.id)
                ),
                value: `filter collection ${collection.id}`,
            } satisfies ComposerPaletteItem;
        }),
    ];
}

export function buildDomainPaletteOptions(
    items: { url: string }[]
): { itemCount: number; label: string; value: string }[] {
    const counts = new Map<string, number>();
    for (const item of items) {
        const domain = getLibraryItemDomain(item.url);
        counts.set(domain, (counts.get(domain) ?? 0) + 1);
    }
    const dynamicDomains = Array.from(counts.entries())
        .sort(
            ([aDomain, aCount], [bDomain, bCount]) =>
                bCount - aCount || NAME_COLLATOR.compare(aDomain, bDomain)
        )
        .map(([domain, count]) => ({
            itemCount: count,
            label: `${domain} (${count})`,
            value: domain,
        }));
    return [
        {
            itemCount: items.length,
            label: "All domains",
            value: ALL_DOMAIN_FILTER,
        },
        ...dynamicDomains,
    ];
}

export function buildPaletteGroupValueSet(
    groups: ComposerPaletteGroup[]
): Set<string> {
    const valueSet = new Set<string>();
    for (const group of groups) {
        for (const item of group.items) {
            valueSet.add(item.value);
        }
    }
    return valueSet;
}

export function appendUniqueSearchTerm(
    values: string[],
    next: string
): string[] {
    const normalized = next.trim();
    if (!normalized) {
        return [...values];
    }
    return values.some(
        (value) => value.toLowerCase() === normalized.toLowerCase()
    )
        ? [...values]
        : [...values, normalized];
}

export function isMultiWordQuery(query: string): boolean {
    return MULTI_WORD_QUERY_PATTERN.test(query.trim());
}

export function removeLastPaletteStackEntry(
    entries: ComposerPaletteStackEntry[]
): boolean {
    const lastEntry = entries.at(-1);
    if (!lastEntry) {
        return false;
    }
    lastEntry.onRemove();
    return true;
}

export function isSearchHotkey(event: KeyboardEvent): boolean {
    const key = event.key.toLowerCase();
    const hasMeta = event.metaKey;
    const hasCtrl = event.ctrlKey;
    const hasAlt = event.altKey;
    const eventHotkeys = new Set<string>();
    if (!(hasAlt || hasMeta || hasCtrl)) {
        eventHotkeys.add(key);
    }
    if (!hasAlt && hasMeta) {
        eventHotkeys.add(`cmd+${key}`);
        eventHotkeys.add(`Meta+${key}`);
    }
    if (!hasAlt && hasCtrl) {
        eventHotkeys.add(`ctrl+${key}`);
    }
    return COMPOSER_OPEN_HOTKEYS.some((hotkey) => eventHotkeys.has(hotkey));
}

export function isPrintablePaletteKey(event: KeyboardEvent): boolean {
    return (
        event.key.length === 1 &&
        event.key.trim() !== "" &&
        !event.isComposing &&
        event.key !== "Dead" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
    );
}

export function buildGroupingCandidatesForPreferLast(
    mode: "source" | "domain"
): GroupByMode[] {
    const middle = ALL_GROUPING_MODES.filter(
        (entry) => entry !== "source" && entry !== "domain"
    );
    const otherFirst = mode === "source" ? "domain" : "source";
    return [otherFirst, ...middle, mode];
}

export function itemDate(
    item: LibraryItemWithCollections,
    mode: "added" | "created" = "added"
): Date {
    const value =
        mode === "created"
            ? (item.postedAt ?? item.scrapedAt ?? item.createdAt)
            : (item.scrapedAt ?? item.createdAt);
    return value instanceof Date ? value : new Date(value);
}

export function itemTimestamp(
    item: LibraryItemWithCollections,
    mode: "added" | "created" = "added"
): number {
    return itemDate(item, mode).getTime();
}

export function itemMonthKey(
    item: LibraryItemWithCollections,
    mode: "added" | "created" = "added"
): string {
    const date = itemDate(item, mode);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

export function itemYearKey(
    item: LibraryItemWithCollections,
    mode: "added" | "created" = "added"
): string {
    const date = itemDate(item, mode);
    return date.getFullYear().toString();
}

export function getItemGroupKey(
    item: LibraryItemWithCollections,
    groupBy: EffectiveGroupByMode
): string {
    if (groupBy === "source") {
        return item.source;
    }
    if (groupBy === "domain") {
        return getLibraryItemDomain(item.url);
    }
    if (groupBy === "canonical-url") {
        return itemCanonicalGroupKey(item);
    }
    if (groupBy === "month-added") {
        return itemMonthKey(item, "added");
    }
    if (groupBy === "month-created") {
        return itemMonthKey(item, "created");
    }
    if (groupBy === "year-added") {
        return itemYearKey(item, "added");
    }
    if (groupBy === "year-created") {
        return itemYearKey(item, "created");
    }
    return UNSPECIFIC_LIBRARY_DOMAIN;
}

export function getGroupCount(
    items: LibraryItemWithCollections[],
    groupBy: EffectiveGroupByMode
): number {
    if (groupBy === "none") {
        return 0;
    }

    if (groupBy === "collection") {
        const collectionKeys = new Set<string>();
        let hasUncategorized = false;
        for (const item of items) {
            if (item.collections.length === 0) {
                hasUncategorized = true;
            } else {
                for (const c of item.collections) {
                    collectionKeys.add(c.id);
                }
            }
        }
        return collectionKeys.size + (hasUncategorized ? 1 : 0);
    }

    return new Set(items.map((item) => getItemGroupKey(item, groupBy))).size;
}

export function buildComposerSuggestions({
    clearLibraryPalette,
    collectionMembershipFilter,
    collections,
    items,
    lastVisitedFilterEnabled,
    onClearCollectionFilters,
    onCreateCollection,
    onToggleCollectionSelection,
    searchTerms,
    selectedCollectionIds,
    setCollectionMembershipFilter,
    setDomainFilters,
    setGroupBy,
    setIsComposerOpen,
    setQuery,
    setSearchTerms,
    setSortMode,
    setSourceFilters,
    sourceFilters,
    domainFilters,
    duplicatesFilterEnabled,
    groupBy,
    isExtensionInstalled,
    sortMode,
    unreachableFilterEnabled,
}: BuildComposerSuggestionsInput): ComposerSuggestion[] {
    const suggestions: ComposerSuggestion[] = [];
    const suggestionLabels = new Set<string>();
    const collectionById = new Map(
        collections.map((collection) => [collection.id, collection])
    );
    const collectionCounts = new Map<string, number>();
    const sourceCounts = new Map<LibraryItemSource, number>();
    const domainCounts = new Map<string, number>();
    const addedMonthKeys = new Set<string>();
    const createdMonthKeys = new Set<string>();
    const addedYearKeys = new Set<string>();
    const createdYearKeys = new Set<string>();

    for (const item of items) {
        const itemCollectionIds = new Set<string>();
        for (const collection of item.collections) {
            if (itemCollectionIds.has(collection.id)) {
                continue;
            }
            itemCollectionIds.add(collection.id);
            collectionCounts.set(
                collection.id,
                (collectionCounts.get(collection.id) ?? 0) + 1
            );
        }
        sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);

        const domain = getLibraryItemDomain(item.url);
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
        addedMonthKeys.add(itemMonthKey(item, "added"));
        createdMonthKeys.add(itemMonthKey(item, "created"));
        addedYearKeys.add(itemYearKey(item, "added"));
        createdYearKeys.add(itemYearKey(item, "created"));
    }

    const hasAnyRefinements =
        searchTerms.length > 0 ||
        selectedCollectionIds.length > 0 ||
        sourceFilters.length > 0 ||
        domainFilters.length > 0 ||
        collectionMembershipFilter !== DEFAULT_COLLECTION_MEMBERSHIP_FILTER ||
        groupBy !== "none" ||
        sortMode !== DEFAULT_SORT_MODE ||
        lastVisitedFilterEnabled ||
        duplicatesFilterEnabled ||
        unreachableFilterEnabled;

    const commitSelection = (fn: () => void) => () => {
        fn();
        setQuery("");
        setIsComposerOpen(false);
    };

    const addSuggestion = (suggestion: ComposerSuggestion | null) => {
        if (
            suggestion === null ||
            suggestionLabels.has(suggestion.label) ||
            suggestions.length >= SUGGESTION_LIMIT
        ) {
            return;
        }

        suggestionLabels.add(suggestion.label);
        suggestions.push(suggestion);
    };

    const addDefaultSuggestion = (suggestion: ComposerSuggestion | null) => {
        if (hasAnyRefinements) {
            return;
        }

        addSuggestion(suggestion);
    };

    const pickTopEntry = <T,>(
        counts: Map<T, number>,
        isAllowed: (value: T) => boolean,
        getLabel: (value: T) => string
    ): T | null => {
        const entries = Array.from(counts.entries()).filter(([value]) =>
            isAllowed(value)
        );

        entries.sort(
            ([aValue, aCount], [bValue, bCount]) =>
                bCount - aCount ||
                NAME_COLLATOR.compare(getLabel(aValue), getLabel(bValue))
        );

        return entries[0]?.[0] ?? null;
    };

    const topCollectionId = pickTopEntry(
        collectionCounts,
        (collectionId) => !selectedCollectionIds.includes(collectionId),
        (collectionId) => collectionById.get(collectionId)?.name ?? collectionId
    );
    const topSource = pickTopEntry(
        sourceCounts,
        (source) => !sourceFilters.includes(source),
        (source) => getSourceLabel(source)
    );
    const topDomain = pickTopEntry(
        domainCounts,
        (domain) => !domainFilters.includes(domain),
        (domain) => domain
    );

    const topCollection =
        topCollectionId === null ? null : collectionById.get(topCollectionId);

    const currentGroupCount = getGroupCount(items, groupBy);

    const buildCollectionSuggestion = (): ComposerSuggestion | null => {
        if (!topCollection) {
            return null;
        }

        const collectionLabel = truncateLabel(topCollection.name, 24);
        let label = `Browse \u201c${collectionLabel}\u201d`;
        if (selectedCollectionIds.length > 0) {
            label = `Add \u201c${collectionLabel}\u201d collection`;
        } else if (hasAnyRefinements) {
            label = `Filter to \u201c${collectionLabel}\u201d`;
        }

        return {
            icon: <FolderOpen className={SUGGESTION_ICON_CLASS} />,
            label,
            onSelect: commitSelection(() =>
                onToggleCollectionSelection(topCollection.id)
            ),
        };
    };

    const buildSourceSuggestion = (): ComposerSuggestion | null => {
        if (!topSource) {
            return null;
        }

        return {
            icon: <Funnel className={SUGGESTION_ICON_CLASS} />,
            label: `Filter by ${getSourceLabel(topSource)}`,
            onSelect: commitSelection(() =>
                setSourceFilters((current) => toggleValue(current, topSource))
            ),
        };
    };

    const buildDomainSuggestion = (): ComposerSuggestion | null => {
        if (!topDomain) {
            return null;
        }

        return {
            icon: <Globe className={SUGGESTION_ICON_CLASS} />,
            label: `Filter to ${truncateLabel(topDomain, 24)}`,
            onSelect: commitSelection(() =>
                setDomainFilters((current) => toggleValue(current, topDomain))
            ),
        };
    };

    let groupingCandidates: GroupByMode[];
    if (sourceFilters.length > 0) {
        groupingCandidates = buildGroupingCandidatesForPreferLast("source");
    } else if (domainFilters.length > 0) {
        groupingCandidates = buildGroupingCandidatesForPreferLast("domain");
    } else {
        groupingCandidates = ALL_GROUPING_MODES;
    }

    const nextGroupBy =
        groupingCandidates.find((mode) => {
            if (mode === groupBy) {
                return false;
            }

            if (mode === "source") {
                return sourceCounts.size > 1;
            }
            if (mode === "domain") {
                return domainCounts.size > 1;
            }
            if (mode === "collection") {
                return collectionCounts.size > 0;
            }
            if (mode === "month-added") {
                return addedMonthKeys.size > 1;
            }
            if (mode === "month-created") {
                return createdMonthKeys.size > 1;
            }
            if (mode === "year-added") {
                return addedYearKeys.size > 1;
            }
            return createdYearKeys.size > 1;
        }) ?? null;

    const buildGroupingSuggestion = (): ComposerSuggestion | null => {
        if (!nextGroupBy) {
            return null;
        }

        const label =
            groupBy === "none"
                ? `Group by ${groupByLabel(nextGroupBy).toLowerCase()}`
                : `Try ${groupByLabel(nextGroupBy).toLowerCase()} groups`;

        return {
            icon: <Layers3 className={SUGGESTION_ICON_CLASS} />,
            label,
            onSelect: commitSelection(() => setGroupBy(nextGroupBy)),
        };
    };

    if (
        groupBy !== "none" &&
        sortMode !== "count-desc" &&
        currentGroupCount > 1
    ) {
        addSuggestion({
            icon: <ArrowDownWideNarrow className={SUGGESTION_ICON_CLASS} />,
            label: "Sort groups by size",
            onSelect: commitSelection(() => setSortMode("count-desc")),
        });
    }

    if (!isExtensionInstalled) {
        addDefaultSuggestion({
            icon: <DownloadIcon className={SUGGESTION_ICON_CLASS} />,
            label: "Get extension",
            onSelect: commitSelection(() =>
                openExternalUrl(CACHE_EXTENSION_DOWNLOAD_URL)
            ),
        });
    }

    const addPrimarySuggestions = (
        builders: ReadonlyArray<() => ComposerSuggestion | null>
    ) => {
        for (const build of builders) {
            const suggestion = build();
            if (suggestion !== null) {
                addSuggestion(suggestion);
            }
        }
    };

    if (!hasAnyRefinements) {
        addDefaultSuggestion(buildCollectionSuggestion());
        addDefaultSuggestion(buildSourceSuggestion());
        addDefaultSuggestion(buildGroupingSuggestion());
        addDefaultSuggestion(buildDomainSuggestion());
    } else if (selectedCollectionIds.length > 0) {
        addPrimarySuggestions([
            buildSourceSuggestion,
            buildDomainSuggestion,
            buildGroupingSuggestion,
            buildCollectionSuggestion,
        ]);
    } else {
        const hasContentRefinement =
            sourceFilters.length > 0 ||
            domainFilters.length > 0 ||
            searchTerms.length > 0 ||
            collectionMembershipFilter !== DEFAULT_COLLECTION_MEMBERSHIP_FILTER;

        addPrimarySuggestions(
            hasContentRefinement
                ? [
                      buildCollectionSuggestion,
                      buildGroupingSuggestion,
                      buildSourceSuggestion,
                      buildDomainSuggestion,
                  ]
                : [
                      buildCollectionSuggestion,
                      buildSourceSuggestion,
                      buildGroupingSuggestion,
                      buildDomainSuggestion,
                  ]
        );
    }

    if (items.length === 0 || suggestions.length < SUGGESTION_LIMIT) {
        if (searchTerms.length > 0) {
            addSuggestion({
                icon: <SearchX className={SUGGESTION_ICON_CLASS} />,
                label: "Clear searches",
                onSelect: commitSelection(() => setSearchTerms([])),
            });
        }

        if (selectedCollectionIds.length > 0) {
            addSuggestion({
                icon: <FolderOpen className={SUGGESTION_ICON_CLASS} />,
                label: "Show all collections",
                onSelect: commitSelection(onClearCollectionFilters),
            });
        }

        if (sourceFilters.length > 0) {
            addSuggestion({
                icon: <Funnel className={SUGGESTION_ICON_CLASS} />,
                label: "Show all sources",
                onSelect: commitSelection(() => setSourceFilters([])),
            });
        }

        if (domainFilters.length > 0) {
            addSuggestion({
                icon: <Globe className={SUGGESTION_ICON_CLASS} />,
                label: "Show all domains",
                onSelect: commitSelection(() => setDomainFilters([])),
            });
        }

        if (
            collectionMembershipFilter !== DEFAULT_COLLECTION_MEMBERSHIP_FILTER
        ) {
            addSuggestion({
                icon: <Tags className={SUGGESTION_ICON_CLASS} />,
                label: "Show all items",
                onSelect: commitSelection(() =>
                    setCollectionMembershipFilter(
                        DEFAULT_COLLECTION_MEMBERSHIP_FILTER
                    )
                ),
            });
        }

        if (groupBy !== "none") {
            addSuggestion({
                icon: <Layers3 className={SUGGESTION_ICON_CLASS} />,
                label: "Ungroup",
                onSelect: commitSelection(() => setGroupBy("none")),
            });
        }

        if (sortMode !== DEFAULT_SORT_MODE) {
            addSuggestion({
                icon: <ArrowDownWideNarrow className={SUGGESTION_ICON_CLASS} />,
                label: "Reset sort",
                onSelect: commitSelection(() => setSortMode(DEFAULT_SORT_MODE)),
            });
        }

        if (hasAnyRefinements) {
            addSuggestion({
                icon: <RotateCcw className={SUGGESTION_ICON_CLASS} />,
                label: "Reset filters",
                onSelect: commitSelection(clearLibraryPalette),
            });
        }
    }

    if (items.length === 0 && !hasAnyRefinements) {
        addSuggestion({
            icon: <FolderOpen className={SUGGESTION_ICON_CLASS} />,
            label: "Create a new collection",
            onSelect: commitSelection(() => onCreateCollection()),
        });
    }

    return suggestions;
}

export function buildPaletteGroups({
    askCacheResponse,
    clearLibraryPalette,
    columnCountMode,
    collectionMembershipFilter,
    collectionPreviewThumbnailUrlsById,
    collections,
    domainFilters,
    domainOptions,
    duplicateItemCount,
    duplicatesFilterEnabled,
    groupBy,
    lastVisitedFilterEnabled,
    lastVisitedItemIds,
    onClearCollectionFilters,
    onClearSearchHistory,
    onAskCacheSubmit,
    onToggleCollectionSelection,
    openPaletteSection,
    query,
    paletteSection,
    returnToSearchSection,
    searchHistory,
    searchTerms,
    selectedCollectionIds,
    setCollectionMembershipFilter,
    setColumnCountMode,
    setIsComposerOpen,
    setDomainFilters,
    setDuplicatesFilterEnabled,
    setGroupBy,
    setLastVisitedFilterEnabled,
    setQuery,
    setSearchTerms,
    setSortMode,
    setSourceFilters,
    setUnreachableFilterEnabled,
    sortMode,
    sourceFilters,
    unreachableFilterEnabled,
}: BuildPaletteGroupsInput): ComposerPaletteGroup[] {
    const draft = query.trim();
    const groups: ComposerPaletteGroup[] = [];

    const applyAndReturn = (fn: () => void | Promise<void>) => async () => {
        await fn();
        returnToSearchSection();
    };

    const applyAndStay = (fn: () => void) => () => {
        fn();
        setQuery("");
        setIsComposerOpen(true);
    };

    const navigationItems: ComposerPaletteItem[] = [
        {
            description: "Source and domain filters",
            label: "Add filters…",
            onSelect: (event) => openPaletteSection("filter", event),
            value: "navigate filters",
        },
        {
            description: `Current: ${groupByLabel(groupBy)}`,
            label: "Group items…",
            onSelect: (event) => openPaletteSection("group", event),
            value: "navigate grouping",
        },
        {
            description: `Current: ${sortModeLabel(sortMode)}`,
            label: "Sort items…",
            onSelect: (event) => openPaletteSection("sort", event),
            value: "navigate sorting",
        },
        {
            description: `Current: ${columnCountLabel(columnCountMode)}`,
            label: "Columns…",
            onSelect: (event) => openPaletteSection("columns", event),
            value: "navigate columns",
        },
    ];

    const backItem: ComposerPaletteItem = {
        description: "Return to search and quick actions",
        label: "Back",
        onSelect: returnToSearchSection,
        shortcut: "Esc",
        value: "navigate back",
    };

    const hasAnyRefinements =
        searchTerms.length > 0 ||
        selectedCollectionIds.length > 0 ||
        sourceFilters.length > 0 ||
        domainFilters.length > 0 ||
        collectionMembershipFilter !== DEFAULT_COLLECTION_MEMBERSHIP_FILTER ||
        groupBy !== "none" ||
        sortMode !== DEFAULT_SORT_MODE ||
        columnCountMode !== DEFAULT_COLUMN_COUNT_MODE ||
        duplicatesFilterEnabled ||
        unreachableFilterEnabled ||
        lastVisitedFilterEnabled;

    if (paletteSection === "search") {
        return buildSearchPaletteGroups({
            clearLibraryPalette,
            collectionPreviewThumbnailUrlsById,
            collections,
            draft,
            hasAnyRefinements,
            lastVisitedFilterEnabled,
            lastVisitedItemIds,
            navigationItems,
            onAskCacheSubmit,
            onClearCollectionFilters,
            onClearSearchHistory,
            onToggleCollectionSelection,
            searchHistory,
            searchTerms,
            selectedCollectionIds,
            setIsComposerOpen,
            setLastVisitedFilterEnabled,
            setQuery,
            setSearchTerms,
        });
    }

    if (paletteSection === "ai-response") {
        return buildAskCachePaletteGroups({
            askCacheResponse,
            backItem,
            draft,
            onAskCacheSubmit,
        });
    }

    if (paletteSection === "filter") {
        groups.push({
            items: [backItem],
            label: "Navigation",
        });
        groups.push({
            items: [
                {
                    description:
                        duplicateItemCount > 0
                            ? `Show ${duplicateItemCount} bookmark${duplicateItemCount === 1 ? "" : "s"} that share a URL`
                            : "No duplicate bookmarks found right now",
                    isActive: duplicatesFilterEnabled,
                    label: "Duplicates",
                    onSelect: applyAndStay(() =>
                        setDuplicatesFilterEnabled(!duplicatesFilterEnabled)
                    ),
                    value: "filter duplicates",
                },
                {
                    description:
                        "Check which bookmark links fail to load or time out",
                    isActive: unreachableFilterEnabled,
                    label: "Unreachable links",
                    onSelect: applyAndStay(() =>
                        setUnreachableFilterEnabled(!unreachableFilterEnabled)
                    ),
                    value: "filter unreachable",
                },
            ],
            label: "Library quality",
        });
        groups.push({
            items: [
                {
                    description: "Show every source",
                    isActive: sourceFilters.length === 0,
                    label: "Source: All sources",
                    onSelect: applyAndStay(() => setSourceFilters([])),
                    value: "filter source all",
                },
                ...PALETTE_SOURCE_FILTER_OPTIONS.map((option) => ({
                    description: "Toggle this source in the filter stack",
                    isActive: sourceFilters.includes(option.value),
                    label: `Source: ${option.label}`,
                    onSelect: applyAndStay(() =>
                        setSourceFilters((current) =>
                            toggleValue(current, option.value)
                        )
                    ),
                    value: `filter source ${option.value}`,
                })),
            ],
            label: "Conditions",
        });
        groups.push({
            items: [
                {
                    description:
                        "Show items whether or not they are in collections",
                    isActive:
                        collectionMembershipFilter ===
                        DEFAULT_COLLECTION_MEMBERSHIP_FILTER,
                    label: "Collections: All items",
                    onSelect: applyAndStay(() =>
                        setCollectionMembershipFilter(
                            DEFAULT_COLLECTION_MEMBERSHIP_FILTER
                        )
                    ),
                    value: "filter collections all",
                },
                {
                    description:
                        "Show only items that belong to at least one collection",
                    isActive: collectionMembershipFilter === "in-collections",
                    label: "Collections: In collections",
                    onSelect: applyAndStay(() =>
                        setCollectionMembershipFilter("in-collections")
                    ),
                    value: "filter collections in",
                },
                {
                    description:
                        "Show only items that do not belong to any collection",
                    isActive:
                        collectionMembershipFilter === "not-in-collections",
                    label: "Collections: Not in collections",
                    onSelect: applyAndStay(() =>
                        setCollectionMembershipFilter("not-in-collections")
                    ),
                    value: "filter collections not-in",
                },
            ],
            label: "Collection state",
        });
        groups.push({
            items: buildCollectionPaletteItems({
                collections,
                onClearCollectionFilters,
                onToggleCollectionSelection,
                selectedCollectionIds,
                wrapOnSelect: applyAndStay,
            }),
            label: "Collections",
        });
        groups.push({
            items: domainOptions.map((option) => ({
                description:
                    option.value === ALL_DOMAIN_FILTER
                        ? "Show items from every domain"
                        : "Toggle this domain in the filter stack",
                isActive:
                    option.value === ALL_DOMAIN_FILTER
                        ? domainFilters.length === 0
                        : domainFilters.includes(option.value),
                label: `Domain: ${option.label}`,
                onSelect: applyAndStay(() =>
                    option.value === ALL_DOMAIN_FILTER
                        ? setDomainFilters([])
                        : setDomainFilters((current) =>
                              toggleValue(current, option.value)
                          )
                ),
                value: `filter domain ${option.value}`,
            })),
            label: "Domain",
        });
        return groups;
    }

    if (paletteSection === "group") {
        return [
            { items: [backItem], label: "Navigation" },
            {
                items: PALETTE_GROUP_OPTIONS.map((option) => ({
                    description: "Organize the grid into sections",
                    isActive: groupBy === option.value,
                    label: option.label,
                    onSelect: applyAndReturn(() => setGroupBy(option.value)),
                    value: `group ${option.value}`,
                })),
                label: "Grouping",
            },
        ];
    }

    if (paletteSection === "sort") {
        return [
            { items: [backItem], label: "Navigation" },
            {
                items: PALETTE_SORT_OPTIONS.map((option) => ({
                    description: "Change the ordering within the current view",
                    isActive: sortMode === option.value,
                    label: option.label,
                    onSelect: applyAndReturn(() => setSortMode(option.value)),
                    value: `sort ${option.value}`,
                })),
                label: "Sorting",
            },
        ];
    }

    if (paletteSection === "columns") {
        return [
            { items: [backItem], label: "Navigation" },
            {
                items: PALETTE_COLUMN_OPTIONS.map((option) => ({
                    description:
                        option.value === "auto"
                            ? "Choose the best column count for the available width"
                            : "Force a specific number of columns",
                    isActive: columnCountMode === option.value,
                    label: option.label,
                    onSelect: applyAndReturn(() =>
                        setColumnCountMode(option.value)
                    ),
                    value: `columns ${option.value}`,
                })),
                label: "Columns",
            },
        ];
    }

    return [{ items: [backItem], label: "Navigation" }];
}

export function buildSearchPaletteGroups({
    collections,
    collectionPreviewThumbnailUrlsById,
    clearLibraryPalette,
    draft,
    hasAnyRefinements,
    lastVisitedFilterEnabled,
    lastVisitedItemIds,
    navigationItems,
    onAskCacheSubmit,
    onClearCollectionFilters,
    onClearSearchHistory,
    onToggleCollectionSelection,
    searchHistory,
    selectedCollectionIds,
    searchTerms,
    setIsComposerOpen,
    setLastVisitedFilterEnabled,
    setQuery,
    setSearchTerms,
}: {
    collections: LibraryCollectionSummary[];
    collectionPreviewThumbnailUrlsById: Map<string, string[]>;
    clearLibraryPalette: () => void;
    draft: string;
    hasAnyRefinements: boolean;
    lastVisitedFilterEnabled: boolean;
    lastVisitedItemIds: string[];
    navigationItems: ComposerPaletteItem[];
    onAskCacheSubmit: (prompt: string) => void | Promise<void>;
    onClearCollectionFilters: () => void;
    onClearSearchHistory: () => void;
    onToggleCollectionSelection: (id: string) => void;
    searchHistory: string[];
    searchTerms: string[];
    selectedCollectionIds: string[];
    setIsComposerOpen: (value: boolean) => void;
    setLastVisitedFilterEnabled: (value: boolean) => void;
    setQuery: (value: string) => void;
    setSearchTerms: (value: string[] | ((value: string[]) => string[])) => void;
}): ComposerPaletteGroup[] {
    const groups: ComposerPaletteGroup[] = [];
    const draftAlreadyIncluded = searchTerms.some(
        (term) => term.toLowerCase() === draft.toLowerCase()
    );
    const isDefaultState = draft.length === 0 && !hasAnyRefinements;
    const showCollectionsGroup =
        collections.length > 0 &&
        (draft.length > 0 ||
            selectedCollectionIds.length > 0 ||
            isDefaultState);

    const applyCollectionFilter = (fn: () => void) => () => {
        fn();
        setQuery("");
        setIsComposerOpen(true);
    };

    if (draft) {
        const shouldDefaultToAskCache = isMultiWordQuery(draft);
        const addSearchItem: ComposerPaletteItem = {
            description: draftAlreadyIncluded
                ? "Already included in the search"
                : "Add this search term",
            isActive: draftAlreadyIncluded,
            label: `Search "${draft}"`,
            onSelect: () => {
                setSearchTerms((current) =>
                    appendUniqueSearchTerm(current, draft)
                );
                setQuery("");
                setIsComposerOpen(true);
            },
            shortcut: shouldDefaultToAskCache ? undefined : "Enter",
            value: `search ${draft}`,
        };
        const askCacheItem: ComposerPaletteItem = {
            description: "AI Search",
            label: `Ask Cache "${draft}"`,
            onSelect: () => onAskCacheSubmit(draft),
            shortcut: shouldDefaultToAskCache ? "Enter" : "Tab",
            value: `ask cache ${draft}`,
        };

        groups.push({
            items: shouldDefaultToAskCache
                ? [askCacheItem, addSearchItem]
                : [addSearchItem, askCacheItem],
            label: "Search",
        });
    }

    if (searchTerms.length > 0) {
        groups.push({
            items: [
                ...searchTerms.map((term) => ({
                    description: "Active stacked search term",
                    isActive: true,
                    label: `Search: ${truncateLabel(term, 28)}`,
                    onSelect: () =>
                        setSearchTerms((current) => removeValue(current, term)),
                    value: `remove search ${term}`,
                })),
                {
                    description: "Remove every search term",
                    label: "Clear all searches",
                    onSelect: () => {
                        setSearchTerms([]);
                        setIsComposerOpen(true);
                    },
                    value: "clear all searches",
                },
            ],
            label: "Current search",
        });
    }

    if (showCollectionsGroup) {
        if (isDefaultState) {
            const collectionItems: ComposerPaletteItem[] = [];
            for (const collection of collections) {
                if (collectionItems.length >= 4) {
                    break;
                }
                const thumbnails =
                    collectionPreviewThumbnailUrlsById.get(collection.id) ?? [];
                if (thumbnails.length <= 1) {
                    continue;
                }
                collectionItems.push({
                    isActive: selectedCollectionIds.includes(collection.id),
                    label: collection.name,
                    onSelect: applyCollectionFilter(() =>
                        onToggleCollectionSelection(collection.id)
                    ),
                    render: () => (
                        <div className="flex aspect-4/3 size-full flex-1 flex-col">
                            {thumbnails.length > 0 && (
                                <ComposerCategoryThumbnail urls={thumbnails} />
                            )}
                            <span className="truncate p-1 font-medium">
                                {collection.name}
                            </span>
                        </div>
                    ),
                    value: `filter collection ${collection.id}`,
                });
            }

            if (collectionItems.length > 0) {
                groups.push({
                    items: collectionItems,
                    label: "Collections",
                    layout: "horizontal",
                });
            }
        } else {
            groups.push({
                items: buildCollectionPaletteItems({
                    collections,
                    onClearCollectionFilters,
                    onToggleCollectionSelection,
                    selectedCollectionIds,
                    wrapOnSelect: applyCollectionFilter,
                }),
                label: "Collections",
            });
        }
    }

    const shouldShowLastVisited =
        lastVisitedItemIds.length > 0 && !lastVisitedFilterEnabled;
    const shouldShowSearchHistory = !draft && searchHistory.length > 0;
    const availableHistory = shouldShowSearchHistory
        ? searchHistory.filter(
              (term) =>
                  !searchTerms.some(
                      (st) => st.toLowerCase() === term.toLowerCase()
                  )
          )
        : [];

    if (shouldShowLastVisited || availableHistory.length > 0) {
        groups.push({
            items: [
                ...(shouldShowLastVisited
                    ? [
                          {
                              label: "Pick up where you left off",
                              onSelect: applyCollectionFilter(() =>
                                  setLastVisitedFilterEnabled(true)
                              ),
                              render: () => (
                                  <div className="flex items-center gap-2.5">
                                      <History className="size-4 shrink-0 text-muted-foreground" />
                                      <span className="truncate">
                                          Pick up where you left off
                                      </span>
                                  </div>
                              ),
                              value: "filter last visited",
                          },
                      ]
                    : []),
                ...availableHistory.slice(0, 5).map((term) => ({
                    label: term,
                    onSelect: () => {
                        setSearchTerms((current) =>
                            appendUniqueSearchTerm(current, term)
                        );
                        setQuery("");
                        setIsComposerOpen(true);
                    },
                    render: () => (
                        <div className="flex items-center gap-2.5">
                            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{term}</span>
                        </div>
                    ),
                    value: `search history ${term}`,
                })),
                ...(availableHistory.length > 0
                    ? [
                          {
                              label: "Clear history",
                              onSelect: onClearSearchHistory,
                              value: "clear search history",
                          },
                      ]
                    : []),
            ],
            label: "Recent",
        });
    }

    groups.push({
        items: navigationItems,
        label: "Customize display",
    });

    if (hasAnyRefinements) {
        groups.push({
            items: [
                {
                    description:
                        "Reset search, filters, grouping, sort, and layout",
                    label: "Reset filters",
                    onSelect: clearLibraryPalette,
                    value: "reset filters",
                },
            ],
            label: "Quick actions",
        });
    }

    return groups;
}

export function buildAskCachePaletteGroups({
    askCacheResponse,
    backItem,
    draft,
    onAskCacheSubmit,
}: {
    askCacheResponse: AskCacheResponseState | null;
    backItem: ComposerPaletteItem;
    draft: string;
    onAskCacheSubmit: (prompt: string) => void | Promise<void>;
}): ComposerPaletteGroup[] {
    const items: ComposerPaletteItem[] = [
        {
            label: "Ask Cache response",
            onSelect: () => undefined,
            render: () => <AskCacheResponsePanel response={askCacheResponse} />,
            value: "ask cache response",
        },
    ];

    if (draft) {
        items.unshift({
            label: `Ask Cache "${draft}"`,
            onSelect: () => onAskCacheSubmit(draft),
            value: `ask cache ${draft}`,
        });
    }

    return [
        {
            items: [backItem],
            label: "Navigation",
        },
        {
            items,
            label: "Ask Cache",
        },
    ];
}

export function buildPaletteStackEntries({
    collectionMembershipFilter,
    collections,
    columnCountMode,
    composerAttachments,
    domainFilters,
    duplicatesFilterEnabled,
    groupBy,
    lastVisitedFilterEnabled,
    onRemoveCollectionFilter,
    onRemoveComposerAttachment,
    searchTerms,
    selectedCollectionIds,
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
    sortMode,
    sourceFilters,
    unreachableFilterEnabled,
}: BuildPaletteStackEntriesInput): ComposerPaletteStackEntry[] {
    const entries: ComposerPaletteStackEntry[] = [];
    const collectionById = new Map(collections.map((c) => [c.id, c]));

    for (const collectionId of selectedCollectionIds) {
        const collection = collectionById.get(collectionId);
        if (collection) {
            const onRemove = () => onRemoveCollectionFilter(collectionId);
            entries.push({
                chip: (
                    <ComposerChip
                        key={`collection-${collectionId}`}
                        label={`Collection: ${truncateLabel(collection.name)}`}
                        // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                        onRemove={onRemove}
                    />
                ),
                key: `collection-${collectionId}`,
                onRemove,
            });
        }
    }

    for (const attachment of composerAttachments) {
        const onRemove = () => onRemoveComposerAttachment(attachment.id);
        entries.push({
            chip: (
                <ComposerAttachmentChip
                    attachment={attachment}
                    key={`attachment-${attachment.id}`}
                    onRemove={onRemoveComposerAttachment}
                />
            ),
            key: `attachment-${attachment.id}`,
            onRemove,
        });
    }

    for (const term of searchTerms) {
        const onRemove = () =>
            setSearchTerms((current) => removeValue(current, term));
        entries.push({
            chip: (
                <ComposerChip
                    key={`search-${term}`}
                    label={`Search: ${truncateLabel(term)}`}
                    // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                    onRemove={onRemove}
                />
            ),
            key: `search-${term}`,
            onRemove,
        });
    }

    for (const source of sourceFilters) {
        const onRemove = () =>
            setSourceFilters((current) => removeValue(current, source));
        entries.push({
            chip: (
                <ComposerChip
                    key={`source-${source}`}
                    label={`Source: ${getSourceLabel(source)}`}
                    // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                    onRemove={onRemove}
                />
            ),
            key: `source-${source}`,
            onRemove,
        });
    }

    for (const domainFilter of domainFilters) {
        const onRemove = () =>
            setDomainFilters((current) => removeValue(current, domainFilter));
        entries.push({
            chip: (
                <ComposerChip
                    key={`domain-${domainFilter}`}
                    label={`Domain: ${truncateLabel(domainFilter)}`}
                    // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                    onRemove={onRemove}
                />
            ),
            key: `domain-${domainFilter}`,
            onRemove,
        });
    }

    if (collectionMembershipFilter !== DEFAULT_COLLECTION_MEMBERSHIP_FILTER) {
        const onRemove = () =>
            setCollectionMembershipFilter(DEFAULT_COLLECTION_MEMBERSHIP_FILTER);
        entries.push({
            chip: (
                <ComposerChip
                    key="collection-membership"
                    label={`Collections: ${collectionMembershipFilterLabel(collectionMembershipFilter)}`}
                    // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                    onRemove={onRemove}
                />
            ),
            key: "collection-membership",
            onRemove,
        });
    }

    if (groupBy !== "none") {
        const onRemove = () => setGroupBy("none");
        entries.push({
            chip: (
                <ComposerChip
                    key="group"
                    label={`Group: ${groupByLabel(groupBy)}`}
                    // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                    onRemove={onRemove}
                />
            ),
            key: "group",
            onRemove,
        });
    }

    if (lastVisitedFilterEnabled) {
        const onRemove = () => setLastVisitedFilterEnabled(false);
        entries.push({
            chip: (
                <ComposerChip
                    key="last-visited"
                    label="Last visited"
                    // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                    onRemove={onRemove}
                />
            ),
            key: "last-visited",
            onRemove,
        });
    }

    if (duplicatesFilterEnabled) {
        const onRemove = () => setDuplicatesFilterEnabled(false);
        entries.push({
            chip: (
                <ComposerChip
                    key="duplicates"
                    label="Duplicates"
                    // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                    onRemove={onRemove}
                />
            ),
            key: "duplicates",
            onRemove,
        });
    }

    if (unreachableFilterEnabled) {
        const onRemove = () => setUnreachableFilterEnabled(false);
        entries.push({
            chip: (
                <ComposerChip
                    key="unreachable"
                    label="Unreachable"
                    // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                    onRemove={onRemove}
                />
            ),
            key: "unreachable",
            onRemove,
        });
    }

    if (sortMode !== DEFAULT_SORT_MODE) {
        const onRemove = () => setSortMode(DEFAULT_SORT_MODE);
        entries.push({
            chip: (
                <ComposerChip
                    key="sort"
                    label={`Sort: ${sortModeLabel(sortMode)}`}
                    // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                    onRemove={onRemove}
                />
            ),
            key: "sort",
            onRemove,
        });
    }

    if (columnCountMode !== DEFAULT_COLUMN_COUNT_MODE) {
        const onRemove = () => setColumnCountMode(DEFAULT_COLUMN_COUNT_MODE);
        entries.push({
            chip: (
                <ComposerChip
                    key="columns"
                    label={`Columns: ${columnCountLabel(columnCountMode)}`}
                    // biome-ignore lint/performance/noJsxPropsBind: stabilized internally by ComposerChip
                    onRemove={onRemove}
                />
            ),
            key: "columns",
            onRemove,
        });
    }

    return entries;
}

export function toSpeakableText(markdown: string): string {
    // Code blocks and URLs carry no spoken meaning. The clipboard copy keeps
    // the raw markdown, so speech drops them instead of spelling them out.
    let text = markdown.replace(MARKDOWN_CODE_FENCE_PATTERN, " ");
    text = text.replace(MARKDOWN_IMAGE_PATTERN, "$1");
    text = text.replace(MARKDOWN_LINK_PATTERN, "$1");
    text = text.replace(MARKDOWN_INLINE_CODE_PATTERN, "$1");
    text = text.replace(MARKDOWN_BARE_URL_PATTERN, " ");
    text = text.replace(MARKDOWN_HTML_TAG_PATTERN, " ");
    text = text.replace(MARKDOWN_HEADING_PATTERN, "");
    text = text.replace(MARKDOWN_QUOTE_MARKER_PATTERN, "");
    text = text.replace(MARKDOWN_LIST_MARKER_PATTERN, "");
    text = text.replace(MARKDOWN_TABLE_ROW_PATTERN, "");
    text = text.replace(MARKDOWN_TABLE_EDGE_PIPE_PATTERN, "");
    text = text.replace(MARKDOWN_TABLE_PIPE_PATTERN, ",");
    // Repeat for nested runs such as ***bold italic***.
    for (let pass = 0; pass < EMPHASIS_CLEANUP_PASS_COUNT; pass += 1) {
        const next = text.replace(MARKDOWN_EMPHASIS_PATTERN, "$2");
        if (next === text) {
            break;
        }
        text = next;
    }
    return text.replace(WHITESPACE_COLLAPSE_PATTERN, " ").trim();
}

export function CopyResponseButton({ value }: { value: string }) {
    const { copyToClipboard, isCopied } = useCopyToClipboard();

    const handleCopy = useStableCallback(() => copyToClipboard(value));

    return (
        <Button
            aria-label={isCopied ? "Copied" : "Copy response"}
            onClick={handleCopy}
            size="icon-xs"
            title={isCopied ? "Copied" : "Copy response"}
            variant="ghost"
        >
            {isCopied ? (
                <Check className="size-3.5 text-success" />
            ) : (
                <CopyIcon className="size-3.5 text-muted-foreground" />
            )}
        </Button>
    );
}

export function SpeakResponseButton({ value }: { value: string }) {
    const { isSpeaking, isSupported, stop, toggle } = useSpeechSynthesis();
    const speakableText = toSpeakableText(value);
    const previousTextRef = React.useRef(speakableText);

    React.useEffect(() => {
        if (previousTextRef.current === speakableText) {
            return;
        }
        previousTextRef.current = speakableText;
        stop();
    }, [speakableText, stop]);

    const handleToggle = useStableCallback(() => toggle(speakableText));

    if (!isSupported) {
        return null;
    }

    return (
        <Button
            aria-label={
                isSpeaking ? "Stop reading response" : "Listen to response"
            }
            aria-pressed={isSpeaking}
            disabled={speakableText.length === 0}
            onClick={handleToggle}
            size="icon-xs"
            title={isSpeaking ? "Stop reading" : "Listen to response"}
            variant="ghost"
        >
            {isSpeaking ? (
                <Square className="size-3.5 fill-current text-foreground" />
            ) : (
                <Volume2 className="size-3.5 text-muted-foreground" />
            )}
        </Button>
    );
}

export function AskCacheResponsePanel({
    response,
}: {
    response: AskCacheResponseState | null;
}) {
    if (!response || response.status === "loading") {
        return (
            <div className="flex min-w-0 flex-1 flex-col gap-2 py-1 pr-2">
                <div className="flex items-center gap-2">
                    <ThinkingOrb size={20} state="shaping" />
                    <GradientWaveText
                        ariaLabel="Ask Cache"
                        className="font-medium text-muted-foreground text-xs"
                    >
                        Cache AI
                    </GradientWaveText>
                    {response?.prompt ? (
                        <span className="min-w-0 max-w-xs truncate text-muted-foreground text-xs">
                            {response.prompt}
                        </span>
                    ) : null}
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </div>
        );
    }

    if (response.status === "error") {
        return (
            <div className="flex min-w-0 flex-1 flex-col gap-1 py-1 pr-2">
                <GradientWaveText
                    ariaLabel="Ask Cache"
                    className="font-medium text-muted-foreground text-xs"
                >
                    Cache AI
                </GradientWaveText>
                <p className="text-sm">{response.message}</p>
            </div>
        );
    }

    return (
        <div className="flex min-w-0 flex-1 flex-col gap-2 py-1 pr-2">
            <GradientWaveText
                ariaLabel="Ask Cache"
                className="font-medium text-muted-foreground text-xs"
            >
                Cache AI
            </GradientWaveText>
            <Streamdown className="whitespace-pre-line text-sm leading-relaxed">
                {response.markdown}
            </Streamdown>
            <div className="flex items-center gap-1">
                <CopyResponseButton value={response.markdown} />
                <SpeakResponseButton value={response.markdown} />
            </div>
        </div>
    );
}

function formatShareValue(value: number, total: number): React.ReactNode {
    if (total <= 0) {
        return value;
    }
    return (
        <>
            {value}
            <span className="text-muted-foreground/50">
                {" "}
                · {formatSharePercent(value, total)}
            </span>
        </>
    );
}

export function Composer({
    className,
    ...props
}: React.ComponentProps<typeof Toolbar.Root>) {
    return (
        <Toolbar.Root
            {...props}
            className={cn(
                "squircle sticky top-1 z-50 w-full max-w-2xl overflow-clip rounded-t-3xl rounded-b-3xl bg-muted",
                className
            )}
        />
    );
}

export interface ComposerInputActions {
    close: () => void;
    open: () => void;
}

interface ComposerInputProps extends React.ComponentProps<typeof CommandInput> {
    actionsRef?: React.RefObject<ComposerInputActions | null>;
    groups: ComposerPaletteGroup[];
    onOpenChange: (
        nextOpen: boolean,
        eventDetails: AutocompleteRootChangeEventDetails
    ) => void;
    onValueChange: (
        next: string,
        eventDetails: AutocompleteRootChangeEventDetails
    ) => void;
    query: string;
    stackEntries: ComposerPaletteStackEntry[];
}

export function ComposerInput({
    query,
    onValueChange,
    onOpenChange,
    actionsRef,
    groups,
    stackEntries,
    ...props
}: ComposerInputProps) {
    const filteredItemGroups = useVisibleItemGroups({ groups, query });

    const [isPopupOpen, setIsPopupOpen] = React.useState(false);

    const handleOpenChange = useStableCallback(
        (
            nextOpen: boolean,
            eventDetails: AutocompleteRootChangeEventDetails
        ) => {
            onOpenChange(nextOpen, eventDetails);
            if (!eventDetails.isCanceled) {
                setIsPopupOpen(nextOpen);
            }
        }
    );

    const openPopup = useStableCallback(() => setIsPopupOpen(true));
    const closePopup = useStableCallback(() => setIsPopupOpen(false));

    useIsoLayoutEffect(() => {
        if (!actionsRef) {
            return;
        }
        actionsRef.current = { close: closePopup, open: openPopup };
    }, [actionsRef, closePopup, openPopup]);

    return (
        <Command
            filteredItems={filteredItemGroups}
            items={groups}
            onOpenChange={handleOpenChange}
            onValueChange={onValueChange}
            open={isPopupOpen}
            value={query}
        >
            <Toolbar.Input
                render={
                    <CommandInput
                        {...props}
                        endAddon={
                            <ComposerInputEndAddon
                                stackEntries={stackEntries}
                            />
                        }
                        size="lg"
                    />
                }
            />
            <CommandPopup className="max-w-2xl">
                <CommandEmpty>
                    <T>No matching commands</T>
                </CommandEmpty>
                <CommandList className="max-w-2xl">
                    {(group: ComposerPaletteGroup) => (
                        <CommandGroup items={group.items} key={group.label}>
                            <CommandGroupLabel>{group.label}</CommandGroupLabel>
                            {group.layout === "horizontal" ? (
                                <CommandRow className="grid grid-cols-2 gap-2 pt-1 pr-2 pb-4 md:grid-cols-3 lg:grid-cols-4">
                                    <CommandCollection>
                                        {(item: ComposerPaletteItem) => (
                                            <ComposerItem
                                                isHorizontal
                                                item={item}
                                                key={item.value}
                                            />
                                        )}
                                    </CommandCollection>
                                </CommandRow>
                            ) : (
                                <CommandCollection>
                                    {(item: ComposerPaletteItem) => (
                                        <ComposerItem
                                            item={item}
                                            key={item.value}
                                        />
                                    )}
                                </CommandCollection>
                            )}
                        </CommandGroup>
                    )}
                </CommandList>
            </CommandPopup>
        </Command>
    );
}

interface ComposerInputEndAddonProps {
    stackEntries: ComposerPaletteStackEntry[];
}

function ComposerInputEndAddon({ stackEntries }: ComposerInputEndAddonProps) {
    return (
        <>
            {stackEntries.length === 0 ? (
                <ComposerInputEndAddonShortcut />
            ) : null}
            <CollapsibleListHorizontal
                badgeRender={
                    <Badge
                        className="inline-flex h-7! cursor-pointer rounded-xl text-xs tabular-nums"
                        render={<button type="button" />}
                        variant="secondary"
                    />
                }
                className="justify-end"
                maxVisible={1}
            >
                {stackEntries.map((entry) => (
                    <React.Fragment key={entry.key}>
                        {entry.chip}
                    </React.Fragment>
                ))}
            </CollapsibleListHorizontal>
        </>
    );
}

function ComposerInputEndAddonShortcut() {
    return (
        <>
            <Kbd className="border-none text-muted-foreground opacity-50 group-data-popup-open/input:opacity-0">
                <CmdKbd />G
            </Kbd>
            <span className="absolute right-3.5 flex items-center gap-0.5 text-nowrap opacity-0 group-data-popup-open/input:opacity-100 dark:gap-1">
                <Kbd className="border-none text-muted-foreground opacity-50">
                    Tab
                </Kbd>
                <span className="text-muted-foreground text-xs opacity-50">
                    Ask AI
                </span>
            </span>
        </>
    );
}

interface ComposerActionsListProps
    extends React.ComponentProps<typeof Toolbar.Group>,
        ComposerActions {
    metrics: LibraryMetricsSnapshot;
}

export function ComposerActionsList({
    className,
    canClear,
    duplicatesFilterEnabled,
    groupBy,
    metrics,
    onClearPalette,
    onCreateNote,
    onRemoveDuplicates,
    removableDuplicateCount,
    resultsSummary,
    sectionsLength,
    ...props
}: ComposerActionsListProps) {
    const contextValue: ComposerActionsContext = {
        canClear,
        duplicatesFilterEnabled,
        groupBy,
        metrics,
        onClearPalette,
        onCreateNote,
        onRemoveDuplicates,
        removableDuplicateCount,
        resultsSummary,
        sectionsLength,
    };

    return (
        <ComposerActionsContext value={contextValue}>
            <ScrollArea className="h-fit" shouldScrollFade>
                <Toolbar.Group
                    {...props}
                    className={cn(
                        "flex items-center gap-2.5 text-nowrap px-3 py-2",
                        className
                    )}
                />
            </ScrollArea>
        </ComposerActionsContext>
    );
}

export function ComposerActionNew() {
    const { onCreateNote } = useComposerActionsContext();

    return (
        <ComposerActionTrigger onClick={onCreateNote} title="Add new">
            <SquarePen className="inline-block size-3.5 shrink-0" />
            &nbsp;Add new
        </ComposerActionTrigger>
    );
}

export function ComposerActionMetrics() {
    return (
        <Popover>
            <PopoverTrigger openOnHover render={<ComposerMetricsTrigger />} />
            <PopoverPopup align="start" side="top">
                <ComposerMetricsPopoverPanel />
            </PopoverPopup>
        </Popover>
    );
}

export function ComposerActionRemoveDuplicates() {
    const {
        duplicatesFilterEnabled,
        onRemoveDuplicates,
        removableDuplicateCount,
    } = useComposerActionsContext();

    const canRemove = removableDuplicateCount > 0;

    if (!duplicatesFilterEnabled) {
        return null;
    }

    return (
        <ComposerActionTrigger
            disabled={!canRemove}
            onClick={onRemoveDuplicates}
            title={
                canRemove
                    ? "Remove duplicate bookmarks"
                    : "No duplicates to remove"
            }
        >
            <CopyX className="inline-block size-3.5 shrink-0" />
            &nbsp;Remove duplicates
        </ComposerActionTrigger>
    );
}

interface ComposerItemProps {
    isHorizontal?: boolean;
    item: ComposerPaletteItem;
}

function ComposerItem({ item, isHorizontal = false }: ComposerItemProps) {
    const onSelect = item.onSelect;

    const handleSelect = useStableCallback(
        (event: BaseUIEvent<React.MouseEvent>) => {
            const result = onSelect(event);
            if (result) {
                result.catch((error: unknown) => {
                    log.error("ComposerItem selection failed", error, {
                        value: item.value,
                    });
                });
            }
        }
    );

    return (
        <CommandItem
            className={cn(
                isHorizontal &&
                    "group squircle relative flex-1 overflow-hidden rounded-xl bg-accent text-accent-foreground shadow-xs"
            )}
            disabled={item.disabled}
            onClick={handleSelect}
            value={item.value}
        >
            {item.render ? (
                item.render(item)
            ) : (
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <div className="truncate">{item.label}</div>
                    {item.description ? (
                        <span className="max-w-xs truncate text-muted-foreground/80 text-xs">
                            {item.description}
                        </span>
                    ) : null}
                    {item.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                    ) : null}
                    {item.shortcut ? (
                        <CommandShortcut>{item.shortcut}</CommandShortcut>
                    ) : null}
                </div>
            )}
        </CommandItem>
    );
}

function ComposerMetricsTrigger(props: React.ComponentProps<typeof Button>) {
    const { canClear, groupBy, resultsSummary, sectionsLength } =
        useComposerActionsContext();

    return (
        <ComposerActionTrigger {...props}>
            {canClear ? (
                <Grid2x2X className="inline-block size-3.5 shrink-0" />
            ) : (
                <Grid2x2 className="inline-block size-3.5 shrink-0" />
            )}
            <span className="min-w-0 tabular-nums">
                &nbsp;Showing <Calligraph>{resultsSummary}</Calligraph>
                {groupBy === "none" ? null : (
                    <>
                        , <Calligraph>{sectionsLength}</Calligraph> group
                        {sectionsLength === 1 ? "" : "s"}
                    </>
                )}
            </span>
        </ComposerActionTrigger>
    );
}

function ComposerMetricsPopoverPanel() {
    const { canClear, metrics, onClearPalette } = useComposerActionsContext();

    const {
        duplicateCount,
        favoriteCount,
        inCollectionCount,
        itemCount,
        noteCount,
        sourceSegments,
        uncollectedCount,
        unreachableCount,
    } = metrics;

    const additionalRows = [
        {
            key: "uncollected",
            label: "Not in Collections",
            value: uncollectedCount,
        },
        {
            key: "duplicates",
            label: "Duplicates",
            value: duplicateCount,
        },
        {
            key: "unreachable",
            label: "Unreachable",
            value: unreachableCount,
        },
    ].filter((row) => row.value > 0);

    return (
        <DataList>
            {canClear ? (
                <PopoverClose
                    render={
                        <Button
                            className="w-full"
                            onClick={onClearPalette}
                            size="sm"
                            variant="secondary"
                        />
                    }
                >
                    Reset filters
                </PopoverClose>
            ) : null}
            <DataListHeader>
                <DataListTitle render={<PopoverTitle />}>
                    Library Breakdown
                </DataListTitle>
            </DataListHeader>
            <DataListSection>
                <DataListChart segments={sourceSegments} />
                <DataListGroup>
                    {sourceSegments.map((segment) => (
                        <DataListItem
                            color={segment.color}
                            key={segment.key}
                            label={segment.label}
                            value={formatShareValue(segment.value, itemCount)}
                        />
                    ))}
                </DataListGroup>
            </DataListSection>
            <DataListSection>
                <DataListGroup>
                    <DataListItem
                        label="Favorites"
                        value={formatShareValue(favoriteCount, itemCount)}
                    />
                    <DataListItem
                        label="Notes"
                        value={formatShareValue(noteCount, itemCount)}
                    />
                </DataListGroup>
                <DataListGroup>
                    <DataListItem
                        label="In Collections"
                        value={formatShareValue(inCollectionCount, itemCount)}
                    />
                    {additionalRows.map((row) => (
                        <DataListItem
                            key={row.key}
                            label={row.label}
                            value={formatShareValue(row.value, itemCount)}
                        />
                    ))}
                </DataListGroup>
            </DataListSection>
        </DataList>
    );
}

function ComposerActionTrigger({
    render,
    ...props
}: React.ComponentProps<typeof Toolbar.Button>) {
    return (
        <Toolbar.Button
            {...props}
            render={render ?? <Button size="xs" variant="ghost" />}
        />
    );
}

interface ComposerSuggestionsListProps
    extends Omit<React.ComponentProps<typeof CollapsiblePanel>, "children"> {
    children: (
        suggestion: ComposerSuggestion,
        index: number
    ) => React.ReactNode;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    suggestions: ComposerSuggestion[];
}

export function ComposerSuggestionsList({
    children,
    suggestions,
    className,
    isOpen: isOpenProp,
    onOpenChange: onOpenChangeProp,
    ...props
}: ComposerSuggestionsListProps) {
    const [internalOpen, setInternalOpen] = React.useState(true);
    const isOpen = isOpenProp ?? internalOpen;
    const setIsOpen = useStableCallback((open: boolean) => {
        onOpenChangeProp?.(open);
        if (isOpenProp === undefined) {
            setInternalOpen(open);
        }
    });

    const handleDismiss = useStableCallback(() => setIsOpen(false));

    const dismissSuggestion: ComposerSuggestion = {
        label: "Dismiss",
        onSelect: handleDismiss,
    };

    if (!suggestions.length) {
        return null;
    }

    return (
        <Collapsible onOpenChange={setIsOpen} open={isOpen}>
            <CollapsiblePanel
                {...props}
                className={cn("px-3", className)}
                render={<ScrollArea shouldScrollFade />}
            >
                <div className="flex w-max select-none flex-nowrap items-center gap-1.5 text-nowrap">
                    {suggestions.map((suggestion, i) => (
                        <React.Fragment key={suggestion.label}>
                            {children(suggestion, i)}
                            <span className="mr-0.5 -ml-0.5 font-medium text-muted-foreground text-xs">
                                ·
                            </span>
                        </React.Fragment>
                    ))}
                    {children(dismissSuggestion, suggestions.length)}
                </div>
            </CollapsiblePanel>
        </Collapsible>
    );
}

export function ComposerChip({
    label,
    onRemove,
}: {
    label: string;
    onRemove: () => void;
}) {
    const handleRemove = useStableCallback((event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onRemove();
    });

    return (
        <span className="inline-flex max-w-[min(100%,12rem)] items-center gap-0.5 rounded-xl border border-border/60 bg-background/90 py-0.5 ps-2 pe-0.5 font-medium text-foreground text-xs shadow-xs/5">
            <span className="min-w-0 max-w-full truncate text-xs">{label}</span>
            <Button
                aria-label={`Remove ${label}`}
                onClick={handleRemove}
                size="icon-xs"
                variant="ghost"
            >
                <XIcon className="size-3.5 shrink-0" />
            </Button>
        </span>
    );
}

export function ComposerCategoryThumbnail({ urls }: { urls: string[] }) {
    const validUrls = filterValidImageUrls(urls);
    const urlsKey = validUrls.join("\0");
    const [errorCount, setErrorCount] = React.useState(0);
    const [prevUrlsKey, setPrevUrlsKey] = React.useState(urlsKey);

    // Reset the error cursor when the candidate list changes so a prior
    // load failure does not permanently hide a newly valid thumbnail.
    if (!Object.is(urlsKey, prevUrlsKey)) {
        setPrevUrlsKey(urlsKey);
        setErrorCount(0);
    }

    const src = validUrls[errorCount];

    const handleImageError = useStableCallback(() => {
        setErrorCount((count) => count + 1);
    });

    if (!src) {
        return null;
    }

    return (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: resource error lifecycle is not user interaction; upstream jsx-a11y exempts img onError
        <img
            alt=""
            className="drag-none absolute top-10 left-3 h-auto w-full rounded-sm object-cover transition-transform ease-out group-data-highlighted:-translate-y-1"
            decoding="async"
            draggable="false"
            fetchPriority="high"
            height={104}
            loading="lazy"
            onError={handleImageError}
            src={src}
            width={140}
        />
    );
}

export function ComposerAttachmentChip({
    attachment,
    onRemove,
}: {
    attachment: ComposerAttachment;
    onRemove: (id: string) => void;
}) {
    const label = getAttachmentLabel(attachment);
    const mediaCategory = getMediaCategory(attachment);

    const handleRemove = useStableCallback(() => onRemove(attachment.id));

    return (
        <Attachments className="gap-0">
            <AttachmentPreviewCard>
                <AttachmentPreviewCardTrigger
                    render={
                        <Attachment
                            className="max-w-[min(100%,12rem)] border-border/60 bg-background/90 py-0.5 ps-1 pe-0.5 text-xs shadow-xs/5"
                            data={attachment}
                            onRemove={handleRemove}
                        />
                    }
                >
                    <AttachmentPreview className="size-4 bg-transparent" />
                    <AttachmentInfo />
                    <AttachmentRemove className="opacity-100" size="icon-xs">
                        <XIcon className="size-3.5! shrink-0" />
                    </AttachmentRemove>
                </AttachmentPreviewCardTrigger>
                <AttachmentPreviewCardPopup className="max-w-80">
                    <div className="space-y-3">
                        {mediaCategory === "image" && attachment.url ? (
                            <div className="flex max-h-80 w-72 items-center justify-center overflow-clip rounded-md border">
                                <img
                                    alt=""
                                    className="drag-none max-h-full max-w-full object-contain"
                                    decoding="async"
                                    draggable="false"
                                    height={320}
                                    loading="lazy"
                                    src={attachment.url}
                                    width={288}
                                />
                            </div>
                        ) : null}
                        <div className="space-y-1 px-0.5">
                            <h4 className="font-semibold text-sm leading-none">
                                {label}
                            </h4>
                            {attachment.mediaType ? (
                                <p className="font-mono text-muted-foreground text-xs">
                                    {attachment.mediaType}
                                </p>
                            ) : null}
                        </div>
                    </div>
                </AttachmentPreviewCardPopup>
            </AttachmentPreviewCard>
        </Attachments>
    );
}
