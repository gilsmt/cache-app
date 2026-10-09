"use client";

import type {
    AutocompleteRootChangeEventDetails,
    BaseUIEvent,
} from "@base-ui/react";
import { Toolbar } from "@base-ui/react/toolbar";
import { areArraysEqual } from "@base-ui/utils/areArraysEqual";
import { getTarget } from "@base-ui/utils/shadowDom";
import { useRefWithInit } from "@base-ui/utils/useRefWithInit";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import { cn } from "cn";
import { T, useGT, Var } from "gt-next";
import {
    ArrowDownWideNarrow,
    ArrowUpRight,
    Astroid,
    ChevronDown,
    ChevronRight,
    ChevronsDown,
    ChevronsUp,
    ChevronUp,
    CircleFadingPlus,
    Component,
    CopyX,
    DownloadIcon,
    Ellipsis,
    FileSpreadsheetIcon,
    FolderOpen,
    Funnel,
    Globe,
    History,
    Layers3,
    ListChevronsUpDown,
    RotateCcw,
    SearchIcon,
    SearchX,
    SquarePen,
    Tags,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Streamdown } from "streamdown";
import { ThinkingOrb } from "thinking-orbs";
import {
    BlockPaywallBanner,
    InlinePaywallBanner,
} from "@/components/billing/paywall";
import { useSubscriptionAccess } from "@/components/billing/subscription";
import { SuccessfulUpgradeDialog } from "@/components/billing/success";
import { useSectionDescription } from "@/components/hooks/queries/use-section-description";
import {
    type CollectionMembershipFilter,
    type ColumnCountMode,
    DEFAULT_COLLECTION_MEMBERSHIP_FILTER,
    DEFAULT_COLUMN_COUNT_MODE,
    DEFAULT_SORT_MODE,
    type GroupByMode,
    type SortMode,
    useComposerFilters,
} from "@/components/hooks/use-composer-filters";
import { useCopyToClipboard } from "@/components/hooks/use-copy-to-clipboard";
import { useIsExtensionInstalled } from "@/components/hooks/use-extension-installed";
import { useLastVisited } from "@/components/hooks/use-last-visited";
import { useSearchHistory } from "@/components/hooks/use-search-history";
import {
    ItemCollectionsCombobox,
    reconcileCollectionTags,
    replaceMultipleItemCollections,
    sortCollections,
    useCollectionsContext,
} from "@/components/session/collections";
import {
    Composer,
    type ComposerAttachment,
    ComposerAttachmentChip,
    ComposerChip,
    ComposerInput,
    CopyResponseButton,
    isSubmitKey,
    ReadAloudResponseButton,
} from "@/components/session/composer";
import {
    ItemCardDownloadProvider,
    ItemCardEnvironmentContext,
    ItemCardFooter,
    ItemCardProvider,
    ItemCardSkeleton,
    ItemCardSurface,
    ItemCardTarget,
    ItemCardZoomProvider,
    type ItemPeekPlaceholder,
} from "@/components/session/item";
import {
    ItemsContext,
    useItemsContext,
    useItemsStateContext,
} from "@/components/session/items";
import {
    AssistantMessageActions,
    AssistantMessageBody,
} from "@/components/session/message";
import { OnboardingMenu } from "@/components/session/onboarding";

import {
    type NoteDraft,
    openSide,
    openSideNote,
    SideContent,
    SideRoot,
} from "@/components/session/side-panel";
import {
    Summary,
    SummaryPopup,
    SummaryTrigger,
} from "@/components/session/summary";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsiblePanel } from "@/components/ui/collapsible";
import { CollapsibleListHorizontal } from "@/components/ui/collapsible-list";
import {
    CommandCollection,
    CommandEmpty,
    CommandGroup,
    CommandGroupLabel,
    CommandItem,
    CommandList,
    CommandPopup,
    CommandRow,
    CommandShortcut,
    useCommandFilter,
} from "@/components/ui/command";
import {
    ContextMenu,
    ContextMenuItem,
    ContextMenuPopup,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
    Dialog,
    DialogClose,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPanel,
    DialogPopup,
    DialogTitle,
} from "@/components/ui/dialog";
import { GradientWaveText } from "@/components/ui/gradient-wave-text";
import {
    type HoverHotkeyRegion,
    type HoverHotkeySurface,
    useHoverHotkeySurface,
} from "@/components/ui/hover-hotkey-surface";
import { ChevronDownFilledIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { CmdKbd, Kbd } from "@/components/ui/kbd";
import { MasonryItem, MasonryRoot } from "@/components/ui/masonry";
import {
    Menu,
    MenuItem,
    MenuPopup,
    MenuSeparator,
    MenuTrigger,
} from "@/components/ui/menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
    type CollectionCreateFromItemsResult,
    createCollectionFromItems,
} from "@/lib/collections/actions";
import {
    buildLibraryItemIndexes,
    type LibraryItemIndexes,
} from "@/lib/collections/indexes";
import {
    deleteLibraryItem,
    deleteLibraryItems,
    type LibraryItemCollectionsUpdateResult,
    type LibraryItemDeleteResult,
    type LibraryItemFavoriteToggleResult,
    type LibraryItemsCollectionsUpdateResult,
    type LibraryItemsDeleteResult,
    type LibraryItemsReachabilityProbeResult,
    probeLibraryItemsReachabilityAction,
    toggleLibraryItemFavorite,
    updateLibraryItemCollections,
    updateLibraryItemsCollections,
} from "@/lib/collections/items";
import {
    collectDuplicateBookmarkItemIds,
    isLinkProbeCandidate,
    itemCanonicalGroupKey,
    LINK_PROBE_MAX_RETRIES,
    LINK_PROBE_RETRY_BACKOFF_BASE_MS,
    LINK_REACHABILITY_BATCH_MAX,
    needsLinkReachabilityProbe,
} from "@/lib/collections/library-quality";
import { buildComposerMetrics } from "@/lib/collections/metrics";
import {
    buildItemsCsv,
    getLibraryItemPrimaryText,
    getLibraryItemTitle,
    getNoteExcerpt,
    type LibraryCollectionSummary,
    type LibraryItemWithCollections,
    truncateLabel,
} from "@/lib/collections/utils";
import {
    mergeById,
    removeValue,
    toggleValue,
    updateById,
} from "@/lib/common/array";
import { getColorGradientFromName } from "@/lib/common/color";
import {
    ACTION_STATUS,
    BATCH_UPDATE_MAX_ITEMS,
    CACHE_EXTENSION_DOWNLOAD_URL,
    FALLBACK_URL,
    ITEM_KIND_BOOKMARK,
    ITEM_KIND_NOTE,
    MIME_TYPES,
} from "@/lib/common/constants";
import { parseDate } from "@/lib/common/date";
import { isTextEntryTarget } from "@/lib/common/dom";
import { revokeFileAttachmentObjectUrl, saveFile } from "@/lib/common/file";
import { filterValidImageUrls } from "@/lib/common/image";
import { createLogger } from "@/lib/common/logs/console/logger";
import { NAME_COLLATOR, slugify, truncateText } from "@/lib/common/string";
import {
    normalizeURL,
    openExternalUrl,
    parseDisplayUrl,
    toValidUrl,
} from "@/lib/common/url";
import {
    type CreateChromeBookmarkFromUrlResult,
    createChromeBookmarkFromUrl,
} from "@/lib/integrations/chrome/actions";
import {
    createNote,
    type NoteMutationResult,
    updateNote,
} from "@/lib/integrations/notes/actions";
import { getSourceIcon, getSourceLabel } from "@/lib/integrations/support";
import { getAgentViewPage, runAssistant } from "@/lib/intelligence/actions";
import type {
    AssistantComposerPatch,
    AssistantRequest,
    AssistantResult,
    AssistantVisibleItem,
} from "@/lib/intelligence/composer/assistant";
import {
    ASSISTANT_CONTEXT_COLLECTION_LIMIT,
    ASSISTANT_CONTEXT_DOMAIN_LIMIT,
    ASSISTANT_VISIBLE_ITEM_LABEL_MAX_LENGTH,
    ASSISTANT_VISIBLE_ITEM_LIMIT,
} from "@/lib/intelligence/composer/assistant";
import type {
    AgentViewPage,
    AgentViewQuery,
} from "@/lib/intelligence/composer/view";
import {
    appendAgentViewPageIds,
    filterItemsToAgentView,
    resolveAgentViewItems,
} from "@/lib/intelligence/composer/view";
import {
    SECTION_DESCRIPTION_CONTEXT_ITEMS_LIMIT,
    SECTION_DESCRIPTION_DOMAIN_MAX_LENGTH,
    SECTION_DESCRIPTION_TEXT_MAX_LENGTH,
    SECTION_DESCRIPTION_TITLE_MAX_LENGTH,
    SECTION_DESCRIPTION_URL_MAX_LENGTH,
    type SectionDescriptionContextItem,
} from "@/lib/intelligence/overview";
import { createThreadFromAssistant } from "@/lib/threads/actions";
import { LibraryItemSource } from "@/prisma/client/enums";
import AppIconSmall from "@/public/cache-icon-small.png";
import { ToolbarGroup } from "../ui/toolbar";

const DOMAIN_RELATED_SOURCES = new Set<LibraryItemSource>([
    LibraryItemSource.chrome_bookmarks,
    LibraryItemSource.other,
]);

const EMPTY_PEEK_PLACEHOLDERS = [
    { aspect: "aspect-[3/4]", id: "library-empty-peek-0" },
    { aspect: "aspect-[4/5]", id: "library-empty-peek-1" },
    { aspect: "aspect-square", id: "library-empty-peek-2" },
    { aspect: "aspect-[5/6]", id: "library-empty-peek-3" },
    { aspect: "aspect-[3/4]", id: "library-empty-peek-4" },
    { aspect: "aspect-square", id: "library-empty-peek-5" },
    { aspect: "aspect-[4/5]", id: "library-empty-peek-6" },
    { aspect: "aspect-[3/4]", id: "library-empty-peek-7" },
    { aspect: "aspect-[5/6]", id: "library-empty-peek-8" },
    { aspect: "aspect-[4/5]", id: "library-empty-peek-9" },
] as const;

const UNCATEGORIZED_GROUP_KEY = "__uncategorized__";

const LOCKED_PEEK_ASPECT_CYCLE = [
    "aspect-[3/4]",
    "aspect-[4/5]",
    "aspect-square",
    "aspect-[5/6]",
] as const;

const LOCKED_PEEK_PLACEHOLDERS_MAX = 24;

interface ItemsGroup {
    items: LibraryItemWithCollections[];
    key: string;
    title: string | null;
}

interface CreateItemsCollectionInput {
    description?: string;
    itemIds: string[];
    name: string;
}

interface ItemsListContext {
    clearLibraryPalette: () => void;
    collapsedSectionKeys: ReadonlySet<string>;
    collections: LibraryCollectionSummary[];
    columnCount?: number;
    enableSectionCollapse: boolean;
    hoveredItemIdRef: React.RefObject<string | null>;
    hoverPinnedItemIdRef: React.RefObject<string | null>;
    markVisited: (itemId: string) => void;
    onCollapseAllSections: () => void;
    onCreateCollectionFromResults: () => void;
    onExpandAllSections: () => void;
    onExportSectionResults: (
        sectionTitle: string,
        items: LibraryItemWithCollections[]
    ) => void;
    onToggleSection: (key: string) => void;
    openPickerItemId: string | null;
    setOpenPickerItemId: (id: string | null) => void;
    shouldShowEmptyLibraryPeek: boolean;
    shouldShowLockedPreview: boolean;
    shouldShowNoFilteredResults: boolean;
    shouldShowUnreachableProbePending: boolean;
}

interface ItemsGroupContext {
    accentKey: string;
    collapsed: boolean;
    isMainResults: boolean;
    items: LibraryItemWithCollections[];
    onToggle: () => void;
    title: string;
}

interface SimilarItemFilterState {
    collectionMembershipFilter: CollectionMembershipFilter;
    domainFilters: string[];
    searchTerms: string[];
    selectedCollectionIds: string[];
    sourceFilters: LibraryItemSource[];
}

interface FilterItemsInput {
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

interface SimilarItemFilterOptions {
    domain: string;
    source: LibraryItemSource;
}

interface ItemIndexesCache {
    indexes: LibraryItemIndexes;
    items: LibraryItemWithCollections[];
    previewUrlCache: WeakMap<LibraryItemWithCollections, string | null>;
}

const ALL_DOMAIN_FILTER = "__all_domains__";
const UNSPECIFIC_LIBRARY_DOMAIN = "Other";
const COLLECTION_NAME_MAX_LENGTH = 64;

const FILTERABLE_LIBRARY_SOURCES = [
    LibraryItemSource.cache_note,
    LibraryItemSource.chrome_bookmarks,
    LibraryItemSource.extension_clip,
    LibraryItemSource.github_starred_repositories,
    LibraryItemSource.google_photos,
    LibraryItemSource.instagram,
    LibraryItemSource.markdown_import,
    LibraryItemSource.pinterest,
    LibraryItemSource.reddit_saved,
    LibraryItemSource.rss_feed,
    LibraryItemSource.tiktok,
    LibraryItemSource.x_bookmarks,
    LibraryItemSource.youtube_watch_later,
] as const satisfies LibraryItemSource[];

const MATCH_WORD_SEPARATOR_PATTERN = /[\s:./_-]+/;

const SUGGESTION_LIMIT = 3;
const SUGGESTION_ICON_CLASS = "size-3.5 shrink-0";
const MULTI_WORD_QUERY_PATTERN = /\S+\s+\S+/;
const COMBOBOX_ITEM_PRESS_REASON = "item-press";
const COMBOBOX_ESCAPE_KEY_REASON = "escape-key";
const COMPOSER_OPEN_HOTKEYS = [
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

const PALETTE_PLACEHOLDER_BY_SECTION: Partial<Record<PaletteSection, string>> =
    {
        advanced: "Refine with exact filters",
    };

const PALETTE_SORT_OPTIONS = [
    { label: "Added: Newest first", value: "added-newest" },
    { label: "Added: Oldest first", value: "added-oldest" },
    { label: "Created: Newest first", value: "created-newest" },
    { label: "Created: Oldest first", value: "created-oldest" },
    { label: "Count: Most items first", value: "count-desc" },
    { label: "Source", value: "source" },
    { label: "Domain", value: "domain" },
    { label: "Title", value: "title" },
] satisfies readonly { label: string; value: SortMode }[];

const PALETTE_GROUP_OPTIONS = [
    { label: "No grouping", value: "none" },
    { label: "Source", value: "source" },
    { label: "Domain", value: "domain" },
    { label: "Collection", value: "collection" },
    { label: "Year Added", value: "year-added" },
    { label: "Year Created", value: "year-created" },
    { label: "Month Added", value: "month-added" },
    { label: "Month Created", value: "month-created" },
] satisfies readonly { label: string; value: GroupByMode }[];

const PALETTE_COLUMN_OPTIONS = [
    { label: "Adjust automatically", value: "auto" },
    { label: "2 columns", value: "2" },
    { label: "3 columns", value: "3" },
    { label: "4 columns", value: "4" },
    { label: "5 columns", value: "5" },
    { label: "6 columns", value: "6" },
] satisfies readonly { label: string; value: ColumnCountMode }[];

const PALETTE_SOURCE_OPTIONS = [
    { label: "All sources", value: "all" },
    ...FILTERABLE_LIBRARY_SOURCES.map((source) => ({
        label: getSourceLabel(source),
        value: source,
    })),
    {
        label: getSourceLabel(LibraryItemSource.other),
        value: LibraryItemSource.other,
    },
] satisfies readonly { label: string; value: LibraryItemSource | "all" }[];

const PALETTE_SOURCE_FILTER_OPTIONS = PALETTE_SOURCE_OPTIONS.filter(
    (
        option
    ): option is {
        label: string;
        value: Exclude<(typeof PALETTE_SOURCE_OPTIONS)[number]["value"], "all">;
    } => option.value !== "all"
);

type PaletteSection = "search" | "advanced" | "ai-response";

type EffectiveGroupByMode = GroupByMode | "canonical-url";

type ComposerSortMode = Exclude<SortMode, "count-desc">;

interface DecoratedSortableItem {
    domain: string;
    item: LibraryItemWithCollections;
    primaryText: string;
    sourceLabel: string;
    timestamp: number;
}

type ComposerStackEntry = {
    key: string;
    onRemove: () => void;
} & (
    | {
          kind: "chip";
          label: string;
      }
    | {
          attachment: ComposerAttachment;
          kind: "attachment";
          onRemoveAttachment: (id: string) => void;
      }
);

interface ComposerCommand {
    children?: React.ReactNode;
    description?: string;
    disabled?: boolean;
    isActive?: boolean;
    label: string;
    onSelect: (
        event: BaseUIEvent<React.MouseEvent> | KeyboardEvent
    ) => void | Promise<void>;
    shortcut?: string;
    value: string;
}

interface ComposerCommandGroup {
    items: ComposerCommand[];
    label?: string;
    layout?: "horizontal" | "vertical";
}

interface ComposerSuggestion {
    icon?: React.ReactNode;
    id: string;
    label: string;
    onSelect: () => void;
}

interface ItemFacetCounts {
    collectionCounts: Map<string, number>;
    domainCounts: Map<string, number>;
    sourceCounts: Map<LibraryItemSource, number>;
}

interface TopFacet<TValue> {
    label: string;
    value: TValue;
}

type AssistantResponseState =
    | { prompt: string; status: "loading" }
    | {
          markdown: string;
          operationCount: number;
          prompt: string;
          status: "success";
      }
    | { message: string; prompt: string; status: "error" };

interface BuildComposerSuggestionsInput {
    clearLibraryPalette: () => void;
    collectionMembershipFilter: CollectionMembershipFilter;
    collections: LibraryCollectionSummary[];
    domainFilters: string[];
    effectiveGroupBy: EffectiveGroupByMode;
    groupBy: GroupByMode;
    hasAnyRefinements: boolean;
    isEmpty: boolean;
    isExtensionInstalled: boolean;
    items: LibraryItemWithCollections[];
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
}

interface BuildComposerStackEntriesInput {
    agentViewTitle: string | null;
    collectionMembershipFilter: CollectionMembershipFilter;
    collections: LibraryCollectionSummary[];
    columnCountMode: ColumnCountMode;
    composerAttachments: ComposerAttachment[];
    domainFilters: string[];
    duplicatesFilterEnabled: boolean;
    groupBy: GroupByMode;
    lastVisitedFilterEnabled: boolean;
    onDismissAgentView: () => void;
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

interface BuildComposerCommandsInput {
    assistantResponse: AssistantResponseState | null;
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
    onAssistantSubmit: (prompt: string) => void | Promise<void>;
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

interface ComposerCommandRank {
    index: number;
    score: number;
}

interface ComposerCommandSearchFields {
    lowerDescription: string;
    lowerLabel: string;
    lowerValue: string;
    words: string[];
}

interface RankedComposerCommand {
    item: ComposerCommand;
    rank: ComposerCommandRank;
}

interface PaletteActionsContext {
    duplicatesFilterEnabled: boolean;
    onCreateNote: () => void;
    onRemoveDuplicates: () => void;
    removableDuplicateCount: number;
}

const log = createLogger("library:items");

const ItemsListContext = React.createContext<ItemsListContext | null>(null);

function useItemsListContext(): ItemsListContext {
    const context = React.use(ItemsListContext);
    if (!context) {
        throw new Error(
            "ItemsList components must be used inside <ItemsList>."
        );
    }
    return context;
}

const ItemsGroupContext = React.createContext<ItemsGroupContext | null>(null);

function useItemsGroupContext(): ItemsGroupContext {
    const context = React.use(ItemsGroupContext);
    if (!context) {
        throw new Error(
            "ItemsGroup components must be used inside <ItemsGroupProvider>."
        );
    }
    return context;
}

const PaletteActionsContext = React.createContext<PaletteActionsContext | null>(
    null
);

function usePaletteActionsContext(): PaletteActionsContext {
    const context = React.use(PaletteActionsContext);
    if (!context) {
        throw new Error(
            "Palette action components must be used inside <PaletteActionsList>."
        );
    }
    return context;
}

function useItemsGroupCollapse({
    groupBy,
    hasActiveFilters,
    groups,
    shouldShowEmptyLibraryPeek,
    shouldShowNoFilteredResults,
}: {
    groupBy: EffectiveGroupByMode;
    hasActiveFilters: boolean;
    groups: ItemsGroup[];
    shouldShowEmptyLibraryPeek: boolean;
    shouldShowNoFilteredResults: boolean;
}) {
    const [collapsedSectionKeys, setCollapsedSectionKeys] = React.useState<
        ReadonlySet<string>
    >(() => new Set<string>());

    const enableSectionCollapse =
        !(shouldShowEmptyLibraryPeek || shouldShowNoFilteredResults) &&
        (hasActiveFilters || groupBy !== "none");

    const groupKeys = groups.map((section) => section.key);
    const [prevGroupKeys, setPrevGroupKeys] = React.useState(groupKeys);

    if (!areArraysEqual(groupKeys, prevGroupKeys)) {
        setPrevGroupKeys(groupKeys);
        const validKeys = new Set(groupKeys);
        setCollapsedSectionKeys((current) => {
            const next = new Set<string>();
            for (const key of current) {
                if (validKeys.has(key)) {
                    next.add(key);
                }
            }
            return next.size === current.size ? current : next;
        });
    }

    const [prevEnableSectionCollapse, setPrevEnableSectionCollapse] =
        React.useState(enableSectionCollapse);

    if (!Object.is(prevEnableSectionCollapse, enableSectionCollapse)) {
        setPrevEnableSectionCollapse(enableSectionCollapse);
        if (!enableSectionCollapse) {
            setCollapsedSectionKeys((current) =>
                current.size === 0 ? current : new Set<string>()
            );
        }
    }

    const toggleSection = useStableCallback((key: string) => {
        setCollapsedSectionKeys((current) => {
            const next = new Set(current);
            if (!next.delete(key)) {
                next.add(key);
            }
            return next;
        });
    });

    const collapseAllSections = useStableCallback(() => {
        setCollapsedSectionKeys(new Set(groupKeys));
    });

    const expandAllSections = useStableCallback(() => {
        setCollapsedSectionKeys((current) =>
            current.size === 0 ? current : new Set<string>()
        );
    });

    return {
        collapseAllSections,
        collapsedSectionKeys,
        enableSectionCollapse,
        expandAllSections,
        toggleSection,
    };
}

function useItemActions(args: {
    onDeleteSuccess: (collectionSummaries: LibraryCollectionSummary[]) => void;
    setItems: React.Dispatch<
        React.SetStateAction<LibraryItemWithCollections[]>
    >;
}) {
    const [pendingDeleteItem, setPendingDeleteItem] =
        React.useState<LibraryItemWithCollections | null>(null);
    const [deleteErrorMessage, setDeleteErrorMessage] = React.useState<
        string | null
    >(null);
    const { copyToClipboard } = useCopyToClipboard();

    const handleOpenInNewTab = useStableCallback(
        (item: LibraryItemWithCollections) => {
            openExternalUrl(normalizeURL(item.url));
        }
    );

    const handleCopyLink = useStableCallback(
        async (item: LibraryItemWithCollections) => {
            await copyToClipboard(normalizeURL(item.url));
        }
    );

    const handleRequestDelete = useStableCallback(
        (item: LibraryItemWithCollections) => {
            setDeleteErrorMessage(null);
            setPendingDeleteItem(item);
        }
    );

    const handleDeleteDialogOpenChange = useStableCallback((open: boolean) => {
        if (!open) {
            setDeleteErrorMessage(null);
            setPendingDeleteItem(null);
        }
    });

    const handleConfirmDelete = useStableCallback(async () => {
        const targetItem = pendingDeleteItem;
        if (!targetItem) {
            return;
        }

        setDeleteErrorMessage(null);
        setPendingDeleteItem(null);
        args.setItems((current) =>
            current.filter((item) => item.id !== targetItem.id)
        );

        let result: LibraryItemDeleteResult;
        try {
            result = await deleteLibraryItem(targetItem.id);
        } catch (error) {
            log.error("Failed to delete library item", error, {
                itemId: targetItem.id,
            });
            result = {
                message: "We couldn't delete this saved item right now.",
                status: ACTION_STATUS.ERROR,
            };
        }

        if (result.status === ACTION_STATUS.DELETED) {
            args.onDeleteSuccess(result.collectionSummaries);
            return;
        }

        // The item is already gone from the library, so the optimistic
        // removal matches the server and there is nothing to recover.
        if (result.status === ACTION_STATUS.NOT_FOUND) {
            return;
        }

        args.setItems((current) => mergeById(current, [targetItem]));
        setDeleteErrorMessage(result.message);
        setPendingDeleteItem(targetItem);
    });

    return {
        deleteErrorMessage,
        handleConfirmDelete,
        handleCopyLink,
        handleDeleteDialogOpenChange,
        handleOpenInNewTab,
        handleRequestDelete,
        pendingDeleteItem,
    };
}

function useItemHoverHotkeys({
    hoverHotkeySurface,
    hoveredItemIdRef,
    itemsById,
    onDelete,
    onItemFavoriteToggle,
    pendingDeleteItemId,
}: {
    hoverHotkeySurface: HoverHotkeySurface<HoverHotkeyRegion>;
    hoveredItemIdRef: React.RefObject<string | null>;
    itemsById: ReadonlyMap<string, LibraryItemWithCollections>;
    onDelete: (item: LibraryItemWithCollections) => void;
    onItemFavoriteToggle: (item: LibraryItemWithCollections) => void;
    pendingDeleteItemId: string | null;
}) {
    const resolveHoveredItem = useStableCallback(() => {
        if (hoverHotkeySurface.isClaimed()) {
            return null;
        }
        const id = hoveredItemIdRef.current;
        if (!id || pendingDeleteItemId === id) {
            return null;
        }
        return itemsById.get(id) ?? null;
    });

    useHotkeys(
        "alt+f",
        (event: KeyboardEvent) => {
            const item = resolveHoveredItem();
            if (!item) {
                return;
            }
            event.preventDefault();
            onItemFavoriteToggle(item);
        },
        {
            description: "Toggle favorite on hovered item",
            enableOnContentEditable: false,
            enableOnFormTags: false,
        },
        [onItemFavoriteToggle, resolveHoveredItem]
    );

    useHotkeys(
        "alt+e",
        (event: KeyboardEvent) => {
            const item = resolveHoveredItem();
            if (!item || item.kind === ITEM_KIND_NOTE) {
                return;
            }
            const href = normalizeURL(item.url);
            if (toValidUrl(href) === FALLBACK_URL) {
                return;
            }
            event.preventDefault();
            openSide({
                title: getLibraryItemTitle(item),
                url: item.url,
            });
        },
        {
            description: "Quick look on hovered item",
            enableOnContentEditable: false,
            enableOnFormTags: false,
        },
        [resolveHoveredItem]
    );

    useHotkeys(
        "mod+backspace",
        (event: KeyboardEvent) => {
            const item = resolveHoveredItem();
            if (!item) {
                return;
            }
            event.preventDefault();
            onDelete(item);
        },
        {
            description: "Delete hovered item",
            enableOnContentEditable: false,
            enableOnFormTags: false,
        },
        [onDelete, resolveHoveredItem]
    );
}

function useItemIndexes(
    items: LibraryItemWithCollections[]
): LibraryItemIndexes {
    const cacheRef = useRefWithInit<ItemIndexesCache | null>(() => null);
    const cached = cacheRef.current;
    if (cached?.items === items) {
        return cached.indexes;
    }
    const previewUrlCache =
        cached?.previewUrlCache ??
        new WeakMap<LibraryItemWithCollections, string | null>();
    const indexes = buildLibraryItemIndexes(items, previewUrlCache);
    cacheRef.current = { indexes, items, previewUrlCache };
    return indexes;
}

function useCollectionMutations({
    allCollections,
    itemsById,
    mergeCollectionSummaries,
    setItems,
    syncCollectionCreated,
}: {
    allCollections: LibraryCollectionSummary[];
    itemsById: ReadonlyMap<string, LibraryItemWithCollections>;
    mergeCollectionSummaries: (s: LibraryCollectionSummary[]) => void;
    setItems: React.Dispatch<
        React.SetStateAction<LibraryItemWithCollections[]>
    >;
    syncCollectionCreated: (p: {
        assignedItemIds: string[];
        collection: LibraryCollectionSummary;
    }) => void;
}) {
    const collectionUpdateRequestTokenByItemId = useRefWithInit(
        () => new Map<string, symbol>()
    ).current;
    const itemFavoriteToggleRequestTokenByItemId = useRefWithInit(
        () => new Map<string, symbol>()
    ).current;

    const handleUpdateItemCollections = useStableCallback(
        async (
            itemId: string,
            collectionIds: string[]
        ): Promise<LibraryItemCollectionsUpdateResult> => {
            const requestToken = Symbol(itemId);
            collectionUpdateRequestTokenByItemId.set(itemId, requestToken);
            const existingItem = itemsById.get(itemId);
            if (!existingItem) {
                collectionUpdateRequestTokenByItemId.delete(itemId);
                return {
                    message: "We couldn't update collections for this item.",
                    status: "ERROR",
                };
            }
            const previousCollections = existingItem.collections;
            const collectionIdSet = new Set(collectionIds);
            const optimisticCollections = sortCollections(
                allCollections.filter((collection) =>
                    collectionIdSet.has(collection.id)
                )
            );
            setItems((current) =>
                updateById(current, itemId, (item) => ({
                    ...item,
                    collections: optimisticCollections,
                }))
            );
            let result: LibraryItemCollectionsUpdateResult;
            try {
                result = await updateLibraryItemCollections({
                    collectionIds,
                    itemId,
                });
            } catch (error) {
                log.error("Failed to update item collections", error, {
                    itemId,
                });
                result = {
                    message: "We couldn't update collections for this item.",
                    status: "ERROR",
                };
            }
            if (
                collectionUpdateRequestTokenByItemId.get(itemId) !==
                requestToken
            ) {
                return result;
            }
            if (result.status === "UPDATED") {
                mergeCollectionSummaries(result.collectionSummaries);
                setItems((current) =>
                    updateById(current, itemId, (item) => ({
                        ...item,
                        collections: result.collections,
                    }))
                );
            } else {
                setItems((current) =>
                    updateById(current, itemId, (item) => ({
                        ...item,
                        collections: reconcileCollectionTags(
                            allCollections,
                            previousCollections
                        ),
                    }))
                );
            }
            collectionUpdateRequestTokenByItemId.delete(itemId);
            return result;
        }
    );

    const handleUpdateItemsCollections = useStableCallback(
        async (input: {
            itemIds: string[];
            nextSharedCollectionIds: string[];
            previousSharedCollectionIds: string[];
        }): Promise<LibraryItemsCollectionsUpdateResult> => {
            const requestedItemIds = new Set(input.itemIds);
            const previousItemCollections: {
                collections: LibraryItemWithCollections["collections"];
                itemId: string;
            }[] = [];
            for (const itemId of requestedItemIds) {
                const item = itemsById.get(itemId);
                if (item) {
                    previousItemCollections.push({
                        collections: item.collections,
                        itemId: item.id,
                    });
                }
            }
            const nextSharedCollectionIdSet = new Set(
                input.nextSharedCollectionIds
            );
            const previousSharedCollectionIdSet = new Set(
                input.previousSharedCollectionIds
            );
            const requestToken = Symbol("bulk-collection-update");
            for (const { itemId } of previousItemCollections) {
                collectionUpdateRequestTokenByItemId.set(itemId, requestToken);
            }
            const optimisticItemCollections = previousItemCollections.map(
                ({ collections: itemCollections, itemId }) => {
                    const optimisticCollections = sortCollections([
                        ...itemCollections.filter(
                            (collection) =>
                                !(
                                    previousSharedCollectionIdSet.has(
                                        collection.id
                                    ) ||
                                    nextSharedCollectionIdSet.has(collection.id)
                                )
                        ),
                        ...allCollections.filter((collection) =>
                            nextSharedCollectionIdSet.has(collection.id)
                        ),
                    ]);
                    return {
                        collections: optimisticCollections,
                        itemId,
                    };
                }
            );
            setItems((current) =>
                replaceMultipleItemCollections(
                    current,
                    optimisticItemCollections
                )
            );
            let result: LibraryItemsCollectionsUpdateResult;
            try {
                result = await updateLibraryItemsCollections(input);
            } catch (error) {
                log.error("Failed to update items collections", error, {
                    itemIds: input.itemIds,
                });
                result = {
                    message: "We couldn't update collections for those items.",
                    status: "ERROR",
                };
            }
            const currentItemIds = [...requestedItemIds].filter(
                (itemId) =>
                    collectionUpdateRequestTokenByItemId.get(itemId) ===
                    requestToken
            );
            if (currentItemIds.length === 0) {
                return result;
            }
            const currentItemIdSet = new Set(currentItemIds);
            if (result.status === "UPDATED") {
                if (currentItemIds.length === requestedItemIds.size) {
                    mergeCollectionSummaries(result.collectionSummaries);
                }
                setItems((current) =>
                    replaceMultipleItemCollections(
                        current,
                        result.itemCollections.filter((entry) =>
                            currentItemIdSet.has(entry.itemId)
                        )
                    )
                );
            } else {
                setItems((current) =>
                    replaceMultipleItemCollections(
                        current,
                        previousItemCollections
                            .filter(({ itemId }) =>
                                currentItemIdSet.has(itemId)
                            )
                            .map(
                                ({
                                    collections: previousCollections,
                                    itemId,
                                }) => ({
                                    collections: reconcileCollectionTags(
                                        allCollections,
                                        previousCollections
                                    ),
                                    itemId,
                                })
                            )
                    )
                );
            }
            for (const itemId of currentItemIds) {
                collectionUpdateRequestTokenByItemId.delete(itemId);
            }
            return result;
        }
    );

    const handleToggleItemFavorite = useStableCallback(
        async (
            item: LibraryItemWithCollections
        ): Promise<LibraryItemFavoriteToggleResult> => {
            const requestToken = Symbol(item.id);
            itemFavoriteToggleRequestTokenByItemId.set(item.id, requestToken);
            const currentItem = itemsById.get(item.id);
            if (!currentItem) {
                itemFavoriteToggleRequestTokenByItemId.delete(item.id);
                return {
                    message: "We couldn't update this favorite right now.",
                    status: "ERROR",
                };
            }
            const previousFavoritedAt = currentItem.favoritedAt;
            const optimisticFavoritedAt = previousFavoritedAt
                ? null
                : new Date();
            setItems((current) =>
                updateById(current, item.id, (liveItem) => ({
                    ...liveItem,
                    favoritedAt: optimisticFavoritedAt,
                }))
            );
            let result: LibraryItemFavoriteToggleResult;
            try {
                result = await toggleLibraryItemFavorite(item.id);
            } catch (error) {
                log.error("Failed to toggle item favorite", error, {
                    itemId: item.id,
                });
                result = {
                    message: "We couldn't update this favorite right now.",
                    status: "ERROR",
                };
            }
            if (
                itemFavoriteToggleRequestTokenByItemId.get(item.id) !==
                requestToken
            ) {
                return result;
            }
            if (result.status === "UPDATED") {
                setItems((current) =>
                    updateById(current, result.item.id, () => result.item)
                );
            } else {
                setItems((current) =>
                    updateById(current, item.id, (liveItem) => ({
                        ...liveItem,
                        favoritedAt: previousFavoritedAt,
                    }))
                );
            }
            itemFavoriteToggleRequestTokenByItemId.delete(item.id);
            return result;
        }
    );

    const handleCreateCollectionFromResults = useStableCallback(
        async (
            input: CreateItemsCollectionInput
        ): Promise<CollectionCreateFromItemsResult> => {
            let result: CollectionCreateFromItemsResult;
            try {
                result = await createCollectionFromItems(input);
            } catch (error) {
                log.error("Failed to create collection from results", error);
                result = {
                    message: "We couldn't create this collection right now.",
                    status: "ERROR",
                };
            }
            if (result.status !== "CREATED") {
                return result;
            }
            syncCollectionCreated({
                assignedItemIds: result.assignedItemIds,
                collection: result.collection,
            });
            return result;
        }
    );

    return {
        handleCreateCollectionFromResults,
        handleToggleItemFavorite,
        handleUpdateItemCollections,
        handleUpdateItemsCollections,
    };
}

function useUnreachableItemProbe({
    isEnabled,
    itemsRef,
    setItems,
}: {
    isEnabled: boolean;
    itemsRef: React.RefObject<LibraryItemWithCollections[]>;
    setItems: React.Dispatch<
        React.SetStateAction<LibraryItemWithCollections[]>
    >;
}) {
    const timeout = useTimeout();
    const [state, setState] = React.useState({
        checked: 0,
        isActive: false,
        probeFailed: false,
        total: 0,
    });
    const versionRef = React.useRef(0);

    React.useEffect(() => {
        if (!isEnabled) {
            versionRef.current += 1;
            setState({
                checked: 0,
                isActive: false,
                probeFailed: false,
                total: 0,
            });
            return;
        }

        const version = versionRef.current + 1;
        versionRef.current = version;

        const pendingSleepResolvers = new Set<() => void>();
        const probedItemIds = new Set<string>();

        const sleep = (ms: number) =>
            new Promise<void>((resolve) => {
                pendingSleepResolvers.add(resolve);
                timeout.start(ms, () => {
                    pendingSleepResolvers.delete(resolve);
                    resolve();
                });
            });

        const run = async () => {
            let consecutiveFailures = 0;

            while (versionRef.current === version) {
                const currentItems = itemsRef.current;
                const { batch, checked, totalProbeable } =
                    getUnreachableProbeBatch(currentItems, probedItemIds);

                if (batch.length === 0) {
                    setState({
                        checked: totalProbeable,
                        isActive: false,
                        probeFailed: false,
                        total: totalProbeable,
                    });
                    // Library may still be hydrating; keep waiting while empty.
                    if (currentItems.length === 0) {
                        await sleep(1000);
                        continue;
                    }
                    return;
                }

                setState({
                    checked,
                    isActive: true,
                    probeFailed: false,
                    total: totalProbeable,
                });

                const { result, thrownError } =
                    await probeUnreachableBatch(batch);

                if (versionRef.current !== version) {
                    return;
                }

                if (!result || result.status !== ACTION_STATUS.SUCCESS) {
                    if (result) {
                        log.error("Link reachability probe failed", {
                            message: result.message,
                        });
                    } else {
                        log.error("Link reachability probe threw", thrownError);
                    }
                    consecutiveFailures += 1;
                    if (consecutiveFailures > LINK_PROBE_MAX_RETRIES) {
                        setState({
                            checked,
                            isActive: false,
                            probeFailed: true,
                            total: totalProbeable,
                        });
                        return;
                    }
                    await sleep(getProbeRetryDelayMs(consecutiveFailures));
                    continue;
                }

                if (result.rateLimited) {
                    setState({
                        checked,
                        isActive: true,
                        probeFailed: false,
                        total: totalProbeable,
                    });
                    await sleep(Math.max(1000, result.retryAfterMs));
                    continue;
                }

                consecutiveFailures = 0;

                for (const item of batch) {
                    probedItemIds.add(item.id);
                }

                setItems((previous) =>
                    updateItemsWithProbeSuccess(previous, result)
                );
            }
        };

        run().catch((error) => {
            log.error("Link reachability probe loop failed", error);
        });

        return () => {
            versionRef.current += 1;
            timeout.clear();
            for (const resolve of pendingSleepResolvers) {
                resolve();
            }
        };
    }, [isEnabled, itemsRef, setItems, timeout]);

    return state;
}

function useDuplicateRemoval({
    mergeCollectionSummaries,
    removableItemIds,
    setDuplicatesFilterEnabled,
    setItems,
}: {
    mergeCollectionSummaries: (summaries: LibraryCollectionSummary[]) => void;
    removableItemIds: string[];
    setDuplicatesFilterEnabled: (enabled: boolean) => void;
    setItems: React.Dispatch<
        React.SetStateAction<LibraryItemWithCollections[]>
    >;
}) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [pendingItemIds, setPendingItemIds] = React.useState<string[]>([]);
    const [isRemoving, startRemoval] = React.useTransition();

    const onRequestRemoval = useStableCallback(() => {
        if (removableItemIds.length === 0) {
            return;
        }
        setPendingItemIds(removableItemIds);
        setIsOpen(true);
    });

    const onOpenChange = useStableCallback((open: boolean) => {
        if (open || isRemoving) {
            return;
        }
        setIsOpen(false);
        setPendingItemIds([]);
    });

    const onConfirm = useStableCallback(() => {
        const itemIds = pendingItemIds;
        if (itemIds.length === 0) {
            setIsOpen(false);
            return;
        }

        startRemoval(async () => {
            const deletedIds: string[] = [];
            const collectionSummariesById = new Map<
                string,
                LibraryCollectionSummary
            >();
            let failedCount = 0;

            for (
                let offset = 0;
                offset < itemIds.length;
                offset += BATCH_UPDATE_MAX_ITEMS
            ) {
                const batchIds = itemIds.slice(
                    offset,
                    offset + BATCH_UPDATE_MAX_ITEMS
                );
                let result: LibraryItemsDeleteResult;
                try {
                    result = await deleteLibraryItems({ itemIds: batchIds });
                } catch (error) {
                    log.error("Failed to remove duplicate bookmarks", error, {
                        batchSize: batchIds.length,
                    });
                    result = {
                        message:
                            "We couldn't remove these duplicates right now.",
                        status: ACTION_STATUS.ERROR,
                    };
                }

                if (result.status !== ACTION_STATUS.DELETED) {
                    failedCount += batchIds.length;
                    continue;
                }

                deletedIds.push(...batchIds);
                for (const summary of result.collectionSummaries) {
                    collectionSummariesById.set(summary.id, summary);
                }
            }

            if (deletedIds.length > 0) {
                const deletedIdSet = new Set(deletedIds);
                setItems((current) =>
                    current.filter((item) => !deletedIdSet.has(item.id))
                );
                mergeCollectionSummaries(
                    Array.from(collectionSummariesById.values())
                );
            }

            setIsOpen(false);
            setPendingItemIds([]);

            if (failedCount === 0 && deletedIds.length === itemIds.length) {
                setDuplicatesFilterEnabled(false);
            } else if (failedCount > 0) {
                log.error("Remove duplicates finished with failures", {
                    deletedCount: deletedIds.length,
                    failedCount,
                    requestedCount: itemIds.length,
                });
            }
        });
    });

    return {
        count: pendingItemIds.length,
        isOpen,
        isRemoving,
        onConfirm,
        onOpenChange,
        onRequestRemoval,
    };
}

function resolveAgentViewDisplayItems(
    items: LibraryItemWithCollections[],
    agentView: AgentViewPage | null
): LibraryItemWithCollections[] {
    if (!agentView) {
        return [];
    }
    return resolveAgentViewItems(items, agentView.itemIds);
}

function countAgentViewMissingIds(
    agentView: AgentViewPage | null,
    resolvedItems: LibraryItemWithCollections[]
): number {
    return (agentView?.itemIds.length ?? 0) - resolvedItems.length;
}

function getAgentViewCollectionDialogName(
    agentView: AgentViewPage | null,
    searchTerms: string[]
): string {
    if (agentView && searchTerms.length === 0) {
        return agentView.title.slice(0, COLLECTION_NAME_MAX_LENGTH);
    }
    return buildResultsCollectionName(searchTerms);
}

function buildAssistantVisibleItems(
    items: LibraryItemWithCollections[]
): AssistantVisibleItem[] {
    return items.slice(0, ASSISTANT_VISIBLE_ITEM_LIMIT).map((item) => ({
        domain: getLibraryItemDomain(item.url),
        id: item.id,
        label: truncateLabel(
            getLibraryItemPrimaryText(item),
            ASSISTANT_VISIBLE_ITEM_LABEL_MAX_LENGTH
        ),
    }));
}

function isEqualAgentViewQuery(
    left: AgentViewQuery,
    right: AgentViewQuery
): boolean {
    return (
        areArraysEqual(left.collectionIds ?? [], right.collectionIds ?? []) &&
        areArraysEqual(left.domainFilters ?? [], right.domainFilters ?? []) &&
        left.favoritedOnly === right.favoritedOnly &&
        left.kind === right.kind &&
        left.membership === right.membership &&
        areArraysEqual(left.sourceFilters ?? [], right.sourceFilters ?? []) &&
        left.text === right.text
    );
}

function getAgentViewKey(view: AgentViewPage): string {
    return JSON.stringify({
        explanation: view.explanation,
        query: view.query,
        title: view.title,
    });
}

function appendAgentViewPage(
    current: AgentViewPage | null,
    page: Pick<AgentViewPage, "itemIds" | "nextOffset" | "query" | "truncated">
): AgentViewPage | null {
    if (!current) {
        return current;
    }
    if (!isEqualAgentViewQuery(current.query, page.query)) {
        return current;
    }
    return {
        ...current,
        itemIds: appendAgentViewPageIds(current.itemIds, page.itemIds),
        nextOffset: page.nextOffset,
        truncated: page.truncated,
    };
}

function toIsoTimestamp(value: Date | string | null | undefined) {
    const date = parseDate(value);
    return date?.toISOString();
}

function buildSectionDescriptionContextItem(
    item: LibraryItemWithCollections
): SectionDescriptionContextItem {
    const title =
        getNoteExcerpt(
            getLibraryItemTitle(item),
            SECTION_DESCRIPTION_TITLE_MAX_LENGTH
        ) || "Untitled";

    const noteExcerpt =
        item.kind === "note"
            ? getNoteExcerpt(
                  item.noteContentText,
                  SECTION_DESCRIPTION_TEXT_MAX_LENGTH
              ) || undefined
            : undefined;

    const primaryText =
        noteExcerpt ??
        (getNoteExcerpt(
            getLibraryItemPrimaryText(item),
            SECTION_DESCRIPTION_TEXT_MAX_LENGTH
        ) ||
            title);

    const normalizedUrl =
        item.kind === "note"
            ? undefined
            : getNoteExcerpt(
                  normalizeURL(item.url),
                  SECTION_DESCRIPTION_URL_MAX_LENGTH
              ) || undefined;

    const domain =
        item.kind === "note"
            ? undefined
            : getNoteExcerpt(
                  getLibraryItemDomain(item.url),
                  SECTION_DESCRIPTION_DOMAIN_MAX_LENGTH
              ) || undefined;

    return {
        addedAt: toIsoTimestamp(item.scrapedAt ?? item.createdAt),
        createdAt: toIsoTimestamp(
            item.postedAt ?? item.scrapedAt ?? item.createdAt
        ),
        domain,
        kind: item.kind === "note" ? "note" : "bookmark",
        noteExcerpt,
        primaryText,
        source: item.source,
        title,
        url: normalizedUrl,
    };
}

function getItemsGroupExportFileName(sectionTitle: string): string {
    const slug = slugify(sectionTitle);
    return slug.length > 0 ? `${slug}-links` : "results-links";
}

function collectVisibleDuplicateExcessItemIds(
    allItems: LibraryItemWithCollections[],
    visibleItemIds: ReadonlySet<string>
): string[] {
    interface KeptCandidate {
        id: string;
        timestamp: number;
    }
    const keepByCanonical = new Map<string, KeptCandidate>();

    for (const item of allItems) {
        if (item.kind !== ITEM_KIND_BOOKMARK) {
            continue;
        }
        const canonical = itemCanonicalGroupKey(item);
        const timestamp = itemTimestamp(item, "added");
        const existing = keepByCanonical.get(canonical);
        if (!existing || timestamp < existing.timestamp) {
            keepByCanonical.set(canonical, { id: item.id, timestamp });
        }
    }

    const keepIds = new Set<string>();
    for (const candidate of keepByCanonical.values()) {
        keepIds.add(candidate.id);
    }

    const excessIds: string[] = [];
    for (const item of allItems) {
        if (item.kind !== ITEM_KIND_BOOKMARK) {
            continue;
        }
        if (keepIds.has(item.id) || !visibleItemIds.has(item.id)) {
            continue;
        }
        excessIds.push(item.id);
    }

    return excessIds;
}

function buildRemovableDuplicateItemIds({
    allItems,
    duplicatesFilterEnabled,
    filteredItems,
}: {
    allItems: LibraryItemWithCollections[];
    duplicatesFilterEnabled: boolean;
    filteredItems: LibraryItemWithCollections[];
}): string[] {
    const filteredItemIdSet = new Set(filteredItems.map((item) => item.id));
    return duplicatesFilterEnabled
        ? collectVisibleDuplicateExcessItemIds(allItems, filteredItemIdSet)
        : [];
}

function getUnreachableProbeBatch(
    currentItems: LibraryItemWithCollections[],
    probedItemIds: ReadonlySet<string>
) {
    const candidates: LibraryItemWithCollections[] = [];
    let totalProbeable = 0;
    for (const item of currentItems) {
        if (!isLinkProbeCandidate(item)) {
            continue;
        }
        totalProbeable += 1;
        if (probedItemIds.has(item.id) || !needsLinkReachabilityProbe(item)) {
            continue;
        }
        candidates.push(item);
    }

    return {
        batch: candidates.slice(0, LINK_REACHABILITY_BATCH_MAX),
        checked: totalProbeable - candidates.length,
        totalProbeable,
    };
}

function getProbeRetryDelayMs(consecutiveFailures: number): number {
    return LINK_PROBE_RETRY_BACKOFF_BASE_MS * 2 ** (consecutiveFailures - 1);
}

async function probeUnreachableBatch(
    batch: LibraryItemWithCollections[]
): Promise<{
    result: LibraryItemsReachabilityProbeResult | null;
    thrownError: unknown;
}> {
    try {
        const result = await probeLibraryItemsReachabilityAction({
            itemIds: batch.map((item) => item.id),
        });
        return { result, thrownError: null };
    } catch (thrownError) {
        return { result: null, thrownError };
    }
}

function updateItemsWithProbeSuccess(
    previous: LibraryItemWithCollections[],
    result: Extract<
        LibraryItemsReachabilityProbeResult,
        { status: typeof ACTION_STATUS.SUCCESS }
    >
): LibraryItemWithCollections[] {
    const resultById = new Map(
        result.results.map((entry) => [entry.itemId, entry] as const)
    );
    return previous.map((item) => {
        const entry = resultById.get(item.id);
        if (!entry) {
            return item;
        }
        return {
            ...item,
            linkCheckedAt: new Date(entry.checkedAt),
            linkReachability: entry.status,
        };
    });
}

function buildResultsCollectionName(searchTerms: string[]): string {
    const normalizedTerms = searchTerms
        .map((term) => term.trim())
        .filter((term) => term.length > 0);

    if (normalizedTerms.length === 0) {
        return "";
    }

    return normalizedTerms.join(" + ").slice(0, COLLECTION_NAME_MAX_LENGTH);
}

function filterItems(
    items: LibraryItemWithCollections[],
    input: FilterItemsInput
): LibraryItemWithCollections[] {
    if (
        !hasActiveComposerFilters({
            collectionMembershipFilter: input.collectionMembershipFilter,
            domainFilters: input.domainFilters,
            duplicatesFilterEnabled: input.duplicatesFilterEnabled,
            lastVisitedFilterEnabled: input.lastVisitedItemIds.length > 0,
            searchTerms: input.searchTerms,
            selectedCollectionIds: input.selectedCollectionIds,
            sourceFilters: input.sourceFilters,
            unreachableFilterEnabled: input.unreachableFilterEnabled,
        })
    ) {
        return items;
    }

    let filteredItems = items;
    const normalizedSearchTerms = input.searchTerms.map((term) =>
        term.trim().toLowerCase()
    );

    if (input.lastVisitedItemIds.length > 0) {
        const lastVisitedItemIdSet = new Set(input.lastVisitedItemIds);
        filteredItems = filteredItems.filter((item) =>
            lastVisitedItemIdSet.has(item.id)
        );
    }

    if (input.duplicatesFilterEnabled) {
        filteredItems = filteredItems.filter((item) =>
            input.duplicateItemIds.has(item.id)
        );
    }

    if (input.unreachableFilterEnabled) {
        filteredItems = filteredItems.filter((item) =>
            input.unreachableItemIds.has(item.id)
        );
    }

    // Selections suspend while "not in collections" is active: the two
    // filters are mutually exclusive
    if (
        input.selectedCollectionIds.length > 0 &&
        input.collectionMembershipFilter !== "not-in-collections"
    ) {
        const selectedCollectionIdSet = new Set(input.selectedCollectionIds);
        filteredItems = filteredItems.filter((item) =>
            item.collections.some((collection) =>
                selectedCollectionIdSet.has(collection.id)
            )
        );
    }

    if (input.collectionMembershipFilter === "in-collections") {
        filteredItems = filteredItems.filter(
            (item) => item.collections.length > 0
        );
    }

    if (input.collectionMembershipFilter === "not-in-collections") {
        filteredItems = filteredItems.filter(
            (item) => item.collections.length === 0
        );
    }

    if (normalizedSearchTerms.length > 0) {
        filteredItems = filteredItems.filter((item) => {
            const caption = item.caption?.toLowerCase() ?? "";
            const noteText = item.noteContentText?.toLowerCase() ?? "";
            const url = item.url.toLowerCase();
            return normalizedSearchTerms.some(
                (term) =>
                    caption.includes(term) ||
                    noteText.includes(term) ||
                    url.includes(term)
            );
        });
    }

    if (input.sourceFilters.length > 0) {
        const sourceFilterSet = new Set(input.sourceFilters);
        filteredItems = filteredItems.filter((item) =>
            sourceFilterSet.has(item.source)
        );
    }

    if (input.domainFilters.length > 0) {
        const domainFilterSet = new Set(input.domainFilters);
        filteredItems = filteredItems.filter((item) =>
            domainFilterSet.has(getLibraryItemDomain(item.url))
        );
    }

    return filteredItems;
}

function formatGroupHeading(
    mode: EffectiveGroupByMode,
    key: string,
    collectionNames?: Map<string, string>
): string {
    if (mode === "collection") {
        if (key === UNCATEGORIZED_GROUP_KEY) {
            return "Uncategorized";
        }
        return collectionNames?.get(key) ?? key;
    }
    if (mode === "source") {
        return getSourceLabel(key);
    }
    if (mode === "canonical-url") {
        return truncateLabel(key, 64);
    }
    if (mode === "month-added" || mode === "month-created") {
        const [ys, ms] = key.split("-");
        const y = Number(ys);
        const m = Number(ms);
        if (!(Number.isFinite(y) && Number.isFinite(m))) {
            return key;
        }
        return new Date(y, m - 1).toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
        });
    }
    return key;
}

function decorateSortableItem(
    item: LibraryItemWithCollections,
    sortMode: ComposerSortMode
): DecoratedSortableItem {
    const timestampMode =
        sortMode === "created-newest" || sortMode === "created-oldest"
            ? "created"
            : "added";
    return {
        domain: getLibraryItemDomain(item.url),
        item,
        primaryText: getLibraryItemPrimaryText(item),
        sourceLabel: getSourceLabel(item.source),
        timestamp: itemTimestamp(item, timestampMode),
    };
}

function compareSortableItems(
    a: DecoratedSortableItem,
    b: DecoratedSortableItem,
    sortMode: ComposerSortMode
): number {
    if (sortMode === "title") {
        return NAME_COLLATOR.compare(a.primaryText, b.primaryText);
    }

    const primary = (() => {
        if (sortMode === "added-newest" || sortMode === "created-newest") {
            return b.timestamp - a.timestamp;
        }
        if (sortMode === "added-oldest" || sortMode === "created-oldest") {
            return a.timestamp - b.timestamp;
        }
        if (sortMode === "source") {
            return NAME_COLLATOR.compare(a.sourceLabel, b.sourceLabel);
        }
        return NAME_COLLATOR.compare(a.domain, b.domain);
    })();

    return primary || NAME_COLLATOR.compare(a.primaryText, b.primaryText);
}

function compareSectionKeys(
    a: string,
    b: string,
    groupBy: EffectiveGroupByMode,
    sortMode: SortMode,
    collectionNames?: Map<string, string>
): number {
    if (
        groupBy === "month-added" ||
        groupBy === "month-created" ||
        groupBy === "year-added" ||
        groupBy === "year-created"
    ) {
        const isOldest =
            sortMode === "added-oldest" || sortMode === "created-oldest";
        return isOldest ? a.localeCompare(b) : b.localeCompare(a);
    }
    if (groupBy === "source") {
        return NAME_COLLATOR.compare(
            formatGroupHeading(groupBy, a),
            formatGroupHeading(groupBy, b)
        );
    }
    if (groupBy === "collection") {
        const aName = collectionNames?.get(a) ?? a;
        const bName = collectionNames?.get(b) ?? b;
        return NAME_COLLATOR.compare(aName, bName);
    }
    return NAME_COLLATOR.compare(a, b);
}

function sortItems(
    filteredItems: LibraryItemWithCollections[],
    sortMode: SortMode
): LibraryItemWithCollections[] {
    const itemSortMode =
        sortMode === "count-desc" ? DEFAULT_SORT_MODE : sortMode;
    return filteredItems
        .map((item) => decorateSortableItem(item, itemSortMode))
        .sort((a, b) => compareSortableItems(a, b, itemSortMode))
        .map((decorated) => decorated.item);
}

function buildItemsGroups(
    sortedItems: LibraryItemWithCollections[],
    groupBy: EffectiveGroupByMode,
    sortMode: SortMode,
    collections?: LibraryCollectionSummary[]
): ItemsGroup[] {
    if (groupBy === "none") {
        return [
            {
                items: sortedItems,
                key: "all",
                title: null,
            },
        ];
    }

    const collectionNames = new Map(collections?.map((c) => [c.id, c.name]));

    const buckets = new Map<string, LibraryItemWithCollections[]>();
    for (const item of sortedItems) {
        for (const key of getItemGroupKeys(item, groupBy)) {
            const bucket = buckets.get(key) ?? [];
            bucket.push(item);
            buckets.set(key, bucket);
        }
    }

    return Array.from(buckets.entries())
        .sort(([a, aItems], [b, bItems]) => {
            if (sortMode === "count-desc") {
                return (
                    bItems.length - aItems.length ||
                    compareSectionKeys(a, b, groupBy, sortMode, collectionNames)
                );
            }

            return compareSectionKeys(a, b, groupBy, sortMode, collectionNames);
        })
        .map(([key, sectionItems]) => ({
            items: sectionItems,
            key,
            title: formatGroupHeading(groupBy, key, collectionNames),
        }));
}

async function saveLibraryNoteDraft({
    activeNoteId,
    draft,
}: {
    activeNoteId: string | null;
    draft: NoteDraft;
}): Promise<NoteMutationResult> {
    try {
        return activeNoteId
            ? await updateNote({
                  contentHtml: draft.contentHtml,
                  contentState: draft.contentState ?? undefined,
                  itemId: activeNoteId,
              })
            : await createNote({
                  contentHtml: draft.contentHtml,
                  contentState: draft.contentState ?? undefined,
              });
    } catch {
        return {
            message: activeNoteId
                ? "We couldn't save this note right now."
                : "We couldn't create this note right now.",
            status: "ERROR",
        };
    }
}

async function createLibraryBookmarkFromPastedUrl({
    url,
}: {
    url: string;
}): Promise<CreateChromeBookmarkFromUrlResult> {
    try {
        return await createChromeBookmarkFromUrl({
            url,
        });
    } catch {
        return {
            message: "We couldn't save this URL right now.",
            status: "ERROR",
        };
    }
}

function buildSimilarItemFilterState(
    state: SimilarItemFilterState,
    options: SimilarItemFilterOptions
): SimilarItemFilterState {
    const shouldUseDomainFilter =
        DOMAIN_RELATED_SOURCES.has(options.source) &&
        options.domain !== UNSPECIFIC_LIBRARY_DOMAIN;

    return {
        ...state,
        collectionMembershipFilter: DEFAULT_COLLECTION_MEMBERSHIP_FILTER,
        domainFilters: shouldUseDomainFilter ? [options.domain] : [],
        searchTerms: [],
        selectedCollectionIds: [],
        sourceFilters: shouldUseDomainFilter ? [] : [options.source],
    };
}

function getLibraryItemDomain(url: string): string {
    return parseDisplayUrl(url) || UNSPECIFIC_LIBRARY_DOMAIN;
}

function buildDomainPaletteOptions(
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

function hasActiveComposerFilters({
    collectionMembershipFilter,
    domainFilters,
    duplicatesFilterEnabled,
    lastVisitedFilterEnabled,
    searchTerms,
    selectedCollectionIds,
    sourceFilters,
    unreachableFilterEnabled,
}: {
    collectionMembershipFilter: CollectionMembershipFilter;
    domainFilters: string[];
    duplicatesFilterEnabled: boolean;
    lastVisitedFilterEnabled: boolean;
    searchTerms: string[];
    selectedCollectionIds: string[];
    sourceFilters: LibraryItemSource[];
    unreachableFilterEnabled: boolean;
}): boolean {
    return (
        searchTerms.length > 0 ||
        selectedCollectionIds.length > 0 ||
        sourceFilters.length > 0 ||
        domainFilters.length > 0 ||
        collectionMembershipFilter !== DEFAULT_COLLECTION_MEMBERSHIP_FILTER ||
        lastVisitedFilterEnabled ||
        duplicatesFilterEnabled ||
        unreachableFilterEnabled
    );
}

function itemDate(
    item: LibraryItemWithCollections,
    mode: "added" | "created" = "added"
): Date {
    const candidates =
        mode === "created"
            ? [item.postedAt, item.scrapedAt, item.createdAt]
            : [item.scrapedAt, item.createdAt];
    for (const candidate of candidates) {
        if (candidate === null || candidate === undefined) {
            continue;
        }
        const date =
            candidate instanceof Date ? candidate : new Date(candidate);
        if (Number.isFinite(date.getTime())) {
            return date;
        }
    }
    return new Date(0);
}

function itemTimestamp(
    item: LibraryItemWithCollections,
    mode: "added" | "created" = "added"
): number {
    return itemDate(item, mode).getTime();
}

function itemMonthKey(
    item: LibraryItemWithCollections,
    mode: "added" | "created" = "added"
): string {
    const date = itemDate(item, mode);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

function itemYearKey(
    item: LibraryItemWithCollections,
    mode: "added" | "created" = "added"
): string {
    const date = itemDate(item, mode);
    return date.getFullYear().toString();
}

function getItemGroupKey(
    item: LibraryItemWithCollections,
    groupBy: Exclude<EffectiveGroupByMode, "none" | "collection">
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
    const _exhaustive: never = groupBy;
    return _exhaustive;
}

function getItemGroupKeys(
    item: LibraryItemWithCollections,
    groupBy: Exclude<EffectiveGroupByMode, "none">
): string[] {
    if (groupBy === "collection") {
        if (item.collections.length === 0) {
            return [UNCATEGORIZED_GROUP_KEY];
        }
        return [...new Set(item.collections.map(({ id }) => id))];
    }
    return [getItemGroupKey(item, groupBy)];
}

function countItemGroupKeys(
    items: LibraryItemWithCollections[],
    groupBy: Exclude<EffectiveGroupByMode, "none">
): number {
    const keys = new Set<string>();
    for (const item of items) {
        for (const key of getItemGroupKeys(item, groupBy)) {
            keys.add(key);
        }
    }
    return keys.size;
}

interface UseVisibleCommandsProps {
    groups: ComposerCommandGroup[];
    query: string;
}

function useVisibleCommands({
    groups,
    query,
}: UseVisibleCommandsProps): ComposerCommandGroup[] {
    const filter = useCommandFilter();
    const normalizedQuery = query.trim();

    if (normalizedQuery.length === 0) {
        return groups;
    }

    const lowerQuery = normalizedQuery.toLowerCase();
    const visibleCommandGroups: ComposerCommandGroup[] = [];

    for (const group of groups) {
        const rankedItems: RankedComposerCommand[] = [];

        for (const [index, item] of group.items.entries()) {
            const score = getComposerCommandScore(filter, item, lowerQuery);
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

        visibleCommandGroups.push({
            ...group,
            items: rankedItems.map(({ item }) => item),
        });
    }

    return visibleCommandGroups;
}

function getComposerCommandSearchFields(
    item: ComposerCommand
): ComposerCommandSearchFields {
    const lowerLabel = item.label.trim().toLowerCase();
    return {
        lowerDescription: (item.description ?? "").toLowerCase(),
        lowerLabel,
        lowerValue: item.value.toLowerCase(),
        words: lowerLabel.split(MATCH_WORD_SEPARATOR_PATTERN),
    };
}

function getComposerCommandScore(
    filter: ReturnType<typeof useCommandFilter>,
    item: ComposerCommand,
    lowerQuery: string
): number | null {
    const { lowerDescription, lowerLabel, lowerValue, words } =
        getComposerCommandSearchFields(item);

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

function groupByLabel(mode: GroupByMode): string {
    return (
        PALETTE_GROUP_OPTIONS.find((opt) => opt.value === mode)?.label ?? "None"
    );
}

function sortModeLabel(mode: SortMode): string {
    return (
        PALETTE_SORT_OPTIONS.find((opt) => opt.value === mode)?.label ??
        "Added: Newest first"
    );
}

function columnCountLabel(mode: ColumnCountMode): string {
    return (
        PALETTE_COLUMN_OPTIONS.find((opt) => opt.value === mode)?.label ??
        "Adjust automatically"
    );
}

function collectionMembershipFilterLabel(
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

function collectionItemCountLabel(count: number): string {
    return `${count} item${count === 1 ? "" : "s"}`;
}

function buildCollectionCommandDescription(
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

function buildCollectionCommands({
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
}): ComposerCommand[] {
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
                description: buildCollectionCommandDescription(
                    collection,
                    isActive
                ),
                isActive,
                label: `Collection: ${collection.name}`,
                onSelect: wrapOnSelect(() =>
                    onToggleCollectionSelection(collection.id)
                ),
                value: `filter collection ${collection.id}`,
            } satisfies ComposerCommand;
        }),
    ];
}

function appendUniqueSearchTerm(values: string[], next: string): string[] {
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

function isMultiWordQuery(query: string): boolean {
    return MULTI_WORD_QUERY_PATTERN.test(query.trim());
}

function removeLastPaletteStackEntry(entries: ComposerStackEntry[]): boolean {
    const lastEntry = entries.at(-1);
    if (!lastEntry) {
        return false;
    }
    lastEntry.onRemove();
    return true;
}

function isSearchHotkey(event: KeyboardEvent): boolean {
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

function isPrintablePaletteKey(event: KeyboardEvent): boolean {
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

function buildComposerSuggestions({
    clearLibraryPalette,
    collectionMembershipFilter,
    collections,
    domainFilters,
    effectiveGroupBy,
    groupBy,
    hasAnyRefinements,
    isEmpty,
    isExtensionInstalled,
    items,
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
    sortMode,
    sourceFilters,
}: BuildComposerSuggestionsInput): ComposerSuggestion[] {
    const commitSelection = (fn: () => void) => () => {
        fn();
        setQuery("");
        setIsComposerOpen(false);
    };

    const collectionNames = new Map(
        collections.map((collection) => [collection.id, collection.name])
    );
    const { collectionCounts, domainCounts, sourceCounts } =
        countItemFacets(items);
    const topCollection = pickTopFacet(
        collectionCounts,
        (collectionId) => !selectedCollectionIds.includes(collectionId),
        (collectionId) => collectionNames.get(collectionId) ?? collectionId
    );
    const topSource = pickTopFacet(
        sourceCounts,
        (source) => !sourceFilters.includes(source),
        getSourceLabel
    );
    const topDomain = pickTopFacet(
        domainCounts,
        (domain) => !domainFilters.includes(domain),
        (domain) => domain
    );
    // The duplicates filter forces canonical-url grouping outside groupBy,
    // so grouping suggestions would apply to a view the user never sees.
    const isGroupingLocked = effectiveGroupBy === "canonical-url";
    const nextGroupBy = isGroupingLocked
        ? null
        : findNextGroupBy(items, groupBy, sourceFilters, domainFilters);
    const groupKeyCount =
        effectiveGroupBy === "none"
            ? 0
            : countItemGroupKeys(items, effectiveGroupBy);

    // Undo actions for active data filters rank first, because a narrowed or
    // empty result set must offer a way back before new refinements take
    // the remaining slots. Sorting the open groups comes next because it
    // improves the view the user is looking at now. Discovery actions follow
    // and stay empty while no item matches, so an empty result set surfaces
    // the undo actions alone. View reversals rank last: the visible facet
    // chips and the palette already expose them.
    const suggestions: ComposerSuggestion[] = [];

    if (searchTerms.length > 0) {
        suggestions.push({
            icon: <SearchX className={SUGGESTION_ICON_CLASS} />,
            id: "clear-searches",
            label: "Clear searches",
            onSelect: commitSelection(() => setSearchTerms([])),
        });
    }

    if (selectedCollectionIds.length > 0) {
        suggestions.push({
            icon: <FolderOpen className={SUGGESTION_ICON_CLASS} />,
            id: "show-all-collections",
            label: "Show all collections",
            onSelect: commitSelection(onClearCollectionFilters),
        });
    }

    if (sourceFilters.length > 0) {
        suggestions.push({
            icon: <Funnel className={SUGGESTION_ICON_CLASS} />,
            id: "show-all-sources",
            label: "Show all sources",
            onSelect: commitSelection(() => setSourceFilters([])),
        });
    }

    if (domainFilters.length > 0) {
        suggestions.push({
            icon: <Globe className={SUGGESTION_ICON_CLASS} />,
            id: "show-all-domains",
            label: "Show all domains",
            onSelect: commitSelection(() => setDomainFilters([])),
        });
    }

    if (collectionMembershipFilter !== DEFAULT_COLLECTION_MEMBERSHIP_FILTER) {
        suggestions.push({
            icon: <Tags className={SUGGESTION_ICON_CLASS} />,
            id: "show-all-items",
            label: "Show all items",
            onSelect: commitSelection(() =>
                setCollectionMembershipFilter(
                    DEFAULT_COLLECTION_MEMBERSHIP_FILTER
                )
            ),
        });
    }

    const resetFilters: ComposerSuggestion | null = hasAnyRefinements
        ? {
              icon: <RotateCcw className={SUGGESTION_ICON_CLASS} />,
              id: "reset-filters",
              label: "Reset filters",
              onSelect: commitSelection(clearLibraryPalette),
          }
        : null;
    if (resetFilters !== null) {
        suggestions.push(resetFilters);
    }

    if (groupKeyCount > 1 && sortMode !== "count-desc") {
        suggestions.push({
            icon: <ArrowDownWideNarrow className={SUGGESTION_ICON_CLASS} />,
            id: "sort-groups-by-size",
            label: "Sort groups by size",
            onSelect: commitSelection(() => setSortMode("count-desc")),
        });
    }

    if (topCollection !== null) {
        const collectionName = truncateLabel(topCollection.label, 24);
        suggestions.push({
            icon: <FolderOpen className={SUGGESTION_ICON_CLASS} />,
            id: `collection:${topCollection.value}`,
            label:
                selectedCollectionIds.length === 0
                    ? `Browse “${collectionName}”`
                    : `Add “${collectionName}” collection`,
            onSelect: commitSelection(() =>
                onToggleCollectionSelection(topCollection.value)
            ),
        });
    }

    if (topSource !== null) {
        suggestions.push({
            icon: <Funnel className={SUGGESTION_ICON_CLASS} />,
            id: `source:${topSource.value}`,
            label: `Filter by ${topSource.label}`,
            onSelect: commitSelection(() =>
                setSourceFilters((current) =>
                    toggleValue(current, topSource.value)
                )
            ),
        });
    }

    if (nextGroupBy !== null) {
        const nextGroupLabel = groupByLabel(nextGroupBy).toLowerCase();
        suggestions.push({
            icon: <Layers3 className={SUGGESTION_ICON_CLASS} />,
            id: `group:${nextGroupBy}`,
            label:
                groupBy === "none"
                    ? `Group by ${nextGroupLabel}`
                    : `Try ${nextGroupLabel} groups`,
            onSelect: commitSelection(() => setGroupBy(nextGroupBy)),
        });
    }

    if (topDomain !== null) {
        suggestions.push({
            icon: <Globe className={SUGGESTION_ICON_CLASS} />,
            id: `domain:${topDomain.value}`,
            label: `Filter to ${truncateLabel(topDomain.label, 24)}`,
            onSelect: commitSelection(() =>
                setDomainFilters((current) =>
                    toggleValue(current, topDomain.value)
                )
            ),
        });
    }

    if (groupBy !== "none") {
        suggestions.push({
            icon: <Layers3 className={SUGGESTION_ICON_CLASS} />,
            id: "ungroup",
            label: "Ungroup",
            onSelect: commitSelection(() => setGroupBy("none")),
        });
    }

    if (sortMode !== DEFAULT_SORT_MODE) {
        suggestions.push({
            icon: <ArrowDownWideNarrow className={SUGGESTION_ICON_CLASS} />,
            id: "reset-sort",
            label: "Reset sort",
            onSelect: commitSelection(() => setSortMode(DEFAULT_SORT_MODE)),
        });
    }

    if (isEmpty) {
        suggestions.push({
            icon: <FolderOpen className={SUGGESTION_ICON_CLASS} />,
            id: "create-collection",
            label: "Create a new collection",
            onSelect: commitSelection(onCreateCollection),
        });
    }

    if (!isExtensionInstalled) {
        suggestions.push({
            icon: <DownloadIcon className={SUGGESTION_ICON_CLASS} />,
            id: "get-extension",
            label: "Get extension",
            onSelect: commitSelection(() =>
                openExternalUrl(CACHE_EXTENSION_DOWNLOAD_URL)
            ),
        });
    }

    const visible = suggestions.slice(0, SUGGESTION_LIMIT);
    // The row budget must never drop the only action that clears every
    // refinement at once.
    if (resetFilters !== null && !visible.includes(resetFilters)) {
        visible[visible.length - 1] = resetFilters;
    }
    return visible;
}

function countItemFacets(items: LibraryItemWithCollections[]): ItemFacetCounts {
    const collectionCounts = new Map<string, number>();
    const domainCounts = new Map<string, number>();
    const sourceCounts = new Map<LibraryItemSource, number>();

    for (const item of items) {
        sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);

        const domain = getLibraryItemDomain(item.url);
        domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);

        for (const collectionId of new Set(
            item.collections.map(({ id }) => id)
        )) {
            collectionCounts.set(
                collectionId,
                (collectionCounts.get(collectionId) ?? 0) + 1
            );
        }
    }

    return { collectionCounts, domainCounts, sourceCounts };
}

function pickTopFacet<TValue>(
    counts: Map<TValue, number>,
    isEligible: (value: TValue) => boolean,
    getLabel: (value: TValue) => string
): TopFacet<TValue> | null {
    const top = Array.from(counts.entries())
        .filter(([value]) => isEligible(value))
        .sort(
            ([firstValue, firstCount], [secondValue, secondCount]) =>
                secondCount - firstCount ||
                NAME_COLLATOR.compare(
                    getLabel(firstValue),
                    getLabel(secondValue)
                )
        )[0];

    return top === undefined
        ? null
        : { label: getLabel(top[0]), value: top[0] };
}

function findNextGroupBy(
    items: LibraryItemWithCollections[],
    currentGroupBy: GroupByMode,
    sourceFilters: LibraryItemSource[],
    domainFilters: string[]
): GroupByMode | null {
    const groupingModes: GroupByMode[] = PALETTE_GROUP_OPTIONS.map(
        (option) => option.value
    );
    const filteredAxes = new Set<GroupByMode>();
    if (sourceFilters.length > 0) {
        filteredAxes.add("source");
    }
    if (domainFilters.length > 0) {
        filteredAxes.add("domain");
    }

    // Grouping on an axis the user already filtered on repeats the current
    // view, so filtered axes rank last.
    const candidateModes: GroupByMode[] = [
        ...groupingModes.filter((mode) => !filteredAxes.has(mode)),
        ...groupingModes.filter((mode) => filteredAxes.has(mode)),
    ];

    return (
        candidateModes.find(
            (mode) =>
                mode !== "none" &&
                mode !== currentGroupBy &&
                countItemGroupKeys(items, mode) > 1
        ) ?? null
    );
}

function buildComposerCommandGroups({
    assistantResponse,
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
    onAssistantSubmit,
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
}: BuildComposerCommandsInput): ComposerCommandGroup[] {
    const draft = query.trim();
    const groups: ComposerCommandGroup[] = [];

    const applyAndReturn = (fn: () => void | Promise<void>) => async () => {
        await fn();
        returnToSearchSection();
    };

    const applyAndStay = (fn: () => void) => () => {
        fn();
        setQuery("");
        setIsComposerOpen(true);
    };

    const navigationItems: ComposerCommand[] = [
        {
            description: "Exact filters, grouping, sort, and columns",
            label: "Advanced…",
            onSelect: (event) => openPaletteSection("advanced", event),
            value: "navigate advanced",
        },
    ];

    const backItem: ComposerCommand = {
        description: "Return to search and quick actions",
        label: "Back",
        onSelect: returnToSearchSection,
        shortcut: "Esc",
        value: "navigate back",
    };

    const hasAnyRefinements =
        hasActiveComposerFilters({
            collectionMembershipFilter,
            domainFilters,
            duplicatesFilterEnabled,
            lastVisitedFilterEnabled,
            searchTerms,
            selectedCollectionIds,
            sourceFilters,
            unreachableFilterEnabled,
        }) ||
        groupBy !== "none" ||
        sortMode !== DEFAULT_SORT_MODE ||
        columnCountMode !== DEFAULT_COLUMN_COUNT_MODE;

    if (paletteSection === "search") {
        return buildSearchCommands({
            clearLibraryPalette,
            collectionPreviewThumbnailUrlsById,
            collections,
            draft,
            hasAnyRefinements,
            lastVisitedFilterEnabled,
            lastVisitedItemIds,
            navigationItems,
            onAssistantSubmit,
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
        return buildAssistantCommands({
            assistantResponse,
            backItem,
            draft,
            onAssistantSubmit,
        });
    }

    if (paletteSection === "advanced") {
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
            items: buildCollectionCommands({
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
        groups.push({
            items: PALETTE_GROUP_OPTIONS.map((option) => ({
                description: "Organize the grid into sections",
                isActive: groupBy === option.value,
                label: option.label,
                onSelect: applyAndReturn(() => setGroupBy(option.value)),
                value: `group ${option.value}`,
            })),
            label: "Grouping",
        });
        groups.push({
            items: PALETTE_SORT_OPTIONS.map((option) => ({
                description: "Change the ordering within the current view",
                isActive: sortMode === option.value,
                label: option.label,
                onSelect: applyAndReturn(() => setSortMode(option.value)),
                value: `sort ${option.value}`,
            })),
            label: "Sorting",
        });
        groups.push({
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
        });
    }

    return groups;
}

function buildSearchCommands({
    collections,
    collectionPreviewThumbnailUrlsById,
    clearLibraryPalette,
    draft,
    hasAnyRefinements,
    lastVisitedFilterEnabled,
    lastVisitedItemIds,
    navigationItems,
    onAssistantSubmit,
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
    navigationItems: ComposerCommand[];
    onAssistantSubmit: (prompt: string) => void | Promise<void>;
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
}): ComposerCommandGroup[] {
    const groups: ComposerCommandGroup[] = [];
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
        const shouldDefaultToAssistant = isMultiWordQuery(draft);
        const addSearchItem: ComposerCommand = {
            description: draftAlreadyIncluded
                ? "Already included in the search"
                : "Add this search term",
            disabled: draftAlreadyIncluded,
            isActive: draftAlreadyIncluded,
            label: `Search "${draft}"`,
            onSelect: () => {
                setSearchTerms((current) =>
                    appendUniqueSearchTerm(current, draft)
                );
                setQuery("");
                setIsComposerOpen(true);
            },
            shortcut: shouldDefaultToAssistant ? undefined : "Enter",
            value: `search ${draft}`,
        };
        const assistantItem: ComposerCommand = {
            description: "AI Search",
            label: `Ask Cache "${draft}"`,
            onSelect: () => onAssistantSubmit(draft),
            shortcut: shouldDefaultToAssistant ? "Enter" : "Tab",
            value: `ask cache ${draft}`,
        };

        groups.push({
            items: shouldDefaultToAssistant
                ? [assistantItem, addSearchItem]
                : [addSearchItem, assistantItem],
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
            const collectionItems: ComposerCommand[] = [];
            for (const collection of collections) {
                if (collectionItems.length >= 4) {
                    break;
                }
                const thumbnails =
                    collectionPreviewThumbnailUrlsById.get(collection.id) ?? [];
                if (thumbnails.length === 0) {
                    continue;
                }
                collectionItems.push({
                    children: (
                        <div className="flex aspect-4/3 size-full flex-1 flex-col">
                            {thumbnails.length > 0 && (
                                <ComposerCollectionCommandThumbnail
                                    urls={thumbnails}
                                />
                            )}
                            <span className="truncate p-1 font-medium">
                                {collection.name}
                            </span>
                        </div>
                    ),
                    isActive: selectedCollectionIds.includes(collection.id),
                    label: collection.name,
                    onSelect: applyCollectionFilter(() =>
                        onToggleCollectionSelection(collection.id)
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
                items: buildCollectionCommands({
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
                              children: (
                                  <div className="flex items-center gap-2.5">
                                      <History className="size-4 shrink-0 text-muted-foreground" />
                                      <span className="truncate">
                                          Pick up where you left off
                                      </span>
                                  </div>
                              ),
                              label: "Pick up where you left off",
                              onSelect: applyCollectionFilter(() =>
                                  setLastVisitedFilterEnabled(true)
                              ),
                              value: "filter last visited",
                          },
                      ]
                    : []),
                ...availableHistory.slice(0, 5).map((term) => ({
                    children: (
                        <div className="flex items-center gap-2.5">
                            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{term}</span>
                        </div>
                    ),
                    label: term,
                    onSelect: () => {
                        setSearchTerms((current) =>
                            appendUniqueSearchTerm(current, term)
                        );
                        setQuery("");
                        setIsComposerOpen(true);
                    },
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

function buildAssistantCommands({
    assistantResponse,
    backItem,
    draft,
    onAssistantSubmit,
}: {
    assistantResponse: AssistantResponseState | null;
    backItem: ComposerCommand;
    draft: string;
    onAssistantSubmit: (prompt: string) => void | Promise<void>;
}): ComposerCommandGroup[] {
    const items: ComposerCommand[] = [
        {
            children: <AssistantResponsePanel response={assistantResponse} />,
            label: "Ask Cache response",
            onSelect: () => undefined,
            value: "ask cache response",
        },
    ];

    if (draft) {
        items.unshift({
            label: `Ask Cache "${draft}"`,
            onSelect: () => onAssistantSubmit(draft),
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

function buildComposerStackEntries({
    agentViewTitle,
    collectionMembershipFilter,
    collections,
    columnCountMode,
    composerAttachments,
    domainFilters,
    duplicatesFilterEnabled,
    groupBy,
    lastVisitedFilterEnabled,
    onDismissAgentView,
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
}: BuildComposerStackEntriesInput): ComposerStackEntry[] {
    const entries: ComposerStackEntry[] = [];
    const collectionById = new Map(collections.map((c) => [c.id, c]));

    const pushChip = (key: string, label: string, onRemove: () => void) => {
        entries.push({ key, kind: "chip", label, onRemove });
    };

    if (agentViewTitle) {
        pushChip(
            "agent-view",
            `Agent: ${truncateLabel(agentViewTitle)}`,
            onDismissAgentView
        );
    }

    for (const collectionId of selectedCollectionIds) {
        const collection = collectionById.get(collectionId);
        if (collection) {
            pushChip(
                `collection-${collectionId}`,
                `Collection: ${truncateLabel(collection.name)}`,
                () => onRemoveCollectionFilter(collectionId)
            );
        }
    }

    for (const attachment of composerAttachments) {
        entries.push({
            attachment,
            key: `attachment-${attachment.id}`,
            kind: "attachment",
            onRemove: () => onRemoveComposerAttachment(attachment.id),
            onRemoveAttachment: onRemoveComposerAttachment,
        });
    }

    for (const term of searchTerms) {
        pushChip(`search-${term}`, `Search: ${truncateLabel(term)}`, () =>
            setSearchTerms((current) => removeValue(current, term))
        );
    }

    for (const source of sourceFilters) {
        pushChip(`source-${source}`, `Source: ${getSourceLabel(source)}`, () =>
            setSourceFilters((current) => removeValue(current, source))
        );
    }

    for (const domainFilter of domainFilters) {
        pushChip(
            `domain-${domainFilter}`,
            `Domain: ${truncateLabel(domainFilter)}`,
            () =>
                setDomainFilters((current) =>
                    removeValue(current, domainFilter)
                )
        );
    }

    if (collectionMembershipFilter !== DEFAULT_COLLECTION_MEMBERSHIP_FILTER) {
        pushChip(
            "collection-membership",
            `Collections: ${collectionMembershipFilterLabel(collectionMembershipFilter)}`,
            () =>
                setCollectionMembershipFilter(
                    DEFAULT_COLLECTION_MEMBERSHIP_FILTER
                )
        );
    }

    if (groupBy !== "none") {
        pushChip("group", `Group: ${groupByLabel(groupBy)}`, () =>
            setGroupBy("none")
        );
    }

    if (lastVisitedFilterEnabled) {
        pushChip("last-visited", "Last visited", () =>
            setLastVisitedFilterEnabled(false)
        );
    }

    if (duplicatesFilterEnabled) {
        pushChip("duplicates", "Duplicates", () =>
            setDuplicatesFilterEnabled(false)
        );
    }

    if (unreachableFilterEnabled) {
        pushChip("unreachable", "Unreachable", () =>
            setUnreachableFilterEnabled(false)
        );
    }

    if (sortMode !== DEFAULT_SORT_MODE) {
        pushChip("sort", `Sort: ${sortModeLabel(sortMode)}`, () =>
            setSortMode(DEFAULT_SORT_MODE)
        );
    }

    if (columnCountMode !== DEFAULT_COLUMN_COUNT_MODE) {
        pushChip(
            "columns",
            `Columns: ${columnCountLabel(columnCountMode)}`,
            () => setColumnCountMode(DEFAULT_COLUMN_COUNT_MODE)
        );
    }

    return entries;
}

interface ItemsListProps extends React.PropsWithChildren {
    connectedIntegrationCount: number;
    lockedItemCount: number;
    totalItemCount: number;
}

export function ItemsList({
    children,
    connectedIntegrationCount,
    lockedItemCount,
    totalItemCount,
}: ItemsListProps) {
    const { items, setItems } = useItemsStateContext();
    const { hasAccess } = useSubscriptionAccess();
    const isExtensionInstalled = useIsExtensionInstalled();
    const paletteCaretTimeout = useTimeout();

    const {
        collectionSummaries: collections,
        collections: allCollections,
        mergeCollectionSummaries,
        onClearCollectionFilters,
        onSelectCollection: onRemoveCollectionFilter,
        requestCreate,
        selectedCollectionIds,
        syncCollectionCreated,
    } = useCollectionsContext();
    const {
        collectionPreviewThumbnailUrlsById,
        favoriteItemIdSet,
        favoriteItems,
        itemsByCollectionId,
        itemsById,
    } = useItemIndexes(items);
    const hoverHotkeySurface = useHoverHotkeySurface();

    const {
        handleCreateCollectionFromResults,
        handleToggleItemFavorite,
        handleUpdateItemCollections,
        handleUpdateItemsCollections,
    } = useCollectionMutations({
        allCollections,
        itemsById,
        mergeCollectionSummaries,
        setItems,
        syncCollectionCreated,
    });

    const [query, setQuery] = React.useState("");
    const {
        collectionMembershipFilter,
        clearComposerFilters,
        columnCountMode,
        domainFilters,
        duplicatesFilterEnabled,
        groupBy,
        lastVisitedFilterEnabled,
        searchTerms,
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
    } = useComposerFilters();
    const { lastVisitedItemIds, markVisited } = useLastVisited();
    const { clearSearchHistory, recordSearchTerm, searchHistory } =
        useSearchHistory();
    const itemsRef = React.useRef(items);
    const [paletteSection, setPaletteSection] =
        React.useState<PaletteSection>("search");
    const [composerAttachments, setComposerAttachments] = React.useState<
        ComposerAttachment[]
    >([]);
    const [assistantResponse, setAssistantResponse] =
        React.useState<AssistantResponseState | null>(null);
    const [agentView, setAgentView] = React.useState<AgentViewPage | null>(
        null
    );

    const [openPickerItemId, setOpenPickerItemId] = React.useState<
        string | null
    >(null);
    const hoveredItemIdRef = React.useRef<string | null>(null);
    const hoverPinnedItemIdRef = React.useRef<string | null>(null);

    const [isCreateResultsDialogOpen, setIsCreateResultsDialogOpen] =
        React.useState(false);

    const inputRef = React.useRef<HTMLTextAreaElement>(null);
    const [isComposerOpen, setIsComposerOpen] = React.useState(false);
    const composerAttachmentsRef = React.useRef<ComposerAttachment[]>([]);
    const assistantRequestVersionRef = React.useRef(0);

    const {
        deleteErrorMessage,
        handleConfirmDelete,
        handleCopyLink,
        handleDeleteDialogOpenChange,
        handleOpenInNewTab,
        handleRequestDelete,
        pendingDeleteItem,
    } = useItemActions({
        onDeleteSuccess: mergeCollectionSummaries,
        setItems,
    });

    const pendingDeleteItemId = pendingDeleteItem?.id ?? null;

    React.useEffect(() => {
        itemsRef.current = items;
        composerAttachmentsRef.current = composerAttachments;
    });

    const unreachableProbe = useUnreachableItemProbe({
        isEnabled: unreachableFilterEnabled,
        itemsRef,
        setItems,
    });

    const prevSearchTermsRef = React.useRef<string[]>([]);
    React.useEffect(() => {
        const prev = prevSearchTermsRef.current;
        for (const term of searchTerms) {
            const isAlreadyTracked = prev.some(
                (prevTerm) => prevTerm.toLowerCase() === term.toLowerCase()
            );
            if (!isAlreadyTracked) {
                recordSearchTerm(term);
            }
        }
        prevSearchTermsRef.current = searchTerms;
    }, [searchTerms, recordSearchTerm]);

    const clearComposerAttachments = useStableCallback(() => {
        setComposerAttachments((current) => {
            for (const attachment of current) {
                revokeFileAttachmentObjectUrl(attachment.url);
            }
            return [];
        });
    });

    const clearLibraryPalette = useStableCallback(() => {
        setQuery("");
        clearComposerFilters();
        clearComposerAttachments();
        onClearCollectionFilters();
        setPaletteSection("search");
        setAgentView(null);
    });

    const duplicateItemIds = collectDuplicateBookmarkItemIds(items);

    const unreachableItemIds = (() => {
        const ids = new Set<string>();
        for (const item of items) {
            if (item.linkReachability === "unreachable") {
                ids.add(item.id);
            }
        }
        return ids;
    })();

    const domainOptions = buildDomainPaletteOptions(items);

    const activeLastVisitedItemIds = lastVisitedFilterEnabled
        ? lastVisitedItemIds
        : [];

    const filteredItems = filterItemsToAgentView(
        filterItems(items, {
            collectionMembershipFilter,
            domainFilters,
            duplicateItemIds,
            duplicatesFilterEnabled,
            lastVisitedItemIds: activeLastVisitedItemIds,
            searchTerms,
            selectedCollectionIds,
            sourceFilters,
            unreachableFilterEnabled,
            unreachableItemIds,
        }),
        agentView
    );

    // `groups` projects this list into sections and repeats items that belong to
    // several collections. Result counts and exports must read this list instead.
    const sortedItems = sortItems(filteredItems, sortMode);

    const buildAssistantRequest = useStableCallback(
        (prompt: string): AssistantRequest => ({
            composerState: {
                collectionMembershipFilter,
                columnCountMode,
                domainFilters,
                groupBy,
                searchTerms,
                selectedCollectionIds,
                sortMode,
                sourceFilters,
            },
            prompt,
            runtimeContext: {
                clientLocale: navigator.language,
                clientTimeZone:
                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                surface: "library_composer",
            },
            visibleContext: {
                availableCollections: collections
                    .slice(0, ASSISTANT_CONTEXT_COLLECTION_LIMIT)
                    .map((collection) => ({
                        id: collection.id,
                        itemCount: collection.itemCount,
                        name: collection.name,
                    })),
                availableDomains: domainOptions
                    .filter((option) => option.value !== ALL_DOMAIN_FILTER)
                    .slice(0, ASSISTANT_CONTEXT_DOMAIN_LIMIT)
                    .map((option) => ({
                        domain: option.value,
                        itemCount: option.itemCount,
                    })),
                filteredItemCount: filteredItems.length,
                totalItemCount,
                visibleItems: buildAssistantVisibleItems(sortedItems),
            },
        })
    );

    const applyAssistantPatch = useStableCallback(
        (patch: AssistantComposerPatch) => {
            if (patch.reset) {
                clearLibraryPalette();
            }

            if (patch.searchTerms) {
                setSearchTerms(patch.searchTerms);
            }
            if (patch.sourceFilters) {
                setSourceFilters(patch.sourceFilters);
            }
            if (patch.domainFilters) {
                setDomainFilters(patch.domainFilters);
            }
            if (patch.collectionMembershipFilter) {
                setCollectionMembershipFilter(patch.collectionMembershipFilter);
            }
            if (patch.groupBy) {
                setGroupBy(patch.groupBy);
            }
            if (patch.sortMode) {
                setSortMode(patch.sortMode);
            }
            if (patch.columnCountMode) {
                setColumnCountMode(patch.columnCountMode);
            }
            if (patch.selectedCollectionIds !== undefined) {
                onClearCollectionFilters();
                for (const collectionId of patch.selectedCollectionIds) {
                    onRemoveCollectionFilter(collectionId);
                }
            }
        }
    );

    const handleAssistantResult = useStableCallback(
        (prompt: string, result: AssistantResult) => {
            if (result.status !== ACTION_STATUS.SUCCESS) {
                setAssistantResponse({
                    message: result.message,
                    prompt,
                    status: "error",
                });
                return;
            }

            for (const operation of result.operations) {
                applyAssistantPatch(operation);
            }
            if (result.operations.some((operation) => operation.reset)) {
                setAgentView(null);
            }
            if (result.view) {
                setAgentView(result.view);
            }
            setPaletteSection("ai-response");
            setAssistantResponse({
                markdown: result.markdown,
                operationCount: result.operations.length,
                prompt,
                status: "success",
            });
        }
    );

    const handleAssistantSubmit = useStableCallback(
        async (rawPrompt: string) => {
            const prompt = rawPrompt.trim();
            if (prompt.length === 0) {
                return;
            }

            const requestVersion = assistantRequestVersionRef.current + 1;
            assistantRequestVersionRef.current = requestVersion;
            setAssistantResponse({ prompt, status: "loading" });
            setPaletteSection("ai-response");
            setQuery("");

            try {
                const result = await runAssistant(
                    buildAssistantRequest(prompt)
                );
                if (assistantRequestVersionRef.current !== requestVersion) {
                    return;
                }
                handleAssistantResult(prompt, result);
            } catch (error) {
                if (assistantRequestVersionRef.current !== requestVersion) {
                    return;
                }
                log.error("Failed to submit Ask Cache request", error);
                setAssistantResponse({
                    message: "Ask Cache is unavailable right now.",
                    prompt,
                    status: "error",
                });
                setPaletteSection("ai-response");
            }
        }
    );

    const isAssistantLoading = assistantResponse?.status === "loading";

    const handleCancelAssistant = useStableCallback(() => {
        assistantRequestVersionRef.current += 1;
        setAssistantResponse(null);
        setPaletteSection("search");
    });

    const returnToSearchSection = useStableCallback(() => {
        setPaletteSection("search");
        setQuery("");
    });

    const openPaletteSection = useStableCallback(
        (
            section: Exclude<PaletteSection, "search">,
            event: BaseUIEvent<React.MouseEvent> | KeyboardEvent
        ) => {
            event.preventDefault();
            setPaletteSection(section);
            setQuery("");
        }
    );

    const focusPaletteInput = useStableCallback((select = false) => {
        setIsComposerOpen(true);
        queueMicrotask(() => {
            if (select) {
                inputRef.current?.select();
            }
            inputRef.current?.focus();
        });
    });

    const placePaletteCaretAtEnd = useStableCallback((value: string) => {
        const length = value.length;
        const placeCaret = () => {
            inputRef.current?.setSelectionRange(length, length);
        };
        queueMicrotask(placeCaret);
        paletteCaretTimeout.start(0, placeCaret);
    });

    const commandGroups = buildComposerCommandGroups({
        assistantResponse,
        clearLibraryPalette,
        collectionMembershipFilter,
        collectionPreviewThumbnailUrlsById,
        collections,
        columnCountMode,
        domainFilters,
        domainOptions,
        duplicateItemCount: duplicateItemIds.size,
        duplicatesFilterEnabled,
        groupBy,
        lastVisitedFilterEnabled,
        lastVisitedItemIds,
        onAssistantSubmit: handleAssistantSubmit,
        onClearCollectionFilters,
        onClearSearchHistory: clearSearchHistory,
        onToggleCollectionSelection: onRemoveCollectionFilter,
        openPaletteSection,
        paletteSection,
        query,
        returnToSearchSection,
        searchHistory,
        searchTerms,
        selectedCollectionIds,
        setCollectionMembershipFilter,
        setColumnCountMode,
        setDomainFilters,
        setDuplicatesFilterEnabled,
        setGroupBy,
        setIsComposerOpen,
        setLastVisitedFilterEnabled,
        setQuery,
        setSearchTerms,
        setSortMode,
        setSourceFilters,
        setUnreachableFilterEnabled,
        sortMode,
        sourceFilters,
        unreachableFilterEnabled,
    });

    const visibleCommandGroups = useVisibleCommands({
        groups: commandGroups,
        query,
    });

    const removableDuplicateIds = buildRemovableDuplicateItemIds({
        allItems: items,
        duplicatesFilterEnabled,
        filteredItems,
    });
    const {
        count: pendingRemoveDuplicateCount,
        isOpen: isRemoveDuplicatesDialogOpen,
        isRemoving: isRemovingDuplicates,
        onConfirm: handleConfirmRemoveDuplicates,
        onOpenChange: handleRemoveDuplicatesDialogOpenChange,
        onRequestRemoval: handleRequestRemoveDuplicates,
    } = useDuplicateRemoval({
        mergeCollectionSummaries,
        removableItemIds: removableDuplicateIds,
        setDuplicatesFilterEnabled,
        setItems,
    });

    const effectiveGroupBy: EffectiveGroupByMode = duplicatesFilterEnabled
        ? "canonical-url"
        : groupBy;

    const groups = buildItemsGroups(
        sortedItems,
        effectiveGroupBy,
        sortMode,
        collections
    );

    const hasActiveFilters = hasActiveComposerFilters({
        collectionMembershipFilter,
        domainFilters,
        duplicatesFilterEnabled,
        lastVisitedFilterEnabled: activeLastVisitedItemIds.length > 0,
        searchTerms,
        selectedCollectionIds,
        sourceFilters,
        unreachableFilterEnabled,
    });

    const hasNonDefaultView =
        groupBy !== "none" ||
        sortMode !== DEFAULT_SORT_MODE ||
        columnCountMode !== DEFAULT_COLUMN_COUNT_MODE ||
        sourceFilters.length > 0;

    const shouldShowEmptyLibraryPeek =
        items.length === 0 && filteredItems.length === 0 && !hasActiveFilters;

    const isUnreachableProbePending =
        unreachableFilterEnabled && unreachableProbe.isActive;

    const shouldShowNoFilteredResults =
        filteredItems.length === 0 &&
        !shouldShowEmptyLibraryPeek &&
        !isUnreachableProbePending;

    const {
        collapseAllSections,
        collapsedSectionKeys,
        enableSectionCollapse,
        expandAllSections,
        toggleSection,
    } = useItemsGroupCollapse({
        groupBy: effectiveGroupBy,
        groups,
        hasActiveFilters,
        shouldShowEmptyLibraryPeek,
        shouldShowNoFilteredResults,
    });

    const resolvedColumnCount =
        columnCountMode === "auto" ? undefined : Number(columnCountMode);

    const isPreviewOnly = !hasAccess && lockedItemCount > 0;

    let resultsSummary = `${filteredItems.length} of ${totalItemCount} items`;
    if (filteredItems.length === items.length) {
        resultsSummary = `${totalItemCount} item${totalItemCount === 1 ? "" : "s"}`;
    }
    if (isPreviewOnly) {
        resultsSummary =
            filteredItems.length === items.length
                ? `${items.length} item${items.length === 1 ? "" : "s"} of ${totalItemCount}`
                : `${filteredItems.length} result${filteredItems.length === 1 ? "" : "s"} from ${items.length} visible`;
    }

    if (
        unreachableFilterEnabled &&
        (unreachableProbe.total > 0 || unreachableProbe.probeFailed)
    ) {
        const remaining = unreachableProbe.total - unreachableProbe.checked;
        let progressLabel: string;
        if (unreachableProbe.probeFailed) {
            progressLabel = "Couldn't check links right now";
        } else if (unreachableProbe.isActive) {
            progressLabel = `Checking links ${unreachableProbe.checked}/${unreachableProbe.total}`;
        } else {
            progressLabel = `Checked ${unreachableProbe.checked} link${unreachableProbe.checked === 1 ? "" : "s"}`;
        }
        if (unreachableProbe.isActive && remaining > 0) {
            const minutesLeft = Math.max(1, Math.ceil(remaining / 100));
            progressLabel = `${progressLabel} · ~${minutesLeft} min left`;
        }
        resultsSummary = `${resultsSummary} · ${progressLabel}`;
    }

    const resolvedAgentViewItems = resolveAgentViewDisplayItems(
        items,
        agentView
    );
    const agentViewMissingCount = countAgentViewMissingIds(
        agentView,
        resolvedAgentViewItems
    );

    const handleAppendAgentViewPage = useStableCallback(
        (
            page: Pick<
                AgentViewPage,
                "itemIds" | "nextOffset" | "query" | "truncated"
            >
        ) => {
            setAgentView((current) => appendAgentViewPage(current, page));
        }
    );

    const shouldShowLockedPreview =
        isPreviewOnly && !hasActiveFilters && effectiveGroupBy === "none";

    const canClear =
        (hasActiveFilters || hasNonDefaultView) && !shouldShowEmptyLibraryPeek;

    const suggestions = buildComposerSuggestions({
        clearLibraryPalette,
        collectionMembershipFilter,
        collections,
        domainFilters,
        effectiveGroupBy,
        groupBy,
        hasAnyRefinements: hasActiveFilters || hasNonDefaultView,
        isEmpty: filteredItems.length === 0,
        isExtensionInstalled,
        items: filteredItems,
        onClearCollectionFilters,
        onCreateCollection: requestCreate,
        onToggleCollectionSelection: onRemoveCollectionFilter,
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
        sortMode,
        sourceFilters,
    });

    const [isSuggestionsOpen, setIsSuggestionsOpen] = React.useState(true);

    const suggestionKey = suggestions
        .map((suggestion) => suggestion.id)
        .join("\0");

    const prevSuggestionKeyRef = React.useRef(suggestionKey);
    React.useEffect(() => {
        // Resurface the row when a new suggestion set arrives.
        // Dismissal persists while the set stays identical.
        if (
            prevSuggestionKeyRef.current !== suggestionKey &&
            suggestionKey !== ""
        ) {
            setIsSuggestionsOpen(true);
        }
        prevSuggestionKeyRef.current = suggestionKey;
    }, [suggestionKey]);

    const handleComposerOpenChange = useStableCallback(
        (
            nextOpen: boolean,
            eventDetails: AutocompleteRootChangeEventDetails
        ) => {
            if (!nextOpen) {
                const { reason } = eventDetails;

                if (reason === COMBOBOX_ITEM_PRESS_REASON) {
                    eventDetails.cancel();
                    return;
                }

                if (
                    reason === COMBOBOX_ESCAPE_KEY_REASON &&
                    paletteSection !== "search"
                ) {
                    eventDetails.cancel();
                }

                if (query.trim() === "") {
                    returnToSearchSection();
                }
                if (eventDetails.isCanceled) {
                    return;
                }
            }
            setIsComposerOpen(nextOpen);
        }
    );

    const handleGlobalWindowKeyDown = useStableCallback(
        (event: KeyboardEvent) => {
            const target = getTarget(event);
            const isTextEntry = isTextEntryTarget(target);

            if (isSearchHotkey(event)) {
                event.preventDefault();
                focusPaletteInput(true);
                return;
            }

            if (
                event.key === "/" &&
                !event.metaKey &&
                !event.ctrlKey &&
                !event.altKey &&
                !isTextEntry
            ) {
                event.preventDefault();
                focusPaletteInput();
                return;
            }

            if (
                !(event.shiftKey || event.altKey) &&
                (event.metaKey || event.ctrlKey)
            ) {
                const index = Number.parseInt(event.key, 10) - 1;
                if (
                    index >= 0 &&
                    index <= suggestions.length &&
                    isSuggestionsOpen
                ) {
                    if (index < suggestions.length) {
                        const suggestion = suggestions[index];
                        if (suggestion) {
                            event.preventDefault();
                            suggestion.onSelect();
                            return;
                        }
                    }
                    if (index === suggestions.length) {
                        event.preventDefault();
                        setIsSuggestionsOpen(false);
                        return;
                    }
                }
            }

            if (
                event.defaultPrevented ||
                isTextEntry ||
                !isPrintablePaletteKey(event)
            ) {
                return;
            }

            if (event.key.toLowerCase() === "s") {
                if (hoverHotkeySurface.isClaimed()) {
                    return;
                }
                const id = hoveredItemIdRef.current;
                if (id) {
                    event.preventDefault();
                    setOpenPickerItemId(id);
                }
                return;
            }

            event.preventDefault();
            setQuery(event.key);
            focusPaletteInput();
            placePaletteCaretAtEnd(event.key);
        }
    );

    useHotkeys(
        "*",
        handleGlobalWindowKeyDown,
        { description: "Open composer" },
        [focusPaletteInput]
    );

    const handleComposerInputChange = useStableCallback(
        (next: string, eventDetails: AutocompleteRootChangeEventDetails) => {
            // Base UI fills the input with the pressed item's raw value, such as
            // "sort title". Keep that internal token out of the user's query.
            if (eventDetails.reason === COMBOBOX_ITEM_PRESS_REASON) {
                eventDetails.cancel();
                return;
            }
            setQuery(next);
        }
    );

    const removeComposerAttachment = useStableCallback((id: string) => {
        setComposerAttachments((current) => {
            const nextAttachments: ComposerAttachment[] = [];
            for (const attachment of current) {
                if (attachment.id === id) {
                    revokeFileAttachmentObjectUrl(attachment.url);
                    continue;
                }
                nextAttachments.push(attachment);
            }
            return nextAttachments;
        });
    });

    const handleDismissAgentView = useStableCallback(() => {
        setAgentView(null);
    });

    const stackEntries = buildComposerStackEntries({
        agentViewTitle: agentView?.title ?? null,
        collectionMembershipFilter,
        collections,
        columnCountMode,
        composerAttachments,
        domainFilters,
        duplicatesFilterEnabled,
        groupBy,
        lastVisitedFilterEnabled,
        onDismissAgentView: handleDismissAgentView,
        onRemoveCollectionFilter,
        onRemoveComposerAttachment: removeComposerAttachment,
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
    });

    const handlePaletteInputKeyDown = useStableCallback(
        (event: BaseUIEvent<React.KeyboardEvent<HTMLInputElement>>) => {
            if (
                event.key === "Escape" ||
                (event.key === "Tab" && !event.shiftKey && query.trim() !== "")
            ) {
                event.preventDefault();
                event.stopPropagation();
                if (event.key === "Escape") {
                    if (query.trim() !== "") {
                        setQuery("");
                        focusPaletteInput(true);
                        return;
                    }
                    if (paletteSection !== "search") {
                        returnToSearchSection();
                        return;
                    }

                    event.currentTarget.blur();
                    return;
                }
                handleAssistantSubmit(query).catch((error) => {
                    log.error("Failed to handle Ask Cache shortcut", error);
                });
                return;
            }

            if (event.key === "Backspace" && query.trim() === "") {
                event.preventDefault();
                if (paletteSection !== "search") {
                    returnToSearchSection();
                    return;
                }
                removeLastPaletteStackEntry(stackEntries);
            }

            // The multiline input never submits the form on its own. With the
            // popup closed no item can be highlighted, so Enter submits the
            // draft; while open, Base UI owns Enter for item selection.
            if (!isComposerOpen && isSubmitKey(event)) {
                event.preventDefault();
                event.stopPropagation();
                if (isAssistantLoading) {
                    return;
                }
                handleAssistantSubmit(query).catch((error) => {
                    log.error("Failed to submit palette query", error);
                });
            }
        }
    );

    const handleCreateNote = useStableCallback(() => {
        openSideNote(null);
    });

    const handleOpenComposerFromOnboarding = useStableCallback(() => {
        setPaletteSection("search");
        focusPaletteInput(true);
    });

    const handleExportSectionResults = useStableCallback(
        async (
            sectionTitle: string,
            sectionItems: LibraryItemWithCollections[]
        ) => {
            if (sectionItems.length === 0) {
                log.warn("Skipped empty browser section export", {
                    sectionTitle,
                });
                return;
            }

            try {
                await saveFile(
                    new Blob(
                        [buildItemsCsv("Section", sectionTitle, sectionItems)],
                        { type: MIME_TYPES.csv }
                    ),
                    {
                        description: "CSV file",
                        extension: "csv",
                        name: getItemsGroupExportFileName(sectionTitle),
                    }
                );
            } catch (error) {
                log.error("Failed to export browser section results", error, {
                    itemCount: sectionItems.length,
                    sectionTitle,
                });
            }
        }
    );

    const handleOpenNote = useStableCallback(
        (item: LibraryItemWithCollections) => {
            openSideNote(item);
        }
    );

    const handleOpenFavoriteItem = useStableCallback(
        (item: LibraryItemWithCollections) => {
            if (item.kind === ITEM_KIND_NOTE) {
                openSideNote(item);
                return;
            }
            handleOpenInNewTab(item);
        }
    );

    const handleItemFavoriteToggle = useStableCallback(
        (item: LibraryItemWithCollections) => {
            handleToggleItemFavorite(item).catch((error) => {
                log.error("Failed to toggle item favorite", {
                    error,
                    itemId: item.id,
                });
            });
        }
    );

    useItemHoverHotkeys({
        hoveredItemIdRef,
        hoverHotkeySurface,
        itemsById,
        onDelete: handleRequestDelete,
        onItemFavoriteToggle: handleItemFavoriteToggle,
        pendingDeleteItemId,
    });

    const handleFindSimilar = useStableCallback(
        (item: LibraryItemWithCollections) => {
            const similarDomain = getLibraryItemDomain(item.url);
            const nextFilters = buildSimilarItemFilterState(
                {
                    collectionMembershipFilter,
                    domainFilters,
                    searchTerms,
                    selectedCollectionIds,
                    sourceFilters,
                },
                { domain: similarDomain, source: item.source }
            );

            setQuery("");
            setPaletteSection("search");
            setSearchTerms(nextFilters.searchTerms);
            setSourceFilters(nextFilters.sourceFilters);
            setDomainFilters(nextFilters.domainFilters);
            setCollectionMembershipFilter(
                nextFilters.collectionMembershipFilter
            );
            onClearCollectionFilters();
        }
    );

    const handleSaveNote = useStableCallback(
        async (draft: NoteDraft, noteId: string | null) => {
            const result = await saveLibraryNoteDraft({
                activeNoteId: noteId,
                draft,
            });

            if (result.status !== ACTION_STATUS.SUCCESS) {
                return null;
            }

            setItems((current) => mergeById(current, [result.item]));
            return result.item;
        }
    );

    const handlePasteUrlIntoLibrary = useStableCallback(async (url: string) => {
        const result = await createLibraryBookmarkFromPastedUrl({ url });

        if (result.status !== ACTION_STATUS.SUCCESS) {
            return;
        }

        setItems((current) => mergeById(current, [result.item]));
    });

    React.useEffect(
        () => () => {
            for (const attachment of composerAttachmentsRef.current) {
                revokeFileAttachmentObjectUrl(attachment.url);
            }
        },
        []
    );

    const placeholder =
        PALETTE_PLACEHOLDER_BY_SECTION[paletteSection] ?? "Ask anything";

    const handleOpenCreateResultsDialog = useStableCallback(() =>
        setIsCreateResultsDialogOpen(true)
    );

    const mergeImportedLibraryItems = useStableCallback(
        (imported: LibraryItemWithCollections[]) => {
            setItems((current) => mergeById(current, imported));
        }
    );

    const itemsContextValue: ItemsContext = {
        collectionPreviewThumbnailUrlsById,
        favoriteItemIdSet,
        favoriteItems,
        itemsByCollectionId,
        mergeImportedItems: mergeImportedLibraryItems,
        onCopyLink: handleCopyLink,
        onDelete: handleRequestDelete,
        onFindSimilar: handleFindSimilar,
        onItemFavoriteToggle: handleToggleItemFavorite,
        onOpenFavoriteItem: handleOpenFavoriteItem,
        onOpenInNewTab: handleOpenInNewTab,
        onOpenNote: handleOpenNote,
        onUpdateItemCollections: handleUpdateItemCollections,
        pendingDeleteItemId: pendingDeleteItem?.id ?? null,
    };

    const itemsListContextValue: ItemsListContext = {
        clearLibraryPalette,
        collapsedSectionKeys,
        collections,
        columnCount: resolvedColumnCount,
        enableSectionCollapse,
        hoveredItemIdRef,
        hoverPinnedItemIdRef,
        markVisited,
        onCollapseAllSections: collapseAllSections,
        onCreateCollectionFromResults: handleOpenCreateResultsDialog,
        onExpandAllSections: expandAllSections,
        onExportSectionResults: handleExportSectionResults,
        onToggleSection: toggleSection,
        openPickerItemId,
        setOpenPickerItemId,
        shouldShowEmptyLibraryPeek,
        shouldShowLockedPreview,
        shouldShowNoFilteredResults,
        shouldShowUnreachableProbePending:
            isUnreachableProbePending && filteredItems.length === 0,
    };

    return (
        <ItemsContext value={itemsContextValue}>
            <SideRoot
                onSaveNote={handleSaveNote}
                onUrlPaste={handlePasteUrlIntoLibrary}
            >
                <ItemsListContext value={itemsListContextValue}>
                    {children}
                    <div className="z-0 flex min-h-0 w-full min-w-0 flex-1 items-stretch">
                        <div
                            className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 p-8"
                            style={
                                {
                                    "--library-section-sticky-top": "108px",
                                } as React.CSSProperties
                            }
                        >
                            <Composer
                                isBusy={isAssistantLoading}
                                onStop={handleCancelAssistant}
                                onSubmit={handleAssistantSubmit}
                                onValueChange={setQuery}
                                value={query}
                            >
                                <Palette>
                                    <Toolbar.Input
                                        render={
                                            <ComposerInput
                                                endAddon={
                                                    <PaletteInputEndAddon
                                                        stackEntries={
                                                            stackEntries
                                                        }
                                                    />
                                                }
                                                filteredItems={
                                                    visibleCommandGroups
                                                }
                                                items={commandGroups}
                                                onKeyDown={
                                                    handlePaletteInputKeyDown
                                                }
                                                onOpenChange={
                                                    handleComposerOpenChange
                                                }
                                                onValueChange={
                                                    handleComposerInputChange
                                                }
                                                open={isComposerOpen}
                                                render={
                                                    <Textarea
                                                        aria-label={placeholder}
                                                        className="block w-full pe-8 text-base sm:text-sm"
                                                        isUnstyled
                                                        placeholder={
                                                            placeholder
                                                        }
                                                        ref={inputRef}
                                                        style={{
                                                            minHeight: "2.5rem",
                                                        }}
                                                    />
                                                }
                                                submitOnEnter={false}
                                            >
                                                <CommandPopup sideOffset={40}>
                                                    <CommandEmpty>
                                                        <T>
                                                            No matching commands
                                                        </T>
                                                    </CommandEmpty>
                                                    <CommandList className="max-w-2xl">
                                                        {(
                                                            group: ComposerCommandGroup,
                                                            index: number
                                                        ) => (
                                                            <CommandGroup
                                                                items={
                                                                    group.items
                                                                }
                                                                key={
                                                                    group.label ??
                                                                    `composer-group-${index}`
                                                                }
                                                            >
                                                                {group.label ? (
                                                                    <CommandGroupLabel>
                                                                        {
                                                                            group.label
                                                                        }
                                                                    </CommandGroupLabel>
                                                                ) : null}
                                                                {group.layout ===
                                                                "horizontal" ? (
                                                                    <CommandRow className="grid grid-cols-2 gap-2 pt-1 pr-2 pb-4 md:grid-cols-3 lg:grid-cols-4">
                                                                        <CommandCollection>
                                                                            {(
                                                                                item: ComposerCommand
                                                                            ) => (
                                                                                <ComposerCollectionCommandCard
                                                                                    item={
                                                                                        item
                                                                                    }
                                                                                    key={
                                                                                        item.value
                                                                                    }
                                                                                />
                                                                            )}
                                                                        </CommandCollection>
                                                                    </CommandRow>
                                                                ) : (
                                                                    <CommandCollection>
                                                                        {(
                                                                            item: ComposerCommand
                                                                        ) => (
                                                                            <ComposerCommandRow
                                                                                item={
                                                                                    item
                                                                                }
                                                                                key={
                                                                                    item.value
                                                                                }
                                                                            />
                                                                        )}
                                                                    </CommandCollection>
                                                                )}
                                                            </CommandGroup>
                                                        )}
                                                    </CommandList>
                                                </CommandPopup>
                                                <PaletteActionsList
                                                    duplicatesFilterEnabled={
                                                        duplicatesFilterEnabled
                                                    }
                                                    onCreateNote={
                                                        handleCreateNote
                                                    }
                                                    onRemoveDuplicates={
                                                        handleRequestRemoveDuplicates
                                                    }
                                                    removableDuplicateCount={
                                                        removableDuplicateIds.length
                                                    }
                                                >
                                                    <PaletteActionNew />
                                                    <Summary>
                                                        <SummaryTrigger
                                                            hasActiveFilters={
                                                                canClear
                                                            }
                                                            render={
                                                                <PaletteActionButton />
                                                            }
                                                            resultsSummary={
                                                                resultsSummary
                                                            }
                                                            sectionCount={
                                                                groups.length
                                                            }
                                                            showSectionCount={
                                                                effectiveGroupBy !==
                                                                "none"
                                                            }
                                                        />
                                                        <SummaryPopup
                                                            metrics={buildComposerMetrics(
                                                                {
                                                                    getSourceLabel,
                                                                    items: filteredItems,
                                                                }
                                                            )}
                                                            onClearFilters={
                                                                canClear
                                                                    ? clearLibraryPalette
                                                                    : undefined
                                                            }
                                                        />
                                                    </Summary>
                                                    <OnboardingMenu
                                                        connectedIntegrationCount={
                                                            connectedIntegrationCount
                                                        }
                                                        onCreateCollection={
                                                            requestCreate
                                                        }
                                                        onCreateNote={
                                                            handleCreateNote
                                                        }
                                                        onOpenComposer={
                                                            handleOpenComposerFromOnboarding
                                                        }
                                                        render={
                                                            <PaletteActionButton />
                                                        }
                                                    />
                                                    <PaletteActionRemoveDuplicates />
                                                </PaletteActionsList>
                                            </ComposerInput>
                                        }
                                    />
                                </Palette>
                            </Composer>
                            <PaletteSuggestionsList
                                isOpen={isSuggestionsOpen}
                                onOpenChange={setIsSuggestionsOpen}
                                suggestions={suggestions}
                            >
                                {(suggestion, index) => (
                                    <PaletteSuggestionsListButton
                                        index={index}
                                        suggestion={suggestion}
                                    />
                                )}
                            </PaletteSuggestionsList>
                            {isPreviewOnly ? <InlinePaywallBanner /> : null}
                            <AgentViewBar
                                key={
                                    agentView
                                        ? getAgentViewKey(agentView)
                                        : "no-view"
                                }
                                missingCount={agentViewMissingCount}
                                onAppendPage={handleAppendAgentViewPage}
                                resolvedCount={resolvedAgentViewItems.length}
                                view={agentView}
                            />
                            <ItemsListEmpty />
                            <ItemsListEmptyWithFilters />
                            <ItemsListLinkCheckPending />
                            <ItemsGroupList groups={groups}>
                                {(group) => (
                                    <ItemsGroup>
                                        {enableSectionCollapse ? (
                                            <>
                                                <ItemsGroupResults />
                                                {group.title ? null : (
                                                    <ItemsGroupOverview>
                                                        <ItemsGroupOverviewContent />
                                                    </ItemsGroupOverview>
                                                )}
                                                <ItemsGroupEmpty>
                                                    No items were found in this
                                                    section.
                                                </ItemsGroupEmpty>
                                            </>
                                        ) : null}
                                        <ItemsMasonry>
                                            {(item) => (
                                                <MasonryItem key={item.id}>
                                                    <ItemCardProvider
                                                        value={item}
                                                    >
                                                        <ItemCardZoomProvider>
                                                            <ItemCardDownloadProvider>
                                                                <ItemCardSurface>
                                                                    <ItemCardTarget />
                                                                    <ItemCardFooter />
                                                                </ItemCardSurface>
                                                            </ItemCardDownloadProvider>
                                                        </ItemCardZoomProvider>
                                                    </ItemCardProvider>
                                                </MasonryItem>
                                            )}
                                        </ItemsMasonry>
                                    </ItemsGroup>
                                )}
                            </ItemsGroupList>
                            <ItemsListLocked
                                length={totalItemCount}
                                lockedItemCount={lockedItemCount}
                            />
                        </div>
                        <SideContent />
                    </div>
                    <DeleteItemDialog
                        deleteErrorMessage={deleteErrorMessage}
                        onConfirmDelete={handleConfirmDelete}
                        onOpenChange={handleDeleteDialogOpenChange}
                        open={pendingDeleteItem !== null}
                        pendingDeleteItem={pendingDeleteItem}
                    />
                    <RemoveDuplicatesDialog
                        count={pendingRemoveDuplicateCount}
                        isRemoving={isRemovingDuplicates}
                        onConfirm={handleConfirmRemoveDuplicates}
                        onOpenChange={handleRemoveDuplicatesDialogOpenChange}
                        open={isRemoveDuplicatesDialogOpen}
                    />
                    <CreateFromResultsCollectionDialog
                        initialName={getAgentViewCollectionDialogName(
                            agentView,
                            searchTerms
                        )}
                        onCreateCollection={handleCreateCollectionFromResults}
                        onOpenChange={setIsCreateResultsDialogOpen}
                        onUpdateItemsCollections={handleUpdateItemsCollections}
                        open={isCreateResultsDialogOpen}
                        resultItems={sortedItems}
                    />
                    <SuccessfulUpgradeDialog />
                </ItemsListContext>
            </SideRoot>
        </ItemsContext>
    );
}

function ItemsListEmpty() {
    const { shouldShowEmptyLibraryPeek } = useItemsListContext();

    if (!shouldShowEmptyLibraryPeek) {
        return null;
    }

    return (
        <>
            <ItemsGroupHeader>
                <h3 className="font-medium text-foreground text-sm">
                    <GradientWaveText
                        ariaLabel="Welcome to your Cache"
                        className="inline"
                    >
                        <T>Welcome to your Cache</T>
                    </GradientWaveText>
                    <span className="ml-3 opacity-50">
                        <T>Ready to start?</T>
                    </span>
                </h3>
                <p className="text-muted-foreground text-xs leading-tight">
                    <T>
                        Cache is for every topic you care about. A purpose-built
                        home for everything you save. Search it by asking,
                        brainstorm against it, draft and research with
                        everything you’ve saved already in context. The more you
                        add, the smarter it gets.
                    </T>
                </p>
            </ItemsGroupHeader>
            <MasonryRoot
                gap={16}
                items={EMPTY_PEEK_PLACEHOLDERS}
                maxColumnCount={7}
            >
                {(placeholder, index) => (
                    <MasonryItem key={placeholder.id}>
                        <ItemCardSkeleton data={placeholder} index={index} />
                    </MasonryItem>
                )}
            </MasonryRoot>
        </>
    );
}

function ItemsListEmptyWithFilters() {
    const { shouldShowNoFilteredResults, clearLibraryPalette } =
        useItemsListContext();

    if (!shouldShowNoFilteredResults) {
        return null;
    }

    return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/70 border-dashed bg-card/30 px-6 py-14 text-center">
            <p className="max-w-md text-balance text-muted-foreground text-sm leading-snug">
                No saved items match the current search and filters.
            </p>
            <Button onClick={clearLibraryPalette} size="sm" variant="outline">
                Reset filters
            </Button>
        </div>
    );
}

function buildLockedPeekPlaceholders(
    lockedItemCount: number
): ItemPeekPlaceholder[] {
    const length = Math.min(
        Math.max(0, Math.floor(lockedItemCount)),
        LOCKED_PEEK_PLACEHOLDERS_MAX
    );
    return Array.from({ length }, (_, index) => ({
        aspect: LOCKED_PEEK_ASPECT_CYCLE[
            index % LOCKED_PEEK_ASPECT_CYCLE.length
        ],
        id: `locked-library-peek-${index}`,
    }));
}

interface ItemsListLockedProps {
    length: number;
    lockedItemCount: number;
}

function ItemsListLocked({ length, lockedItemCount }: ItemsListLockedProps) {
    const { columnCount, shouldShowLockedPreview } = useItemsListContext();

    const placeholders = buildLockedPeekPlaceholders(lockedItemCount);

    if (!shouldShowLockedPreview) {
        return null;
    }

    return (
        <div className="flex flex-col gap-8">
            <BlockPaywallBanner length={length} />
            <MasonryRoot
                columnCount={columnCount}
                gap={16}
                items={placeholders}
                maxColumnCount={7}
            >
                {(placeholder, index) => (
                    <MasonryItem key={placeholder.id}>
                        <ItemCardSkeleton data={placeholder} index={index} />
                    </MasonryItem>
                )}
            </MasonryRoot>
        </div>
    );
}

function ItemsListLinkCheckPending() {
    const { shouldShowUnreachableProbePending } = useItemsListContext();

    if (!shouldShowUnreachableProbePending) {
        return null;
    }

    return (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/70 border-dashed bg-card/30 px-6 py-14 text-center">
            <Spinner className="size-5 text-muted-foreground" />
            <p className="max-w-md text-balance text-muted-foreground text-sm leading-snug">
                Checking which links fail to load…
            </p>
        </div>
    );
}

interface AgentViewBarProps {
    missingCount: number;
    onAppendPage: (
        page: Pick<
            AgentViewPage,
            "itemIds" | "nextOffset" | "query" | "truncated"
        >
    ) => void;
    resolvedCount: number;
    view: AgentViewPage | null;
}

function AgentViewBar({
    missingCount,
    onAppendPage,
    resolvedCount,
    view,
}: AgentViewBarProps) {
    const [loadMoreError, setLoadMoreError] = React.useState<string | null>(
        null
    );
    const [isLoadingMore, startLoadingMore] = React.useTransition();

    const handleLoadMore = useStableCallback(() => {
        if (!view || view.nextOffset === null || isLoadingMore) {
            return;
        }
        const query = view.query;
        const offset = view.nextOffset;
        setLoadMoreError(null);
        startLoadingMore(async () => {
            const result = await getAgentViewPage({ offset, query });
            if (result.status !== "SUCCESS") {
                setLoadMoreError(result.message);
                return;
            }
            onAppendPage({
                itemIds: result.itemIds,
                nextOffset: result.nextOffset,
                query,
                truncated: result.truncated,
            });
        });
    });

    if (!view) {
        return null;
    }

    const canLoadMore = view.nextOffset !== null;

    const partialNotes: string[] = [];
    if (view.truncated) {
        partialNotes.push("partial results");
    }
    if (missingCount > 0) {
        partialNotes.push(
            `${missingCount} match${missingCount === 1 ? "" : "es"} outside the loaded preview`
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-primary/25 bg-primary/3 px-3 py-2">
            <p className="min-w-0 flex-1 truncate text-xs">
                <span className="font-medium text-foreground">
                    {view.title}
                </span>
                <span className="text-muted-foreground">
                    {" — "}
                    {view.explanation}
                </span>
            </p>
            <p className="shrink-0 text-muted-foreground text-xs tabular-nums">
                {resolvedCount} match{resolvedCount === 1 ? "" : "es"}
                {partialNotes.length > 0
                    ? ` · ${partialNotes.join(" · ")}`
                    : ""}
            </p>
            {canLoadMore ? (
                <Button
                    isLoading={isLoadingMore}
                    onClick={handleLoadMore}
                    size="xs"
                    variant="outline"
                >
                    Load more
                </Button>
            ) : null}
            {loadMoreError ? (
                <p className="w-full text-destructive text-xs">
                    {loadMoreError}
                </p>
            ) : null}
        </div>
    );
}

function ItemsGroupList({
    groups,
    children,
}: {
    groups: ItemsGroup[];
    children: (section: ItemsGroup) => React.ReactNode;
}) {
    return groups.map((group) => (
        <ItemsGroupProvider key={group.key} section={group}>
            {children(group)}
        </ItemsGroupProvider>
    ));
}

function ItemsGroupProvider({
    children,
    section,
}: React.PropsWithChildren<{ section: ItemsGroup }>) {
    const { collapsedSectionKeys, onToggleSection } = useItemsListContext();

    return (
        <ItemsGroupContext
            value={{
                accentKey: section.key,
                collapsed: collapsedSectionKeys.has(section.key),
                isMainResults: section.title === null,
                items: section.items,
                onToggle: () => onToggleSection(section.key),
                title: section.title ?? "Results",
            }}
        >
            {children}
        </ItemsGroupContext>
    );
}

function ItemsGroup({ className, ...props }: React.ComponentProps<"section">) {
    return (
        <section
            {...props}
            className={cn(
                "flex w-full flex-col gap-4 contain-layout contain-style",
                className
            )}
        />
    );
}

function ItemsGroupHeader({
    className,
    ...props
}: React.ComponentProps<"div">) {
    return (
        <div
            {...props}
            className={cn(
                "mx-4 flex w-full flex-1 flex-col gap-1 p-1",
                className
            )}
        />
    );
}

interface ItemsGroupSourceIconsProps {
    items: LibraryItemWithCollections[];
}

function ItemsGroupSourceIcons({ items }: ItemsGroupSourceIconsProps) {
    const seenSources = new Set<LibraryItemSource>();
    for (const item of items) {
        seenSources.add(item.source);
    }

    const entries: {
        label: string;
        SourceIcon: NonNullable<ReturnType<typeof getSourceIcon>>;
        source: LibraryItemSource;
    }[] = [];
    for (const source of seenSources) {
        const SourceIcon = getSourceIcon(source);
        if (SourceIcon) {
            entries.push({ label: getSourceLabel(source), SourceIcon, source });
        }
    }

    return (
        <CollapsibleListHorizontal
            badgeRender={
                <Button className="opacity-50" size="xs" variant="link" />
            }
            className="ml-2.5 gap-1.5"
        >
            {entries.map(({ SourceIcon, label, source }) => (
                <span
                    aria-label={label}
                    className="inline-flex items-center"
                    key={source}
                    role="img"
                >
                    <SourceIcon aria-hidden className="size-3" />
                </span>
            ))}
        </CollapsibleListHorizontal>
    );
}

function ItemsGroupResults() {
    const group = useItemsGroupContext();
    const {
        enableSectionCollapse,
        onCreateCollectionFromResults,
        onExportSectionResults,
        onExpandAllSections,
        onCollapseAllSections,
    } = useItemsListContext();

    const hasItems = group.items.length > 0;
    const canCreateCollectionFromResults = group.isMainResults;

    const handleExportSectionResults = useStableCallback(() =>
        onExportSectionResults(group.title, group.items)
    );

    return (
        <ContextMenu>
            <ContextMenuTrigger render={<div className="contents" />}>
                <div
                    className="sticky z-10 flex items-center justify-between gap-3 rounded-xl bg-muted pr-1 shadow-[0_8px_20px_-14px_rgba(0,0,0,0.18)]"
                    style={{
                        background: getColorGradientFromName(group.accentKey),
                        top: "var(--library-section-sticky-top)",
                    }}
                >
                    <div className="flex items-center">
                        {enableSectionCollapse ? (
                            <Button
                                aria-expanded={!group.collapsed}
                                className="group min-w-0 flex-1 justify-start rounded-xl"
                                onClick={group.onToggle}
                                size="lg"
                                title={
                                    group.collapsed
                                        ? "Expand group"
                                        : "Collapse group"
                                }
                                variant="ghost"
                                {...(group.collapsed
                                    ? {}
                                    : { "data-panel-open": true })}
                            >
                                <ChevronDownFilledIcon />
                                <span className="ml-1 truncate font-medium">
                                    {group.title}
                                </span>
                            </Button>
                        ) : (
                            <h2 className="font-medium text-lg">
                                {group.title}
                            </h2>
                        )}
                        <span className="font-medium text-muted-foreground text-xs tabular-nums">
                            {group.items.length}
                        </span>
                    </div>
                    {hasItems ? (
                        <Menu>
                            <MenuTrigger
                                render={
                                    <Button
                                        aria-label="Section menu"
                                        size="icon-sm"
                                        variant="ghost"
                                    >
                                        <Ellipsis className="size-3.5" />
                                    </Button>
                                }
                            />
                            <MenuPopup align="end">
                                {enableSectionCollapse ? (
                                    <>
                                        <MenuItem
                                            disabled={!group.collapsed}
                                            onClick={group.onToggle}
                                        >
                                            Expand
                                        </MenuItem>
                                        <MenuItem onClick={onExpandAllSections}>
                                            Expand all
                                        </MenuItem>
                                        <MenuSeparator />
                                        <MenuItem
                                            disabled={group.collapsed}
                                            onClick={group.onToggle}
                                        >
                                            Collapse
                                        </MenuItem>
                                        <MenuItem
                                            onClick={onCollapseAllSections}
                                        >
                                            Collapse all
                                        </MenuItem>
                                        <MenuSeparator />
                                    </>
                                ) : null}
                                {canCreateCollectionFromResults ? (
                                    <MenuItem
                                        onClick={onCreateCollectionFromResults}
                                    >
                                        <CircleFadingPlus className="size-4.5 text-muted-foreground" />
                                        New collection with these results
                                    </MenuItem>
                                ) : null}
                                {canCreateCollectionFromResults ? (
                                    <MenuSeparator />
                                ) : null}
                                <MenuItem onClick={handleExportSectionResults}>
                                    <FileSpreadsheetIcon className="size-4.5 text-muted-foreground" />
                                    Export to CSV
                                </MenuItem>
                            </MenuPopup>
                        </Menu>
                    ) : null}
                </div>
            </ContextMenuTrigger>
            {enableSectionCollapse ? (
                <ContextMenuPopup>
                    <ContextMenuItem
                        disabled={!group.collapsed}
                        onClick={group.onToggle}
                    >
                        <ChevronDown className="size-4.5 text-muted-foreground" />
                        Expand
                    </ContextMenuItem>
                    <ContextMenuItem
                        disabled={group.collapsed}
                        onClick={group.onToggle}
                    >
                        <ChevronUp className="size-4.5 text-muted-foreground" />
                        Collapse
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={onExpandAllSections}>
                        <ChevronsDown className="size-4.5 text-muted-foreground" />
                        Expand all
                    </ContextMenuItem>
                    <ContextMenuItem onClick={onCollapseAllSections}>
                        <ChevronsUp className="size-4.5 text-muted-foreground" />
                        Collapse all
                    </ContextMenuItem>
                </ContextMenuPopup>
            ) : null}
        </ContextMenu>
    );
}

function ItemsGroupEmpty({ className, ...props }: React.ComponentProps<"p">) {
    const { collapsed, items } = useItemsGroupContext();

    if (collapsed || items.length > 0) {
        return null;
    }

    return (
        <p
            {...props}
            className={cn("text-muted-foreground text-sm", className)}
        />
    );
}

function ItemsGroupOverview({
    children,
    ...props
}: React.ComponentProps<"div">) {
    const { collapsed, items } = useItemsGroupContext();

    if (collapsed) {
        return null;
    }

    return (
        <ItemsGroupHeader {...props}>
            <div className="flex items-center gap-1.5">
                <Astroid
                    aria-hidden
                    className="size-4 text-muted-foreground"
                    focusable="false"
                />
                <GradientWaveText
                    ariaLabel="Overview"
                    className="w-fit font-medium text-muted-foreground text-xs"
                >
                    Overview
                </GradientWaveText>
                <ItemsGroupSourceIcons items={items} />
            </div>
            {children}
        </ItemsGroupHeader>
    );
}

function ItemsGroupOverviewContent() {
    const t = useGT();
    const { collapsed, items, title } = useItemsGroupContext();
    const [isExpanded, setIsExpanded] = React.useState(false);
    const contentId = React.useId();

    const payload = React.useDeferredValue(
        JSON.stringify({
            expanded: isExpanded,
            items: items
                .slice(0, SECTION_DESCRIPTION_CONTEXT_ITEMS_LIMIT)
                .map(buildSectionDescriptionContextItem),
            sectionTitle: title,
        })
    );

    const { data, error, isLoading, isValidating } = useSectionDescription(
        payload,
        items.length
    );

    const handleToggleExpanded = useStableCallback(() => {
        setIsExpanded((prev) => !prev);
    });

    const summary = error ? undefined : data?.summary.trim();
    const isPending = isLoading || isValidating;

    if (collapsed) {
        return null;
    }

    return (
        <div
            aria-busy={isPending}
            className="fade-in-0 flex w-full animate-in items-start gap-1 text-xs leading-snug motion-reduce:animate-none"
            id={contentId}
        >
            <Streamdown
                className={cn("min-w-0 flex-1 whitespace-pre-line pt-1.5", {
                    "shimmer shimmer-duration-1000 text-muted-foreground":
                        isPending,
                })}
            >
                {summary ||
                    (isPending
                        ? t("Loading overview…")
                        : t("Overview is unavailable right now."))}
            </Streamdown>
            &nbsp;
            {summary && summary.length > 0 ? (
                <>
                    <CopyResponseButton value={summary} />
                    <ReadAloudResponseButton value={summary} />
                </>
            ) : null}
            <Button
                aria-controls={contentId}
                aria-expanded={isExpanded}
                aria-pressed={isExpanded}
                onClick={handleToggleExpanded}
                size="xs"
                variant="link"
            >
                {isExpanded ? "Brief" : "Detailed"}
                &nbsp;
                <ListChevronsUpDown className="mb-px inline-block size-3.5 shrink-0" />
            </Button>
        </div>
    );
}

interface ItemsMasonryProps {
    children: (
        data: LibraryItemWithCollections,
        index: number
    ) => React.ReactElement;
}

function ItemsMasonry({ children }: ItemsMasonryProps) {
    const { collapsed, items } = useItemsGroupContext();
    const {
        columnCount,
        hoveredItemIdRef,
        hoverPinnedItemIdRef,
        markVisited,
        openPickerItemId,
        setOpenPickerItemId,
    } = useItemsListContext();
    const {
        favoriteItemIdSet,
        onCopyLink,
        onDelete,
        onFindSimilar,
        onOpenInNewTab,
        onOpenNote,
        onItemFavoriteToggle,
        pendingDeleteItemId,
    } = useItemsContext();

    const contextValue: ItemCardEnvironmentContext = {
        favoriteItemIdSet,
        hoveredItemIdRef,
        hoverPinnedItemIdRef,
        markVisited,
        onCopyLink,
        onDelete,
        onFindSimilar,
        onItemFavoriteToggle,
        onOpenInNewTab,
        onOpenNote,
        openPickerItemId,
        pendingDeleteItemId,
        setOpenPickerItemId,
    };

    if (collapsed || items.length === 0) {
        return null;
    }

    return (
        <ItemCardEnvironmentContext value={contextValue}>
            <div className="contain-layout contain-paint contain-style [overflow-clip-margin:0.5rem]">
                <MasonryRoot
                    columnCount={columnCount}
                    gap={16}
                    items={items}
                    maxColumnCount={7}
                >
                    {children}
                </MasonryRoot>
            </div>
        </ItemCardEnvironmentContext>
    );
}

interface DeleteItemDialogProps {
    deleteErrorMessage: string | null;
    onConfirmDelete: () => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    pendingDeleteItem: LibraryItemWithCollections | null;
}

function DeleteItemDialog({
    deleteErrorMessage,
    onConfirmDelete,
    onOpenChange,
    open,
    pendingDeleteItem,
}: DeleteItemDialogProps) {
    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>
                        <T>Delete entry?</T>
                    </DialogTitle>
                    <DialogDescription>
                        <T>
                            <Var>
                                {truncateText(
                                    pendingDeleteItem?.noteContentText?.trim() ||
                                        pendingDeleteItem?.caption?.trim() ||
                                        pendingDeleteItem?.url ||
                                        "This saved item",
                                    64
                                )}
                            </Var>{" "}
                            will be moved to Recently deleted. You have 30 days
                            to restore it before it's permanently deleted. This
                            only removes it from your library, not from the
                            original platform.
                        </T>
                    </DialogDescription>
                    {deleteErrorMessage ? (
                        <p className="text-destructive text-sm">
                            {deleteErrorMessage}
                        </p>
                    ) : null}
                </DialogHeader>
                <DialogFooter>
                    <DialogClose render={<Button variant="ghost" />}>
                        <T>Cancel</T>
                    </DialogClose>
                    <Button onClick={onConfirmDelete} variant="destructive">
                        <T>Delete</T>
                    </Button>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}

interface RemoveDuplicatesDialogProps {
    count: number;
    isRemoving: boolean;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
}

function RemoveDuplicatesDialog({
    count,
    isRemoving,
    onConfirm,
    onOpenChange,
    open,
}: RemoveDuplicatesDialogProps) {
    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>
                        <T>Remove duplicate bookmarks?</T>
                    </DialogTitle>
                    <DialogDescription>
                        <T>
                            <Var>{count}</Var> duplicate bookmarks will be moved
                            to Recently deleted. The oldest copy of each link
                            stays in your library. You have 30 days to restore
                            them before they're permanently deleted.
                        </T>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose
                        disabled={isRemoving}
                        render={<Button variant="ghost" />}
                    >
                        <T>Cancel</T>
                    </DialogClose>
                    <Button
                        isLoading={isRemoving}
                        onClick={onConfirm}
                        variant="destructive"
                    >
                        <T>Remove</T>
                    </Button>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}

interface CreateFromResultsCollectionDialogProps {
    initialName: string;
    onCreateCollection: (
        input: CreateItemsCollectionInput
    ) => Promise<CollectionCreateFromItemsResult>;
    onOpenChange: (open: boolean) => void;
    onUpdateItemsCollections: (input: {
        itemIds: string[];
        nextSharedCollectionIds: string[];
        previousSharedCollectionIds: string[];
    }) => Promise<LibraryItemsCollectionsUpdateResult>;
    open: boolean;
    resultItems: LibraryItemWithCollections[];
}

function CreateFromResultsCollectionDialog({
    initialName,
    onCreateCollection,
    onOpenChange,
    onUpdateItemsCollections,
    open,
    resultItems,
}: CreateFromResultsCollectionDialogProps) {
    const [createResultsNameDraft, setCreateResultsNameDraft] =
        React.useState(initialName);
    const [createResultsDescriptionDraft, setCreateResultsDescriptionDraft] =
        React.useState("");
    const [createResultsError, setCreateResultsError] = React.useState<
        string | null
    >(null);
    const [isCreatingResultsCollection, startCreateResultsCollection] =
        React.useTransition();
    const createResultsNameInputId = React.useId();
    const createResultsDescriptionId = React.useId();
    const [previousOpen, setPreviousOpen] = React.useState(open);

    if (open !== previousOpen) {
        setPreviousOpen(open);
        if (open) {
            setCreateResultsNameDraft(initialName);
            setCreateResultsDescriptionDraft("");
            setCreateResultsError(null);
        }
    }

    const handleResultsFormSubmit = useStableCallback(
        (event: React.SubmitEvent<HTMLFormElement>) => {
            event.preventDefault();
            startCreateResultsCollection(async () => {
                let result: CollectionCreateFromItemsResult;
                try {
                    result = await onCreateCollection({
                        description: createResultsDescriptionDraft || undefined,
                        itemIds: resultItems.map((item) => item.id),
                        name: createResultsNameDraft,
                    });
                } catch (error) {
                    log.error(
                        "Failed to create collection from browser results",
                        error,
                        { itemCount: resultItems.length }
                    );
                    result = {
                        message:
                            "We couldn't create this collection right now.",
                        status: ACTION_STATUS.ERROR,
                    };
                }

                if (result.status !== ACTION_STATUS.CREATED) {
                    setCreateResultsError(result.message);
                    return;
                }

                setCreateResultsError(null);
                onOpenChange(false);
            });
        }
    );

    const handleResultsNameChange = useStableCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            setCreateResultsNameDraft(event.currentTarget.value);
            if (createResultsError) {
                setCreateResultsError(null);
            }
        }
    );

    const handleResultsDescriptionChange = useStableCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            setCreateResultsDescriptionDraft(event.currentTarget.value);
        }
    );

    const handleOpenChange = useStableCallback((nextOpen: boolean) => {
        if (!nextOpen && isCreatingResultsCollection) {
            return;
        }
        if (!nextOpen) {
            setCreateResultsError(null);
        }
        onOpenChange(nextOpen);
    });

    return (
        <Dialog onOpenChange={handleOpenChange} open={open}>
            <DialogPopup>
                <form className="contents" onSubmit={handleResultsFormSubmit}>
                    <DialogHeader>
                        <div className="flex items-center gap-1">
                            <Badge size="lg" variant="outline">
                                <Image
                                    alt=""
                                    height={12}
                                    src={AppIconSmall}
                                    width={12}
                                />
                                Cache
                            </Badge>
                            <ChevronRight className="inline-block size-3.5 shrink-0" />
                            <DialogTitle className="font-medium text-sm">
                                New collection with {resultItems.length} current
                                result
                                {resultItems.length === 1 ? "" : "s"}
                            </DialogTitle>
                        </div>
                    </DialogHeader>
                    <DialogPanel className="space-y-2">
                        <div>
                            <label
                                className="sr-only font-medium text-sm"
                                htmlFor={createResultsNameInputId}
                            >
                                Name
                            </label>
                            <Input
                                autoFocus
                                className="-mx-[calc(--spacing(3)-1px)] font-semibold text-xl"
                                id={createResultsNameInputId}
                                isUnstyled
                                maxLength={COLLECTION_NAME_MAX_LENGTH}
                                onChange={handleResultsNameChange}
                                placeholder="Collection title"
                                required
                                size="lg"
                                type="text"
                                value={createResultsNameDraft}
                            />
                        </div>
                        <div>
                            <label
                                className="sr-only font-medium text-sm"
                                htmlFor={createResultsDescriptionId}
                            >
                                Description (optional)
                            </label>
                            <Textarea
                                className="-mx-[calc(--spacing(3)-1px)]"
                                id={createResultsDescriptionId}
                                isUnstyled
                                maxLength={1024}
                                onChange={handleResultsDescriptionChange}
                                placeholder="Describe what belongs here…"
                                size="lg"
                                value={createResultsDescriptionDraft}
                            />
                        </div>
                        {createResultsError ? (
                            <p className="text-destructive text-sm">
                                {createResultsError}
                            </p>
                        ) : null}
                    </DialogPanel>
                    <DialogFooter>
                        <ItemCollectionsCombobox
                            items={resultItems}
                            onUpdateItemsCollections={onUpdateItemsCollections}
                            render={
                                <Button
                                    className="mr-auto -ml-2"
                                    size="xs"
                                    type="button"
                                    variant="link"
                                />
                            }
                        >
                            <Component className="mr-0.5! size-4" />
                            Add to existing
                        </ItemCollectionsCombobox>
                        <DialogClose
                            disabled={isCreatingResultsCollection}
                            render={<Button size="sm" variant="ghost" />}
                        >
                            Cancel
                        </DialogClose>
                        <Button
                            isLoading={isCreatingResultsCollection}
                            size="sm"
                            type="submit"
                        >
                            Create collection
                        </Button>
                    </DialogFooter>
                </form>
            </DialogPopup>
        </Dialog>
    );
}

function AssistantResponseShell({
    children,
    prompt,
}: {
    children: React.ReactNode;
    prompt?: string;
}) {
    return (
        <BubbleGroup className="w-full min-w-0 flex-1 py-1 pr-2">
            {prompt ? (
                <Bubble align="end" variant="muted">
                    <BubbleContent>
                        <Streamdown>{prompt}</Streamdown>
                    </BubbleContent>
                </Bubble>
            ) : null}
            {children}
        </BubbleGroup>
    );
}

function AssistantResponseLoadingPanel({ prompt }: { prompt?: string }) {
    return (
        <AssistantResponseShell prompt={prompt}>
            <div className="flex min-w-0 flex-1 items-center gap-2 py-1">
                <ThinkingOrb size={20} state="shaping" />
                <span className="text-muted-foreground text-xs">
                    <T>Thinking…</T>
                </span>
            </div>
        </AssistantResponseShell>
    );
}

function AssistantResponseErrorPanel({
    message,
    prompt,
}: {
    message: string;
    prompt: string;
}) {
    return (
        <AssistantResponseShell prompt={prompt}>
            <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
                <p className="text-sm">{message}</p>
            </div>
        </AssistantResponseShell>
    );
}

function AssistantResponseSuccessPanel({
    markdown,
    prompt,
}: {
    markdown: string;
    prompt: string;
}) {
    return (
        <AssistantResponseShell prompt={prompt}>
            <div className="flex min-w-0 flex-1 flex-col py-1">
                <AssistantMessageBody>
                    <Streamdown className="whitespace-pre-line text-sm leading-relaxed">
                        {markdown}
                    </Streamdown>
                    <AssistantMessageActions>
                        <CopyResponseButton value={markdown} />
                        <ReadAloudResponseButton value={markdown} />
                        <ContinueInThreadButton
                            markdown={markdown}
                            prompt={prompt}
                        />
                    </AssistantMessageActions>
                </AssistantMessageBody>
            </div>
        </AssistantResponseShell>
    );
}

function AssistantResponsePanel({
    response,
}: {
    response: AssistantResponseState | null;
}) {
    if (!response || response.status === "loading") {
        return <AssistantResponseLoadingPanel prompt={response?.prompt} />;
    }

    if (response.status === "error") {
        return (
            <AssistantResponseErrorPanel
                message={response.message}
                prompt={response.prompt}
            />
        );
    }

    return (
        <AssistantResponseSuccessPanel
            markdown={response.markdown}
            prompt={response.prompt}
        />
    );
}

function Palette({
    className,
    ...props
}: React.ComponentProps<typeof Toolbar.Root>) {
    return (
        <Toolbar.Root
            {...props}
            className={cn("sticky top-1 z-50 w-full max-w-2xl", className)}
        />
    );
}

interface PaletteInputEndAddonProps {
    stackEntries: ComposerStackEntry[];
}

function PaletteStackEntryChip({ entry }: { entry: ComposerStackEntry }) {
    if (entry.kind === "attachment") {
        return (
            <ComposerAttachmentChip
                attachment={entry.attachment}
                onRemove={entry.onRemoveAttachment}
            />
        );
    }

    return <ComposerChip label={entry.label} onRemove={entry.onRemove} />;
}

function PaletteInputEndAddon({ stackEntries }: PaletteInputEndAddonProps) {
    return (
        <>
            {stackEntries.length === 0 ? (
                <PaletteInputEndAddonShortcut />
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
                    <PaletteStackEntryChip entry={entry} key={entry.key} />
                ))}
            </CollapsibleListHorizontal>
        </>
    );
}

function PaletteInputEndAddonShortcut() {
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

interface PaletteActionsListProps
    extends React.ComponentProps<typeof Toolbar.Group>,
        PaletteActionsContext {}

function PaletteActionsList({
    className,
    duplicatesFilterEnabled,
    onCreateNote,
    onRemoveDuplicates,
    removableDuplicateCount,
    ...props
}: PaletteActionsListProps) {
    const contextValue: PaletteActionsContext = {
        duplicatesFilterEnabled,
        onCreateNote,
        onRemoveDuplicates,
        removableDuplicateCount,
    };

    return (
        <PaletteActionsContext value={contextValue}>
            <ScrollArea className="h-fit" shouldScrollFade>
                <ToolbarGroup
                    {...props}
                    className={cn("gap-2 px-3", className)}
                />
            </ScrollArea>
        </PaletteActionsContext>
    );
}

function PaletteActionNew() {
    const { onCreateNote } = usePaletteActionsContext();

    return (
        <PaletteActionButton onClick={onCreateNote} title="Add new">
            <SquarePen className="inline-block size-3.5" />
            &nbsp;Add new
        </PaletteActionButton>
    );
}

function PaletteActionRemoveDuplicates() {
    const {
        duplicatesFilterEnabled,
        onRemoveDuplicates,
        removableDuplicateCount,
    } = usePaletteActionsContext();

    const canRemove = removableDuplicateCount > 0;

    if (!duplicatesFilterEnabled) {
        return null;
    }

    return (
        <PaletteActionButton
            disabled={!canRemove}
            onClick={onRemoveDuplicates}
            title={
                canRemove
                    ? "Remove duplicate bookmarks"
                    : "No duplicates to remove"
            }
        >
            <CopyX className="inline-block size-3.5" />
            &nbsp;Remove duplicates
        </PaletteActionButton>
    );
}

interface ComposerCommandRowProps {
    item: ComposerCommand;
}

function useComposerCommandSelect(item: ComposerCommand) {
    return useStableCallback((event: BaseUIEvent<React.MouseEvent>) => {
        try {
            const result = item.onSelect(event);
            if (result) {
                result.catch((error: unknown) => {
                    log.error("ComposerCommandRow selection failed", error, {
                        value: item.value,
                    });
                });
            }
        } catch (error) {
            log.error("ComposerCommandRow selection failed", error, {
                value: item.value,
            });
        }
    });
}

function ComposerCommandContent({ item }: { item: ComposerCommand }) {
    if (item.children) {
        return item.children;
    }

    return (
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="truncate">{item.label}</div>
            {item.description ? (
                <span className="max-w-xs truncate text-muted-foreground/80 text-xs">
                    {item.description}
                </span>
            ) : null}
            {item.isActive ? <Badge variant="secondary">Active</Badge> : null}
            {item.shortcut ? (
                <CommandShortcut>{item.shortcut}</CommandShortcut>
            ) : null}
        </div>
    );
}

function ComposerCommandRow({ item }: ComposerCommandRowProps) {
    const handleSelect = useComposerCommandSelect(item);

    return (
        <CommandItem
            disabled={item.disabled}
            onClick={handleSelect}
            value={item.value}
        >
            <ComposerCommandContent item={item} />
        </CommandItem>
    );
}

function ComposerCollectionCommandCard({ item }: ComposerCommandRowProps) {
    const handleSelect = useComposerCommandSelect(item);

    return (
        <CommandItem
            className="group squircle relative flex-1 overflow-hidden rounded-xl bg-accent text-accent-foreground shadow-xs"
            disabled={item.disabled}
            onClick={handleSelect}
            value={item.value}
        >
            <ComposerCommandContent item={item} />
        </CommandItem>
    );
}

function PaletteActionButton({
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

interface PaletteSuggestionsListProps
    extends Omit<React.ComponentProps<typeof CollapsiblePanel>, "children"> {
    children: (
        suggestion: ComposerSuggestion,
        index: number
    ) => React.ReactNode;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    suggestions: ComposerSuggestion[];
}

function PaletteSuggestionsListButton({
    index,
    suggestion,
}: {
    index: number;
    suggestion: ComposerSuggestion;
}) {
    return (
        <Button
            className="text-muted-foreground"
            onClick={suggestion.onSelect}
            size="xs"
            variant="ghost"
        >
            {suggestion.icon}
            &nbsp;
            {suggestion.label}
            <Kbd className="bg-transparent px-0 text-[11px] opacity-50">
                <CmdKbd />
                {index + 1}
            </Kbd>
        </Button>
    );
}

function PaletteSuggestionsList({
    children,
    suggestions,
    className,
    isOpen: isOpenProp,
    onOpenChange: onOpenChangeProp,
    ...props
}: PaletteSuggestionsListProps) {
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
        id: "dismiss",
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
                    {suggestions.map((suggestion, index) => (
                        <React.Fragment key={suggestion.id}>
                            {children(suggestion, index)}
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

function ComposerCollectionCommandThumbnail({ urls }: { urls: string[] }) {
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
            height={104}
            loading="lazy"
            onError={handleImageError}
            src={src}
            width={140}
        />
    );
}

interface ContinueInThreadButtonProps {
    markdown: string;
    prompt: string;
}

function ContinueInThreadButton({
    markdown,
    prompt,
}: ContinueInThreadButtonProps) {
    const router = useRouter();
    const [isPending, startTransition] = React.useTransition();
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    const handleContinue = useStableCallback(() => {
        setErrorMessage(null);
        startTransition(async () => {
            try {
                const result = await createThreadFromAssistant({
                    markdown,
                    prompt,
                });
                if (result.status !== ACTION_STATUS.CREATED) {
                    setErrorMessage(result.message);
                    return;
                }
                router.push(`/c/${result.threadId}`);
            } catch (error) {
                log.error("Failed to continue Ask Cache in thread", error);
                setErrorMessage("We couldn't start this chat right now.");
            }
        });
    });

    return (
        <span className="ml-auto inline-flex max-w-full items-center gap-2">
            {errorMessage ? (
                <span
                    className="truncate text-destructive text-xs"
                    role="alert"
                >
                    {errorMessage}
                </span>
            ) : null}
            <Button
                isLoading={isPending}
                onClick={handleContinue}
                size="xs"
                variant="secondary"
            >
                <T>Continue in Chat</T>
                <ArrowUpRight className="size-3.5 shrink-0" />
            </Button>
        </span>
    );
}
