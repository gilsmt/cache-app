"use client";

import type {
    AutocompleteRootChangeEventDetails,
    BaseUIEvent,
} from "@base-ui/react";
import { getTarget } from "@base-ui/utils/shadowDom";
import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useRefWithInit } from "@base-ui/utils/useRefWithInit";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import { cn } from "cn";
import { T, useGT, Var } from "gt-next";
import {
    ArrowUpRight,
    Astroid,
    Check,
    ChevronDown,
    ChevronRight,
    ChevronsDown,
    ChevronsUp,
    ChevronUp,
    CircleFadingPlus,
    Component,
    DownloadIcon,
    Ellipsis,
    ExternalLinkIcon,
    EyeIcon,
    FilePenLineIcon,
    FileSpreadsheetIcon,
    History,
    LinkIcon,
    ListChevronsUpDown,
    SearchIcon,
    Squircle,
    SquircleDashed,
    Star,
    Volume2Icon,
    VolumeXIcon,
    ZoomIn,
} from "lucide-react";
import Image from "next/image";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Controlled as ControlledZoom } from "react-medium-image-zoom";
import { Streamdown } from "streamdown";
import useSWR from "swr";
import {
    BlockPaywallBanner,
    InlinePaywallBanner,
} from "@/components/billing/paywall";
import { useSubscriptionAccess } from "@/components/billing/subscription";
import { SuccessfulUpgradeDialog } from "@/components/billing/success";
import {
    reconcileCollectionTags,
    replaceMultipleItemCollections,
    sortCollections,
    useCollectionsContext,
} from "@/components/session/collections";
import { CommentTextarea } from "@/components/session/comment";
import {
    ALL_DOMAIN_FILTER,
    type AskCacheResponseState,
    buildComposerSuggestions,
    buildDomainPaletteOptions,
    buildPaletteGroups,
    buildPaletteGroupValueSet,
    buildPaletteStackEntries,
    COLLECTION_NAME_MAX_LENGTH,
    COMBOBOX_ESCAPE_KEY_REASON,
    COMBOBOX_ITEM_PRESS_REASON,
    Composer,
    ComposerActionMetrics,
    ComposerActionNew,
    ComposerActionRemoveDuplicates,
    ComposerActionsList,
    type ComposerAttachment,
    ComposerInput,
    type ComposerInputActions,
    type ComposerSortMode,
    ComposerSuggestionsList,
    CopyResponseButton,
    DEFAULT_COLUMN_COUNT_MODE,
    DEFAULT_SORT_MODE,
    type DecoratedComposerItem,
    type EffectiveGroupByMode,
    getItemGroupKey,
    getSourceLabel,
    isPrintablePaletteKey,
    isSearchHotkey,
    itemTimestamp,
    NAME_COLLATOR,
    PALETTE_PLACEHOLDER_BY_SECTION,
    type PaletteSection,
    removeLastPaletteStackEntry,
    SOURCE_LABEL_BY_VALUE,
    type SortMode,
} from "@/components/session/composer";
import {
    browserHasActiveFilters,
    type CollectionMembershipFilter,
    DEFAULT_COLLECTION_MEMBERSHIP_FILTER,
    filterComposerItems,
    getLibraryItemDomain,
    UNSPECIFIC_LIBRARY_DOMAIN,
} from "@/components/session/filters";
import {
    ItemsContext,
    useItemsContext,
    useItemsStateContext,
} from "@/components/session/items";
import { OnboardingMenu } from "@/components/session/onboarding";
import {
    type NoteDraft,
    openQuickLook,
    openQuickLookNote,
    QuickLookContent,
    QuickLookRoot,
} from "@/components/session/quick-look";
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Combobox,
    ComboboxCollection,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxPopup,
    ComboboxStatus,
    ComboboxTrigger,
} from "@/components/ui/combobox";
import {
    ContextMenu,
    ContextMenuGroup,
    ContextMenuGroupLabel,
    ContextMenuItem,
    ContextMenuPopup,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubPopup,
    ContextMenuSubTrigger,
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
import { AltKbd, CmdKbd, Kbd } from "@/components/ui/kbd";
import { MasonryItem, MasonryRoot } from "@/components/ui/masonry";
import {
    Menu,
    MenuGroup,
    MenuGroupLabel,
    MenuItem,
    MenuPopup,
    MenuSeparator,
    MenuSub,
    MenuSubPopup,
    MenuSubTrigger,
    MenuTrigger,
} from "@/components/ui/menu";
import { Placeholder } from "@/components/ui/placeholder";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { Ticker } from "@/components/ui/ticker";
import { useComposerFilters } from "@/hooks/use-composer-filters";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useIsExtensionInstalled } from "@/hooks/use-extension-installed";
import { useLastVisited } from "@/hooks/use-last-visited";
import { useSearchHistory } from "@/hooks/use-search-history";
import {
    type CollectionCreateFromItemsResult,
    createCollectionFromItems,
    downloadMedia,
} from "@/lib/collections/actions";
import {
    buildCollectionItemIndexes,
    buildFavoriteItemIndexes,
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
    isRecentlySmartCollected,
    itemPreviewImageUrl,
    itemPreviewVideoUrl,
    type LibraryCollectionSummary,
    type LibraryCollectionTag,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { mergeById, updateById } from "@/lib/common/array";
import { getColorGradientFromName } from "@/lib/common/color";
import {
    ACTION_STATUS,
    BATCH_UPDATE_MAX_ITEMS,
    FALLBACK_URL,
    ITEM_KIND_BOOKMARK,
    ITEM_KIND_NOTE,
    MIME_TYPES,
} from "@/lib/common/constants";
import { parseDate } from "@/lib/common/date";
import {
    type Dimensions,
    resolveDisplayDimensions,
} from "@/lib/common/dimension";
import {
    getOwnerDocument,
    getOwnerWindow,
    isTextEntryTarget,
} from "@/lib/common/dom";
import { revokeFileAttachmentObjectUrl, saveFile } from "@/lib/common/file";
import { getImageColors } from "@/lib/common/image-color";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    getNoteExcerpt,
    normalizeWhitespace,
    slugify,
    truncateLabel,
} from "@/lib/common/string";
import { fetchWithTimeout } from "@/lib/common/timeout";
import {
    normalizeURL,
    openExternalUrl,
    toValidUrl,
    tryParseUrl,
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
import { getSourceIcon } from "@/lib/integrations/support";
import { askCache, getSectionDescription } from "@/lib/intelligence/actions";
import type {
    AskCacheComposerPatch,
    AskCacheRequest,
    AskCacheResult,
} from "@/lib/intelligence/composer/ask-cache";
import {
    ASK_CACHE_CONTEXT_COLLECTION_LIMIT,
    ASK_CACHE_CONTEXT_DOMAIN_LIMIT,
} from "@/lib/intelligence/composer/ask-cache";
import {
    SECTION_DESCRIPTION_CONTEXT_ITEMS_LIMIT,
    SECTION_DESCRIPTION_DOMAIN_MAX_LENGTH,
    SECTION_DESCRIPTION_TEXT_MAX_LENGTH,
    SECTION_DESCRIPTION_TITLE_MAX_LENGTH,
    SECTION_DESCRIPTION_URL_MAX_LENGTH,
    type SectionDescriptionContextItem,
    SectionDescriptionRequestSchema,
} from "@/lib/intelligence/overview";
import { LibraryItemSource } from "@/prisma/client/enums";
import AppIconSmall from "@/public/cache-icon-small.png";
import { useDimensionsCacheContext } from "./dimensions";

const COBALT_SOURCES = new Set<LibraryItemSource>([
    LibraryItemSource.google_photos,
    LibraryItemSource.instagram,
    LibraryItemSource.pinterest,
    LibraryItemSource.tiktok,
    LibraryItemSource.x_bookmarks,
    LibraryItemSource.youtube_watch_later,
]);

const MEDIA_DOWNLOAD_TIMEOUT_MS = 60_000;

const DOMAIN_RELATED_SOURCES = new Set<LibraryItemSource>([
    LibraryItemSource.chrome_bookmarks,
    LibraryItemSource.other,
]);

const EMPTY_LIBRARY_PEEK_PLACEHOLDERS = [
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

const MEDIA_DOWNLOAD_FILE_EXTENSION_BY_MIME_TYPE: Record<
    string,
    MediaDownloadFileExtension
> = {
    [MIME_TYPES.avif]: "avif",
    [MIME_TYPES.bmp]: "bmp",
    [MIME_TYPES.gif]: "gif",
    [MIME_TYPES.ico]: "ico",
    [MIME_TYPES.jfif]: "jfif",
    [MIME_TYPES.jpg]: "jpg",
    [MIME_TYPES.mov]: "mov",
    [MIME_TYPES.mp4]: "mp4",
    [MIME_TYPES.png]: "png",
    [MIME_TYPES.svg]: "svg",
    [MIME_TYPES.webp]: "webp",
    [MIME_TYPES.webm]: "webm",
} as const;

const LOCKED_LIBRARY_PREVIEW_PLACEHOLDERS = [
    {
        aspect: "aspect-[4/5]",
        id: "locked-library-preview-1",
        kind: "bookmark",
    },
    { aspect: "aspect-[3/4]", id: "locked-library-preview-2", kind: "note" },
    {
        aspect: "aspect-square",
        id: "locked-library-preview-3",
        kind: "bookmark",
    },
    {
        aspect: "aspect-[5/6]",
        id: "locked-library-preview-4",
        kind: "bookmark",
    },
    { aspect: "aspect-[4/5]", id: "locked-library-preview-5", kind: "note" },
    {
        aspect: "aspect-[3/4]",
        id: "locked-library-preview-6",
        kind: "bookmark",
    },
    {
        aspect: "aspect-square",
        id: "locked-library-preview-7",
        kind: "bookmark",
    },
    { aspect: "aspect-[5/6]", id: "locked-library-preview-8", kind: "note" },
    {
        aspect: "aspect-[4/5]",
        id: "locked-library-preview-9",
        kind: "bookmark",
    },
] satisfies LockedLibraryPreviewPlaceholder[];

interface SectionDescriptionResponse {
    summary: string;
}

type SectionDescriptionSWRKey = readonly [requestBody: string];

interface BrowserGroup {
    items: LibraryItemWithCollections[];
    key: string;
    title: string | null;
}

interface BrowserContext {
    clearLibraryPalette: () => void;
    collapsedSectionKeys: Set<string>;
    collections: LibraryCollectionSummary[];
    columnCount?: number;
    enableSectionCollapse: boolean;
    hoveredItemIdRef: React.RefObject<string | null>;
    hoverPinnedItemIdRef: React.RefObject<string | null>;
    onCollapseAllSections?: () => void;
    onCreateCollectionFromResults?: () => void;
    onExpandAllSections?: () => void;
    onExportSectionResults?: (
        sectionTitle: string,
        items: LibraryItemWithCollections[]
    ) => void;
    onToggleSection: (key: string) => void;
    openPickerItemId: string | null;
    setOpenPickerItemId: (id: string | null) => void;
    shouldShowEmptyLibraryPeek: boolean;
    shouldShowNoFilteredResults: boolean;
    shouldShowUnreachableProbePending: boolean;
}

interface BrowserGroupContext {
    accentKey: string;
    collapsed: boolean;
    isMainResults: boolean;
    items: LibraryItemWithCollections[];
    key: string;
    onToggle: () => void;
    title: string;
}

interface MediaCardEnvironmentContext {
    collections: LibraryCollectionSummary[];
    favoriteItemIdSet: ReadonlySet<string>;
    hoveredItemIdRef: React.RefObject<string | null>;
    hoverPinnedItemIdRef: React.RefObject<string | null>;
    onCopyLink: (item: LibraryItemWithCollections) => void;
    onDelete: (item: LibraryItemWithCollections) => void;
    onFindSimilar: (item: LibraryItemWithCollections) => void;
    onItemFavoriteToggle: (item: LibraryItemWithCollections) => void;
    onOpenInNewTab: (item: LibraryItemWithCollections) => void;
    onOpenNote: (item: LibraryItemWithCollections) => void;
    onUpdateItemCollections: (
        itemId: string,
        collectionIds: string[]
    ) => Promise<LibraryItemCollectionsUpdateResult>;
    openPickerItemId: string | null;
    pendingDeleteItemId: string | null;
    setOpenPickerItemId: (id: string | null) => void;
}

interface MediaCardData {
    displayTitle: string;
    isNote: boolean;
    item: LibraryItemWithCollections;
    previewImageUrl: string | null;
}

interface MediaCardInteractionContext {
    isDownloading: boolean;
    isZoomed: boolean;
    onDownload: () => void;
    onZoomChange: (nextZoomed: boolean) => void;
    onZoomIn: () => void;
}

interface MediaCardSurfaceContext {
    isMenuOpen: boolean;
    isOverlayOpen: boolean;
    onMenuOpenChange: (open: boolean) => void;
}

const MEDIA_CARD_ACTION_PLUGINS = [
    {
        id: "favorite",
        isAvailable: () => true,
        render: (variant: "menu" | "contextMenu") =>
            variant === "menu" ? (
                <MediaCardFavoriteAction variant="menu" />
            ) : (
                <MediaCardFavoriteAction variant="contextMenu" />
            ),
        separatorBefore: false,
    },
    {
        id: "edit-note",
        isAvailable: ({ isNote }: MediaCardData) => isNote,
        render: (variant: "menu" | "contextMenu") =>
            variant === "menu" ? (
                <MediaCardNoteAction variant="menu" />
            ) : (
                <MediaCardNoteAction variant="contextMenu" />
            ),
        separatorBefore: false,
    },
    {
        id: "quick-look",
        isAvailable: ({ item }: MediaCardData) =>
            item.kind !== ITEM_KIND_NOTE &&
            toValidUrl(normalizeURL(item.url)) !== FALLBACK_URL,
        render: (variant: "menu" | "contextMenu") =>
            variant === "menu" ? (
                <MediaCardQuickLookAction variant="menu" />
            ) : (
                <MediaCardQuickLookAction variant="contextMenu" />
            ),
        separatorBefore: false,
    },
    {
        id: "zoom",
        isAvailable: ({ previewImageUrl }: MediaCardData) =>
            previewImageUrl !== null,
        render: (variant: "menu" | "contextMenu") =>
            variant === "menu" ? (
                <MediaCardZoomAction variant="menu" />
            ) : (
                <MediaCardZoomAction variant="contextMenu" />
            ),
        separatorBefore: false,
    },
    {
        id: "open-link",
        isAvailable: ({ isNote }: MediaCardData) => !isNote,
        render: (variant: "menu" | "contextMenu") =>
            variant === "menu" ? (
                <MediaCardOpenLinkAction variant="menu" />
            ) : (
                <MediaCardOpenLinkAction variant="contextMenu" />
            ),
        separatorBefore: false,
    },
    {
        id: "copy-link",
        isAvailable: ({ isNote }: MediaCardData) => !isNote,
        render: (variant: "menu" | "contextMenu") =>
            variant === "menu" ? (
                <MediaCardCopyLinkAction variant="menu" />
            ) : (
                <MediaCardCopyLinkAction variant="contextMenu" />
            ),
        separatorBefore: false,
    },
    {
        id: "download",
        isAvailable: ({ isNote, item }: MediaCardData) =>
            !isNote && COBALT_SOURCES.has(item.source),
        render: (variant: "menu" | "contextMenu") =>
            variant === "menu" ? (
                <MediaCardDownloadAction variant="menu" />
            ) : (
                <MediaCardDownloadAction variant="contextMenu" />
            ),
        separatorBefore: true,
    },
    {
        id: "find-similar",
        isAvailable: () => true,
        render: (variant: "menu" | "contextMenu") =>
            variant === "menu" ? (
                <MediaCardFindSimilarAction variant="menu" />
            ) : (
                <MediaCardFindSimilarAction variant="contextMenu" />
            ),
        separatorBefore: false,
    },
    {
        id: "wayback",
        isAvailable: ({ isNote }: MediaCardData) => !isNote,
        render: (variant: "menu" | "contextMenu") =>
            variant === "menu" ? (
                <MediaCardWaybackAction variant="menu" />
            ) : (
                <MediaCardWaybackAction variant="contextMenu" />
            ),
        separatorBefore: false,
    },
    {
        id: "delete",
        isAvailable: () => true,
        render: (variant: "menu" | "contextMenu") =>
            variant === "menu" ? (
                <MediaCardDeleteAction variant="menu" />
            ) : (
                <MediaCardDeleteAction variant="contextMenu" />
            ),
        separatorBefore: true,
    },
] as const;

type MediaDownloadFileExtension = Exclude<keyof typeof MIME_TYPES, "binary">;

interface LockedLibraryPreviewPlaceholder {
    aspect: string;
    id: string;
    kind: "bookmark" | "note";
}

interface BrowserSimilarFilterState {
    collectionMembershipFilter: CollectionMembershipFilter;
    domainFilters: string[];
    searchTerms: string[];
    selectedCollectionIds: string[];
    sourceFilters: LibraryItemSource[];
}

interface BrowserSimilarFilterOptions {
    domain: string;
    source: LibraryItemSource;
}

interface LibraryItemIndexesCache {
    indexes: LibraryItemIndexes;
    items: LibraryItemWithCollections[];
    previewUrlCache: WeakMap<LibraryItemWithCollections, string | null>;
}

const log = createLogger("library:browser");

const BrowserContext = React.createContext<BrowserContext | null>(null);

function useBrowserContext(): BrowserContext {
    const context = React.use(BrowserContext);
    if (!context) {
        throw new Error(
            "Browser components must be used inside <BrowserContent>."
        );
    }
    return context;
}

const BrowserGroupContext = React.createContext<BrowserGroupContext | null>(
    null
);

function useBrowserGroupContext(): BrowserGroupContext {
    const context = React.use(BrowserGroupContext);
    if (!context) {
        throw new Error(
            "BrowserGroup components must be used inside <BrowserGroupProvider>."
        );
    }
    return context;
}

const MediaCardEnvironmentContext =
    React.createContext<MediaCardEnvironmentContext | null>(null);

function useMediaCardEnvironmentContext(): MediaCardEnvironmentContext {
    const environment = React.use(MediaCardEnvironmentContext);
    if (!environment) {
        throw new Error(
            "MediaCard components must be used inside <MediaCardEnvironmentContext>."
        );
    }
    return environment;
}

const MediaCardDataContext = React.createContext<MediaCardData | null>(null);

function useMediaCardDataContext(): MediaCardData {
    const data = React.use(MediaCardDataContext);
    if (!data) {
        throw new Error(
            "Media card components must be used inside <MediaCardDataProvider>."
        );
    }
    return data;
}

const MediaCardInteractionContext =
    React.createContext<MediaCardInteractionContext | null>(null);

function useMediaCardInteractionContext(): MediaCardInteractionContext {
    const context = React.use(MediaCardInteractionContext);
    if (!context) {
        throw new Error(
            "Media card components must be used inside <MediaCardInteractionProvider>."
        );
    }
    return context;
}

const MediaCardSurfaceContext =
    React.createContext<MediaCardSurfaceContext | null>(null);

function useMediaCardSurfaceContext(): MediaCardSurfaceContext {
    const context = React.use(MediaCardSurfaceContext);
    if (!context) {
        throw new Error(
            "Media card surfaces must be used inside <MediaCardContextMenuSurface>."
        );
    }
    return context;
}

function useMediaCardFavoriteAction() {
    const { item } = useMediaCardDataContext();
    const { favoriteItemIdSet, onItemFavoriteToggle } =
        useMediaCardEnvironmentContext();
    const isFavorite = favoriteItemIdSet.has(item.id);
    const handleToggle = useStableCallback(() => onItemFavoriteToggle(item));

    return { handleToggle, isFavorite };
}

function useMediaCardNoteAction() {
    const { item } = useMediaCardDataContext();
    const { onOpenNote } = useMediaCardEnvironmentContext();

    return useStableCallback(() => onOpenNote(item));
}

function useMediaCardLinkActions() {
    const { item } = useMediaCardDataContext();
    const { onCopyLink, onOpenInNewTab } = useMediaCardEnvironmentContext();
    const SourceIcon = getSourceIcon(item.source);

    const handleOpenInNewTab = useStableCallback(() => onOpenInNewTab(item));
    const handleCopyLink = useStableCallback(() => onCopyLink(item));

    return { handleCopyLink, handleOpenInNewTab, SourceIcon };
}

function useMediaCardFindSimilarAction() {
    const { item } = useMediaCardDataContext();
    const { onFindSimilar } = useMediaCardEnvironmentContext();

    return useStableCallback(() => onFindSimilar(item));
}

function useMediaCardWaybackActions() {
    const { item } = useMediaCardDataContext();

    const handleWayback30 = useStableCallback(() =>
        openExternalUrl(
            "https://web.archive.org/web/" +
                formatWaybackDate(-30) +
                "/" +
                item.url
        )
    );

    const handleWayback90 = useStableCallback(() =>
        openExternalUrl(
            "https://web.archive.org/web/" +
                formatWaybackDate(-90) +
                "/" +
                item.url
        )
    );

    const handleWayback180 = useStableCallback(() =>
        openExternalUrl(
            "https://web.archive.org/web/" +
                formatWaybackDate(-180) +
                "/" +
                item.url
        )
    );

    const handleWayback365 = useStableCallback(() =>
        openExternalUrl(
            "https://web.archive.org/web/" +
                formatWaybackDate(-365) +
                "/" +
                item.url
        )
    );

    const handleWaybackAll = useStableCallback(() =>
        openExternalUrl(`https://web.archive.org/web/*/${item.url}`)
    );

    return {
        handleWayback30,
        handleWayback90,
        handleWayback180,
        handleWayback365,
        handleWaybackAll,
    };
}

function formatWaybackDate(daysOffset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const min = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    return `${y}${m}${d}${h}${min}${s}`;
}

function useMediaCardDeleteAction() {
    const { item } = useMediaCardDataContext();
    const { onDelete, pendingDeleteItemId } = useMediaCardEnvironmentContext();
    const isDeletePending = pendingDeleteItemId === item.id;
    const handleDelete = useStableCallback(() => onDelete(item));

    return { handleDelete, isDeletePending };
}

function useSectionCollapseState({
    groupBy,
    hasActiveFilters,
    groups,
    shouldShowEmptyLibraryPeek,
    shouldShowNoFilteredResults,
}: {
    groupBy: EffectiveGroupByMode;
    hasActiveFilters: boolean;
    groups: BrowserGroup[];
    shouldShowEmptyLibraryPeek: boolean;
    shouldShowNoFilteredResults: boolean;
}) {
    const [collapsedSectionKeys, setCollapsedSectionKeys] = React.useState<
        string[]
    >([]);

    const enableSectionCollapse =
        !(shouldShowEmptyLibraryPeek || shouldShowNoFilteredResults) &&
        (hasActiveFilters || groupBy !== "none");

    const sectionKeySignature = groups.map((section) => section.key).join("\0");
    const [prevSectionKeySignature, setPrevSectionKeySignature] =
        React.useState(sectionKeySignature);

    if (!Object.is(sectionKeySignature, prevSectionKeySignature)) {
        setPrevSectionKeySignature(sectionKeySignature);
        const validKeys = new Set(groups.map((section) => section.key));
        setCollapsedSectionKeys((current) => {
            const next = current.filter((key) => validKeys.has(key));
            return next.length === current.length ? current : next;
        });
    }

    const [prevEnableSectionCollapse, setPrevEnableSectionCollapse] =
        React.useState(enableSectionCollapse);

    if (!Object.is(prevEnableSectionCollapse, enableSectionCollapse)) {
        setPrevEnableSectionCollapse(enableSectionCollapse);
        if (!enableSectionCollapse) {
            setCollapsedSectionKeys((current) =>
                current.length === 0 ? current : []
            );
        }
    }

    const toggleSection = useStableCallback((key: string) => {
        setCollapsedSectionKeys((current) =>
            current.includes(key)
                ? current.filter((entry) => entry !== key)
                : [...current, key]
        );
    });

    const collapseAllSections = useStableCallback(() => {
        setCollapsedSectionKeys(groups.map((section) => section.key));
    });

    const expandAllSections = useStableCallback(() => {
        setCollapsedSectionKeys([]);
    });

    return {
        collapseAllSections,
        collapsedSectionKeys,
        enableSectionCollapse,
        expandAllSections,
        toggleSection,
    };
}

function useLibraryItemActions(args: {
    onDeleteSuccess?: (collectionSummaries: LibraryCollectionSummary[]) => void;
    removeItems: (itemIds: string[]) => void;
}) {
    const [pendingDeleteItem, setPendingDeleteItem] =
        React.useState<LibraryItemWithCollections | null>(null);
    const [isDeletePending, startDeleteTransition] = React.useTransition();
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
            setPendingDeleteItem(item);
        }
    );

    const handleDeleteDialogOpenChange = useStableCallback((open: boolean) => {
        if (!(open || isDeletePending)) {
            setPendingDeleteItem(null);
        }
    });

    const handleConfirmDelete = useStableCallback(() => {
        const targetItem = pendingDeleteItem;
        if (!targetItem) {
            return;
        }

        const targetItemId = targetItem.id;

        startDeleteTransition(async () => {
            let result: LibraryItemDeleteResult;

            try {
                result = await deleteLibraryItem(targetItemId);
            } catch {
                result = {
                    message: "We couldn't delete this saved item right now.",
                    status: "ERROR",
                };
            }

            if (result.status === ACTION_STATUS.DELETED) {
                args.removeItems([result.itemId]);
                args.onDeleteSuccess?.(result.collectionSummaries);
            }

            if (pendingDeleteItem && pendingDeleteItem.id === targetItemId) {
                setPendingDeleteItem(null);
            }
        });
    });

    return {
        handleConfirmDelete,
        handleCopyLink,
        handleDeleteDialogOpenChange,
        handleOpenInNewTab,
        handleRequestDelete,
        isDeletePending,
        pendingDeleteItem,
    };
}

function useCardHoverHotkeys({
    hoverHotkeySurface,
    hoveredItemIdRef,
    itemsRef,
    onDelete,
    onItemFavoriteToggle,
    pendingDeleteItemIdRef,
}: {
    hoverHotkeySurface: HoverHotkeySurface<HoverHotkeyRegion>;
    hoveredItemIdRef: React.RefObject<string | null>;
    itemsRef: React.RefObject<LibraryItemWithCollections[]>;
    onDelete: (item: LibraryItemWithCollections) => void;
    onItemFavoriteToggle: (item: LibraryItemWithCollections) => void;
    pendingDeleteItemIdRef: React.RefObject<string | null>;
}) {
    const resolveHoveredItem = useStableCallback(() => {
        if (hoverHotkeySurface.isClaimed()) {
            return null;
        }
        const id = hoveredItemIdRef.current;
        if (!id || pendingDeleteItemIdRef.current === id) {
            return null;
        }
        return itemsRef.current.find((item) => item.id === id) ?? null;
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
            openQuickLook({
                description: getLibraryItemDomain(item.url),
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

function useLibraryItemIndexes(
    items: LibraryItemWithCollections[]
): LibraryItemIndexes {
    const cacheRef = useRefWithInit<LibraryItemIndexesCache | null>(() => null);
    const cached = cacheRef.current;
    if (cached?.items === items) {
        return cached.indexes;
    }
    const previewUrlCache =
        cached?.previewUrlCache ??
        new WeakMap<LibraryItemWithCollections, string | null>();
    const indexes: LibraryItemIndexes = {
        ...buildCollectionItemIndexes(items, previewUrlCache),
        ...buildFavoriteItemIndexes(items),
    };
    cacheRef.current = { indexes, items, previewUrlCache };
    return indexes;
}

function useCollectionMutations({
    allCollections,
    items,
    mergeCollectionSummaries,
    setItems,
    syncCollectionCreated,
}: {
    allCollections: LibraryCollectionSummary[];
    items: LibraryItemWithCollections[];
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
            const existingItem = items.find((item) => item.id === itemId);
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
            } catch {
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
            const previousItemCollections = items
                .filter((item) => requestedItemIds.has(item.id))
                .map((item) => ({
                    collections: item.collections,
                    itemId: item.id,
                }));
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
            } catch {
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
            const currentItem = items.find((entry) => entry.id === item.id);
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
            } catch {
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
        async (input: {
            description?: string;
            itemIds: string[];
            name: string;
        }): Promise<CollectionCreateFromItemsResult> => {
            let result: CollectionCreateFromItemsResult;
            try {
                result = await createCollectionFromItems(input);
            } catch {
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

function getLibraryItemTitle(item: LibraryItemWithCollections): string {
    if (item.kind === ITEM_KIND_NOTE) {
        return "";
    }
    const caption = item.caption?.trim();
    if (caption) {
        return caption;
    }
    return item.url;
}

function getLibraryItemPrimaryText(item: LibraryItemWithCollections): string {
    if (item.kind === ITEM_KIND_NOTE) {
        return item.noteContentText?.trim() || "Untitled note";
    }
    const caption = item.caption?.trim();
    return caption && caption.length > 0 ? caption : item.url;
}

async function fetchSectionDescription([
    payload,
]: SectionDescriptionSWRKey): Promise<SectionDescriptionResponse> {
    let rawInput: unknown;
    try {
        rawInput = JSON.parse(payload);
    } catch (error) {
        throw new Error(
            "Failed to parse section description request payload.",
            { cause: error }
        );
    }

    const parsed = SectionDescriptionRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
        throw new Error(
            "Section description request failed schema validation."
        );
    }

    const result = await getSectionDescription(parsed.data);

    if (result.status !== ACTION_STATUS.SUCCESS) {
        throw new Error(result.message);
    }

    const summary = result.summary.trim();
    if (summary.length === 0) {
        throw new Error("Section description response was empty.");
    }

    return { summary };
}

function getSectionDescriptionSWRKey(
    payload: string,
    itemCount: number
): SectionDescriptionSWRKey | null {
    return itemCount > 0 ? [payload] : null;
}

function normalizeSectionDescriptionText(
    value: string | null | undefined,
    maxLength: number
): string {
    const normalized = normalizeWhitespace(value ?? "");
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

function toIsoTimestamp(value: Date | string | null | undefined) {
    const date = parseDate(value);
    return date?.toISOString();
}

function buildSectionDescriptionContextItem(
    item: LibraryItemWithCollections
): SectionDescriptionContextItem {
    const title =
        normalizeSectionDescriptionText(
            getLibraryItemTitle(item),
            SECTION_DESCRIPTION_TITLE_MAX_LENGTH
        ) || "Untitled";

    const noteExcerpt =
        item.kind === "note"
            ? normalizeSectionDescriptionText(
                  getNoteExcerpt(item.noteContentText),
                  SECTION_DESCRIPTION_TEXT_MAX_LENGTH
              ) || undefined
            : undefined;

    const primaryText =
        noteExcerpt ??
        (normalizeSectionDescriptionText(
            getLibraryItemPrimaryText(item),
            SECTION_DESCRIPTION_TEXT_MAX_LENGTH
        ) ||
            title);

    const normalizedUrl =
        item.kind === "note"
            ? undefined
            : normalizeSectionDescriptionText(
                  normalizeURL(item.url),
                  SECTION_DESCRIPTION_URL_MAX_LENGTH
              ) || undefined;

    const domain =
        item.kind === "note"
            ? undefined
            : normalizeSectionDescriptionText(
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

function getBrowserSectionExportFileName(sectionTitle: string): string {
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
        if (!existing || timestamp > existing.timestamp) {
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

function buildResultsCollectionName(searchTerms: string[]): string {
    const normalizedTerms = searchTerms
        .map((term) => term.trim())
        .filter((term) => term.length > 0);

    if (normalizedTerms.length === 0) {
        return "";
    }

    return normalizedTerms.join(" + ").slice(0, COLLECTION_NAME_MAX_LENGTH);
}

function formatGroupHeading(
    mode: EffectiveGroupByMode,
    key: string,
    collectionNames?: Map<string, string>
): string {
    if (mode === "collection") {
        if (key === "__uncategorized__") {
            return "Uncategorized";
        }
        return collectionNames?.get(key) ?? key;
    }
    if (mode === "source") {
        return SOURCE_LABEL_BY_VALUE[key] ?? "Other";
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

function decorateComposerItem(
    item: LibraryItemWithCollections,
    sortMode: ComposerSortMode
): DecoratedComposerItem {
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

function compareDecoratedComposerItems(
    a: DecoratedComposerItem,
    b: DecoratedComposerItem,
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

function sortComposerItems(
    filteredItems: LibraryItemWithCollections[],
    sortMode: SortMode
): LibraryItemWithCollections[] {
    const itemSortMode =
        sortMode === "count-desc" ? DEFAULT_SORT_MODE : sortMode;
    return filteredItems
        .map((item) => decorateComposerItem(item, itemSortMode))
        .sort((a, b) => compareDecoratedComposerItems(a, b, itemSortMode))
        .map((decorated) => decorated.item);
}

function buildBrowserGroups(
    sortedItems: LibraryItemWithCollections[],
    groupBy: EffectiveGroupByMode,
    sortMode: SortMode,
    collections?: LibraryCollectionSummary[]
): BrowserGroup[] {
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
        if (groupBy === "collection") {
            if (item.collections.length === 0) {
                const bucket = buckets.get("__uncategorized__") ?? [];
                bucket.push(item);
                buckets.set("__uncategorized__", bucket);
            } else {
                for (const collection of item.collections) {
                    const bucket = buckets.get(collection.id) ?? [];
                    bucket.push(item);
                    buckets.set(collection.id, bucket);
                }
            }
            continue;
        }

        const key = getItemGroupKey(item, groupBy);
        const bucket = buckets.get(key) ?? [];
        bucket.push(item);
        buckets.set(key, bucket);
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

function getSharedCollections(
    items: LibraryItemWithCollections[]
): LibraryCollectionTag[] {
    const [firstItem, ...remainingItems] = items;
    if (!firstItem) {
        return [];
    }

    const sharedCollections = new Map(
        firstItem.collections.map((collection) => [collection.id, collection])
    );

    for (const item of remainingItems) {
        const itemCollectionIds = new Set(
            item.collections.map((collection) => collection.id)
        );
        for (const collectionId of [...sharedCollections.keys()]) {
            if (!itemCollectionIds.has(collectionId)) {
                sharedCollections.delete(collectionId);
            }
        }
    }

    return [...sharedCollections.values()];
}

function getMediaDownloadFileExtension(
    url: string,
    contentType: string | null
): MediaDownloadFileExtension | null {
    const normalizedContentType = contentType
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();
    const contentTypeExtension =
        normalizedContentType &&
        MEDIA_DOWNLOAD_FILE_EXTENSION_BY_MIME_TYPE[normalizedContentType];
    if (contentTypeExtension) {
        return contentTypeExtension;
    }

    const pathname = tryParseUrl(url)?.pathname;
    if (!pathname) {
        return null;
    }

    let urlExtension = pathname
        .slice(pathname.lastIndexOf(".") + 1)
        .toLowerCase();
    if (urlExtension === "jpeg") {
        urlExtension = "jpg";
    }
    for (const extension of Object.values(
        MEDIA_DOWNLOAD_FILE_EXTENSION_BY_MIME_TYPE
    )) {
        if (extension === urlExtension) {
            return extension;
        }
    }

    return null;
}

function itemDateLabel(dateValue: Date | string | null | undefined): string {
    const date = parseDate(dateValue);
    if (!date) {
        return "";
    }
    return date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

async function saveLibraryItemMedia(
    item: LibraryItemWithCollections
): Promise<void> {
    if (!COBALT_SOURCES.has(item.source)) {
        throw new Error("Media downloads are not available for this source.");
    }

    const result = await downloadMedia(item.url);
    if (result.status !== ACTION_STATUS.SUCCESS) {
        throw new Error(result.message);
    }

    const response = await fetchWithTimeout(
        result.downloadUrl,
        {},
        MEDIA_DOWNLOAD_TIMEOUT_MS
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch media download (${response.status})`);
    }

    const blob = await response.blob();
    const extension = getMediaDownloadFileExtension(
        response.url || result.downloadUrl,
        response.headers.get("content-type") || blob.type
    );
    if (!extension) {
        throw new Error("Could not determine the downloaded media type.");
    }

    await saveFile(blob, {
        description: "Media file",
        extension,
        name: slugify(getLibraryItemTitle(item)) || "cache-media",
    });
}

function buildSimilarBrowserFilterState(
    state: BrowserSimilarFilterState,
    options: BrowserSimilarFilterOptions
): BrowserSimilarFilterState {
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

function defaultCollectionTriggerIcon(
    selectedCount: number,
    shouldShowSmartCollectionsIndicator: boolean
) {
    if (selectedCount === 0) {
        return <SquircleDashed aria-hidden className="size-4.5" />;
    }
    if (shouldShowSmartCollectionsIndicator) {
        return <MediaCardSmartCollectionsIndicator />;
    }
    return <Squircle aria-hidden className="size-4.5" />;
}

interface CollectionComboboxPickerProps
    extends React.ComponentProps<typeof ComboboxTrigger> {
    collections: LibraryCollectionSummary[];
    items: LibraryItemWithCollections[];
    onOpenChange?: (open: boolean) => void;
    onUpdateItemCollections: (
        itemId: string,
        collectionIds: string[]
    ) => Promise<LibraryItemCollectionsUpdateResult>;
    onUpdateItemsCollections?: (input: {
        itemIds: string[];
        nextSharedCollectionIds: string[];
        previousSharedCollectionIds: string[];
    }) => Promise<LibraryItemsCollectionsUpdateResult>;
    open?: boolean;
    showSmartCollectionsIndicator?: boolean;
}

function getArchivedAssignedStatus(count: number): string {
    return count === 1
        ? "1 assigned collection is archived"
        : `${count} assigned collections are archived`;
}

function CollectionComboboxPicker({
    collections,
    items,
    onUpdateItemsCollections,
    onUpdateItemCollections,
    open: openProp,
    onOpenChange,
    children,
    render,
    showSmartCollectionsIndicator = false,
    ...props
}: CollectionComboboxPickerProps) {
    const [isOpenInternal, setIsOpenInternal] = React.useState(false);
    const isOpen = openProp ?? isOpenInternal;
    const setIsOpen = onOpenChange ?? setIsOpenInternal;
    const sharedCollections = getSharedCollections(items);
    const selectedCollectionIds = sharedCollections.map(
        (collection) => collection.id
    );
    const selectedCount = selectedCollectionIds.length;
    const archivedAssignedCollectionCount = sharedCollections.filter(
        (collection) => collection.priority === "archive"
    ).length;
    const shouldShowSmartCollectionsIndicator =
        showSmartCollectionsIndicator && selectedCount > 0;

    const handleValueChange = useStableCallback((nextIds: string[]) => {
        const nextCollectionIds = [...nextIds];

        if (items.length === 1) {
            const [item] = items;
            if (!item) {
                return;
            }
            onUpdateItemCollections(item.id, nextCollectionIds).catch(
                (error: unknown) => {
                    log.error("Failed to update item collections", error, {
                        itemId: item.id,
                    });
                }
            );
            return;
        }

        if (!onUpdateItemsCollections) {
            throw new Error(
                "Bulk collection updates require onUpdateItemsCollections."
            );
        }

        onUpdateItemsCollections({
            itemIds: items.map((item) => item.id),
            nextSharedCollectionIds: nextCollectionIds,
            previousSharedCollectionIds: selectedCollectionIds,
        }).catch((error: unknown) => {
            log.error("Failed to update item collections", error, {
                itemIds: items.map((item) => item.id),
            });
        });
    });

    let defaultTriggerAriaLabel = "Add to collections";
    if (shouldShowSmartCollectionsIndicator) {
        defaultTriggerAriaLabel = "Smart Collections just organized this";
    } else if (selectedCount > 0) {
        defaultTriggerAriaLabel = `Edit collections (${selectedCount} selected)`;
    }

    return (
        <Combobox
            autoHighlight
            items={collections}
            multiple
            onOpenChange={setIsOpen}
            onValueChange={handleValueChange}
            open={isOpen}
            value={selectedCollectionIds}
        >
            <ComboboxTrigger
                {...props}
                render={
                    render ?? (
                        <Button
                            aria-label={defaultTriggerAriaLabel}
                            size="icon-xs"
                            variant="ghost"
                        />
                    )
                }
            >
                {children ??
                    defaultCollectionTriggerIcon(
                        selectedCount,
                        shouldShowSmartCollectionsIndicator
                    )}
            </ComboboxTrigger>
            <ComboboxPopup>
                <ComboboxInput
                    endAddon={<Kbd>S</Kbd>}
                    placeholder="Assign collections…"
                />
                <ComboboxStatus>
                    {archivedAssignedCollectionCount > 0
                        ? getArchivedAssignedStatus(
                              archivedAssignedCollectionCount
                          )
                        : null}
                </ComboboxStatus>
                <ComboboxEmpty>No matching collections</ComboboxEmpty>
                <ComboboxList>
                    <ComboboxCollection>
                        {(collection) => (
                            <ComboboxItem
                                className="group/item"
                                key={collection.id}
                                value={collection.id}
                            >
                                <div className="flex max-w-56 items-center justify-between gap-3">
                                    <span className="min-w-0 max-w-full flex-1 truncate text-foreground text-sm">
                                        {collection.name}
                                    </span>
                                    <div className="relative flex w-fit items-center justify-end pl-4">
                                        <span className="shrink-0 text-nowrap text-muted-foreground text-xs tabular-nums transition-opacity ease-out group-data-highlighted/item:opacity-0">
                                            {collection.itemCount}
                                        </span>
                                        <span className="absolute right-0 shrink-0 text-nowrap text-muted-foreground text-xs opacity-0 transition-opacity ease-out group-data-highlighted/item:opacity-100">
                                            Save
                                        </span>
                                    </div>
                                </div>
                            </ComboboxItem>
                        )}
                    </ComboboxCollection>
                </ComboboxList>
            </ComboboxPopup>
        </Combobox>
    );
}

function BrowserEmpty() {
    const { shouldShowEmptyLibraryPeek } = useBrowserContext();

    if (!shouldShowEmptyLibraryPeek) {
        return null;
    }

    return (
        <>
            <BrowserGroupHeader>
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
                    Everything you bookmark, unified and searchable. Cache is a
                    purpose-built bookmark manager designed to find what matters
                    to you. Images, videos, and links you add will appear here.
                </p>
            </BrowserGroupHeader>
            <MasonryRoot
                gap={16}
                items={EMPTY_LIBRARY_PEEK_PLACEHOLDERS}
                maxColumnCount={7}
            >
                {(placeholder, index) => (
                    <MasonryItem key={placeholder.id}>
                        <MediaCardEmptyCell data={placeholder} index={index} />
                    </MasonryItem>
                )}
            </MasonryRoot>
        </>
    );
}

function BrowserEmptyWithFilters() {
    const { shouldShowNoFilteredResults, clearLibraryPalette } =
        useBrowserContext();

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

function BrowserUnreachableProbePending() {
    const { shouldShowUnreachableProbePending } = useBrowserContext();

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

function BrowserGroupList({
    groups,
    children,
}: {
    groups: BrowserGroup[];
    children: (section: BrowserGroup) => React.ReactNode;
}) {
    return groups.map((group) => (
        <BrowserGroupProvider key={group.key} section={group}>
            {children(group)}
        </BrowserGroupProvider>
    ));
}

function BrowserGroupProvider({
    children,
    section,
}: React.PropsWithChildren<{ section: BrowserGroup }>) {
    const { collapsedSectionKeys, onToggleSection } = useBrowserContext();

    return (
        <BrowserGroupContext
            value={{
                accentKey: section.key,
                collapsed: collapsedSectionKeys.has(section.key),
                isMainResults: section.title === null,
                items: section.items,
                key: section.key,
                onToggle: () => onToggleSection(section.key),
                title: section.title ?? "Results",
            }}
        >
            {children}
        </BrowserGroupContext>
    );
}

function BrowserGroup({
    className,
    ...props
}: React.ComponentProps<"section">) {
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

function BrowserGroupHeader({
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

function BrowserGroupResults() {
    const group = useBrowserGroupContext();
    const {
        enableSectionCollapse,
        onCreateCollectionFromResults,
        onExportSectionResults,
        onExpandAllSections,
        onCollapseAllSections,
    } = useBrowserContext();

    const hasItems = group.items.length > 0;
    const canCreateCollectionFromResults =
        group.isMainResults && !!onCreateCollectionFromResults;
    const canExportSectionResults = !!onExportSectionResults;
    const shouldShowSectionMenu =
        hasItems &&
        (canCreateCollectionFromResults ||
            canExportSectionResults ||
            enableSectionCollapse);

    const handleExportSectionResults = useStableCallback(() =>
        onExportSectionResults?.(group.title, group.items)
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
                    {shouldShowSectionMenu ? (
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
                                            <ChevronDown className="size-4.5 text-muted-foreground" />
                                            Expand
                                        </MenuItem>
                                        <MenuItem
                                            disabled={group.collapsed}
                                            onClick={group.onToggle}
                                        >
                                            <ChevronUp className="size-4.5 text-muted-foreground" />
                                            Collapse
                                        </MenuItem>
                                        {onExpandAllSections ||
                                        onCollapseAllSections ? (
                                            <>
                                                <MenuSeparator />
                                                {onExpandAllSections ? (
                                                    <MenuItem
                                                        onClick={
                                                            onExpandAllSections
                                                        }
                                                    >
                                                        <ChevronsDown className="size-4.5 text-muted-foreground" />
                                                        Expand all
                                                    </MenuItem>
                                                ) : null}
                                                {onCollapseAllSections ? (
                                                    <MenuItem
                                                        onClick={
                                                            onCollapseAllSections
                                                        }
                                                    >
                                                        <ChevronsUp className="size-4.5 text-muted-foreground" />
                                                        Collapse all
                                                    </MenuItem>
                                                ) : null}
                                            </>
                                        ) : null}
                                        {canCreateCollectionFromResults ||
                                        canExportSectionResults ? (
                                            <MenuSeparator />
                                        ) : null}
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
                                {canCreateCollectionFromResults &&
                                canExportSectionResults ? (
                                    <MenuSeparator />
                                ) : null}
                                {onExportSectionResults ? (
                                    <MenuItem
                                        disabled={!hasItems}
                                        onClick={handleExportSectionResults}
                                    >
                                        <FileSpreadsheetIcon className="size-4.5 text-muted-foreground" />
                                        Export to CSV
                                    </MenuItem>
                                ) : null}
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
                    {onExpandAllSections || onCollapseAllSections ? (
                        <>
                            <ContextMenuSeparator />
                            {onExpandAllSections ? (
                                <ContextMenuItem onClick={onExpandAllSections}>
                                    <ChevronsDown className="size-4.5 text-muted-foreground" />
                                    Expand all
                                </ContextMenuItem>
                            ) : null}
                            {onCollapseAllSections ? (
                                <ContextMenuItem
                                    onClick={onCollapseAllSections}
                                >
                                    <ChevronsUp className="size-4.5 text-muted-foreground" />
                                    Collapse all
                                </ContextMenuItem>
                            ) : null}
                        </>
                    ) : null}
                </ContextMenuPopup>
            ) : null}
        </ContextMenu>
    );
}

function BrowserGroupEmpty({ className, ...props }: React.ComponentProps<"p">) {
    const { collapsed, items } = useBrowserGroupContext();

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

function BrowserGroupAIOverview({
    children,
    ...props
}: React.ComponentProps<"div">) {
    const { collapsed } = useBrowserGroupContext();

    if (collapsed) {
        return null;
    }

    return (
        <BrowserGroupHeader {...props}>
            <div className="flex items-center gap-1.5">
                <Astroid
                    aria-hidden
                    className="size-4 text-muted-foreground"
                    focusable="false"
                />
                <GradientWaveText
                    ariaLabel="Overview"
                    className="font-medium text-muted-foreground text-xs"
                >
                    Overview
                </GradientWaveText>
            </div>
            {children}
        </BrowserGroupHeader>
    );
}

function BrowserGroupAIOverviewContent() {
    const t = useGT();
    const { collapsed, items, title } = useBrowserGroupContext();
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

    const { data, isLoading, isValidating } =
        useSWR<SectionDescriptionResponse>(
            getSectionDescriptionSWRKey(payload, items.length),
            fetchSectionDescription,
            {
                dedupingInterval: 60_000,
                keepPreviousData: true,
                revalidateOnFocus: false,
                shouldRetryOnError: false,
            }
        );

    const handleToggleExpanded = useStableCallback(() => {
        setIsExpanded((prev) => !prev);
    });

    const summary = data?.summary.trim();
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
                <CopyResponseButton value={summary} />
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

interface BrowserMasonryProps {
    children: (
        data: LibraryItemWithCollections,
        index: number
    ) => React.ReactElement;
}

function BrowserMasonry({ children }: BrowserMasonryProps) {
    const { collapsed, items } = useBrowserGroupContext();
    const {
        collections,
        columnCount,
        hoveredItemIdRef,
        hoverPinnedItemIdRef,
        openPickerItemId,
        setOpenPickerItemId,
    } = useBrowserContext();
    const {
        favoriteItemIdSet,
        onCopyLink,
        onDelete,
        onFindSimilar,
        onOpenInNewTab,
        onOpenNote,
        onItemFavoriteToggle,
        onUpdateItemCollections,
        pendingDeleteItemId,
    } = useItemsContext();

    const contextValue: MediaCardEnvironmentContext = {
        collections,
        favoriteItemIdSet,
        hoveredItemIdRef,
        hoverPinnedItemIdRef,
        onCopyLink,
        onDelete,
        onFindSimilar,
        onItemFavoriteToggle,
        onOpenInNewTab,
        onOpenNote,
        onUpdateItemCollections,
        openPickerItemId,
        pendingDeleteItemId,
        setOpenPickerItemId,
    };

    if (collapsed || items.length === 0) {
        return null;
    }

    return (
        <MediaCardEnvironmentContext value={contextValue}>
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
        </MediaCardEnvironmentContext>
    );
}

function MediaCardDataProvider({
    children,
    item,
}: React.PropsWithChildren<{
    item: LibraryItemWithCollections;
}>) {
    return (
        <MediaCardDataContext
            value={{
                displayTitle: getLibraryItemPrimaryText(item),
                isNote: item.kind === ITEM_KIND_NOTE,
                item,
                previewImageUrl: itemPreviewImageUrl(item),
            }}
        >
            {children}
        </MediaCardDataContext>
    );
}

function MediaCardSmartCollectionsIndicator() {
    return (
        <svg
            aria-hidden="true"
            className="size-4.5"
            fill="none"
            focusable="false"
            role="img"
            viewBox="0 0 24 24"
        >
            <path
                d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
            />
            <path
                className="motion-safe:animate-smart-collections-indicator"
                d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9"
                pathLength={1}
            />
        </svg>
    );
}

function MediaCardEmptyCell({
    data,
    index,
}: {
    data: (typeof EMPTY_LIBRARY_PEEK_PLACEHOLDERS)[number];
    index: number;
}) {
    const opacity = Math.max(0.25, 1 - index * 0.06);

    return (
        <div className="flex flex-col" style={{ opacity }}>
            <Skeleton
                className={cn(
                    "squircle w-full rounded-xl [background:var(--color-muted)]",
                    data.aspect
                )}
            />
            <Skeleton className="mt-2 h-3 w-11/12 [background:var(--color-muted)]" />
        </div>
    );
}

function MediaPreview({
    src,
    videoSrc,
}: {
    src: string | null;
    videoSrc?: string | null;
}) {
    const dimensionsCache = useDimensionsCacheContext();
    const imgRef = React.useRef<HTMLImageElement | null>(null);
    const videoRef = React.useRef<HTMLVideoElement | null>(null);

    const [isHovered, setIsHovered] = React.useState(false);
    const [isSoundEnabled, setIsSoundEnabled] = React.useState(true);

    const [hasImageFailed, setHasImageFailed] = React.useState(false);
    const [hasVideoFailed, setHasVideoFailed] = React.useState(false);
    const [hasVideoStarted, setHasVideoStarted] = React.useState(false);
    const [dimensions, setDimensions] = React.useState<Dimensions | null>(() =>
        dimensionsCache.readCachedDimensions(src)
    );
    const [prevSrc, setPrevSrc] = React.useState(src);
    const [prevVideoSrc, setPrevVideoSrc] = React.useState(videoSrc);

    if (!Object.is(src, prevSrc)) {
        setPrevSrc(src);
        setHasImageFailed(false);
        setDimensions(dimensionsCache.readCachedDimensions(src));
    }

    if (!Object.is(videoSrc, prevVideoSrc)) {
        setPrevVideoSrc(videoSrc);
        setHasVideoStarted(false);
        setHasVideoFailed(false);
    }

    const canRenderImage = !!src && !hasImageFailed;
    const canRenderVideo = typeof videoSrc === "string" && videoSrc.length > 0;

    const shouldLoadVideo = isHovered && canRenderVideo && !hasVideoFailed;
    const isVideoLoading = !hasVideoStarted && shouldLoadVideo;

    const stopHoverPlayback = useStableCallback(() => {
        setIsHovered(false);
        const video = videoRef.current;
        if (!video) {
            return;
        }
        video.pause();
        video.currentTime = 0;
    });

    const handlePointerEnter = useStableCallback(() => {
        setIsHovered(true);
        setHasVideoFailed(false);
    });

    const handlePointerLeave = useStableCallback(() => {
        stopHoverPlayback();
    });

    const handlePointerDown = useStableCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            const ownerWindow = getOwnerWindow(event.currentTarget);
            const target = event.target;
            if (
                target instanceof ownerWindow.Element &&
                target.closest("button") !== null
            ) {
                return;
            }
            stopHoverPlayback();
        }
    );

    const handleCanPlay = useStableCallback(() => {
        setHasVideoStarted(true);
        const video = videoRef.current;
        if (video && isHovered && !hasVideoFailed) {
            video.play().catch((error: unknown) => {
                log.debug("Failed to play hover preview", { error });
            });
        }
    });

    const applyNaturalDimensions = useStableCallback(
        (img: HTMLImageElement) => {
            if (!src) {
                return;
            }
            if (img.getAttribute("src") !== src) {
                return;
            }
            const w = img.naturalWidth;
            const h = img.naturalHeight;
            if (!(w > 0 && h > 0)) {
                return;
            }
            const next: Dimensions = { h, w };
            dimensionsCache.cacheDimensions(src, next);
            setDimensions((current) =>
                current?.w === w && current.h === h ? current : next
            );
        }
    );

    const handleImageError = useStableCallback(
        (event: React.SyntheticEvent<HTMLImageElement>) => {
            if (!src || event.currentTarget.getAttribute("src") !== src) {
                return;
            }
            // Pin a default slot when nothing is known yet so virtualization
            // remounts (and MediaPlaceholder) keep a stable aspect ratio.
            setDimensions(dimensionsCache.pinDefaultDimensionsIfMissing(src));
            setHasImageFailed(true);
        }
    );

    const handleImageLoad = useStableCallback(
        (event: React.SyntheticEvent<HTMLImageElement>) => {
            applyNaturalDimensions(event.currentTarget);
        }
    );

    useIsoLayoutEffect(() => {
        const img = imgRef.current;
        if (img?.complete && img.naturalWidth > 0) {
            applyNaturalDimensions(img);
        }
    }, [applyNaturalDimensions, src]);

    const handleVideoError = useStableCallback(() => {
        const video = videoRef.current;
        const mediaError = video?.error;
        log.debug("Video source failed to load", {
            mediaError,
            networkState: video?.networkState,
            readyState: video?.readyState,
            videoSrc,
        });
        setHasVideoFailed(true);
    });

    const handleSoundToggle = useStableCallback((event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setIsSoundEnabled((prev) => !prev);
    });

    React.useEffect(() => {
        const video = videoRef.current;
        if (!(video && shouldLoadVideo)) {
            return;
        }

        video.play().catch((error: unknown) => {
            log.debug("Failed to resume hover preview", { error });
        });
    }, [shouldLoadVideo]);

    React.useEffect(() => {
        if (!shouldLoadVideo) {
            return;
        }

        const ownerDocument = getOwnerDocument(videoRef.current);
        const handleVisibilityChange = () => {
            if (ownerDocument.hidden) {
                stopHoverPlayback();
                return;
            }
            const previewRoot = videoRef.current?.parentElement;
            if (previewRoot?.matches(":hover")) {
                setIsHovered(true);
            }
        };

        ownerDocument.addEventListener(
            "visibilitychange",
            handleVisibilityChange
        );
        return () => {
            ownerDocument.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );
            const video = videoRef.current;
            if (!video) {
                return;
            }
            video.pause();
            video.currentTime = 0;
        };
    }, [shouldLoadVideo, stopHoverPlayback]);

    const SoundIcon = isSoundEnabled ? Volume2Icon : VolumeXIcon;
    const displayDimensions = resolveDisplayDimensions(dimensions);

    return (
        <div
            className="relative w-full break-inside-avoid"
            onPointerDown={handlePointerDown}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            style={{
                aspectRatio: `${displayDimensions.w} / ${displayDimensions.h}`,
            }}
        >
            {canRenderImage ? (
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: resource load/error lifecycle is not user interaction; upstream jsx-a11y exempts img onError/onLoad
                <img
                    alt=""
                    className="drag-none size-full object-cover"
                    decoding="async"
                    draggable="false"
                    fetchPriority="auto"
                    height={displayDimensions.h}
                    // Remount on src change so aborted prior loads cannot
                    // fire stale error/load events against the new URL.
                    key={src}
                    loading="eager"
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                    ref={imgRef}
                    src={src ?? undefined}
                    style={{ cursor: "pointer" }}
                    width={displayDimensions.w}
                />
            ) : (
                <Placeholder className="-z-1 size-full" />
            )}
            {shouldLoadVideo ? (
                <>
                    <video
                        className="squircle drag-none pointer-events-none absolute inset-0 size-full rounded-xl object-contain transition-opacity ease-out"
                        crossOrigin="use-credentials"
                        draggable="false"
                        loop
                        muted={!isSoundEnabled}
                        onCanPlay={handleCanPlay}
                        onError={handleVideoError}
                        playsInline
                        preload="none"
                        ref={videoRef}
                        src={videoSrc}
                    />
                    {isVideoLoading ? (
                        <div
                            className={cn(
                                "pointer-events-none absolute bottom-2 left-2 rounded-xl bg-black/50 text-white opacity-0 transition-opacity ease-out",
                                { "opacity-100": isHovered }
                            )}
                        >
                            <Spinner
                                aria-hidden
                                className="m-1.5 size-4"
                                focusable="false"
                            />
                        </div>
                    ) : (
                        <Button
                            aria-label={
                                isSoundEnabled
                                    ? "Mute video preview"
                                    : "Enable video preview sound"
                            }
                            aria-pressed={isSoundEnabled}
                            className={cn(
                                "pointer-events-auto absolute bottom-2 left-2 rounded-xl bg-black/50 text-white opacity-0 transition-opacity ease-out hover:bg-black/60 focus-visible:opacity-100 focus-visible:ring-ring/70",
                                { "opacity-100": isHovered }
                            )}
                            onClick={handleSoundToggle}
                            size="icon-sm"
                            variant="ghost"
                        >
                            <SoundIcon
                                aria-hidden
                                className="size-4"
                                focusable="false"
                            />
                        </Button>
                    )}
                </>
            ) : null}
        </div>
    );
}

function MediaCardInteractionProvider({ children }: React.PropsWithChildren) {
    const { item } = useMediaCardDataContext();
    const [isZoomed, setIsZoomed] = React.useState(false);
    const [isDownloading, startDownloadTransition] = React.useTransition();
    const [hasDownloadError, setHasDownloadError] = React.useState(false);

    const handleDownload = useStableCallback(() => {
        setHasDownloadError(false);
        startDownloadTransition(async () => {
            try {
                await saveLibraryItemMedia(item);
            } catch (error) {
                setHasDownloadError(true);
                log.error("Failed to prepare media download", error, {
                    itemId: item.id,
                    url: item.url,
                });
            }
        });
    });

    const handleZoomChange = useStableCallback((nextZoomed: boolean) => {
        if (!nextZoomed) {
            setIsZoomed(false);
        }
    });

    const handleZoomIn = useStableCallback(() => {
        setIsZoomed(true);
    });

    return (
        <>
            <MediaCardInteractionContext
                value={{
                    isDownloading,
                    isZoomed,
                    onDownload: handleDownload,
                    onZoomChange: handleZoomChange,
                    onZoomIn: handleZoomIn,
                }}
            >
                {children}
            </MediaCardInteractionContext>
            {hasDownloadError ? (
                <p
                    aria-atomic="true"
                    aria-live="assertive"
                    className="mt-1 px-1 text-destructive text-xs leading-tight"
                    role="alert"
                >
                    <T>Couldn't download this media. Please try again.</T>
                </p>
            ) : null}
        </>
    );
}

function MediaCardColorsBadge({ value }: { value: string }) {
    const { copyToClipboard, isCopied } = useCopyToClipboard();

    const handleCopy = useStableCallback(() => copyToClipboard(value));

    return (
        <Avatar
            className="relative size-4.5 cursor-pointer overflow-visible"
            onClick={handleCopy}
        >
            <AvatarFallback style={{ backgroundColor: value }}>
                {isCopied ? (
                    <>
                        <Check className="size-3 text-black invert" />
                        <span className="absolute -bottom-4 text-nowrap rounded-xl bg-background text-[11px] text-success-foreground">
                            Copied!
                        </span>
                    </>
                ) : null}
            </AvatarFallback>
        </Avatar>
    );
}

function MediaCardColorsPalette({ src }: { src: string }) {
    const { data } = useSWR(src, getImageColors, {
        keepPreviousData: true,
    });

    if (!data?.length) {
        return null;
    }

    return (
        <AvatarGroup className="justify-end -space-x-1">
            {data.map(({ hex, name }) => (
                <MediaCardColorsBadge key={name} value={hex} />
            ))}
        </AvatarGroup>
    );
}

function MediaCardMenuDetails() {
    const { isNote, item, previewImageUrl } = useMediaCardDataContext();

    const addedLabel = itemDateLabel(item.scrapedAt ?? item.createdAt);
    const createdLabel = itemDateLabel(item.createdAt);

    return (
        <Collapsible>
            <CollapsibleTrigger
                render={
                    <Button
                        className="max-w-60 justify-between rounded-xl"
                        variant="ghost"
                    />
                }
            >
                <span className="block min-w-0 truncate text-xs">
                    {getLibraryItemPrimaryText(item)}
                </span>
                <ChevronDown className="ml-auto inline-block size-4" />
            </CollapsibleTrigger>
            <CollapsiblePanel className="px-2.5 text-[11px] text-muted-foreground">
                {isNote ? null : (
                    <span className="inline-block min-w-0 max-w-42 truncate py-0.5 text-muted-foreground underline">
                        {item.url}
                    </span>
                )}
                <div className="flex items-center justify-between gap-3 py-0.5">
                    <span>Created</span>
                    <span className="text-foreground tabular-nums">
                        {createdLabel}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-3 py-0.5">
                    <span>Added</span>
                    <span className="text-foreground tabular-nums">
                        {addedLabel}
                    </span>
                </div>
                {previewImageUrl ? (
                    <div className="flex items-center justify-between gap-3 py-0.5 pb-3">
                        <span>Palette</span>
                        <MediaCardColorsPalette src={previewImageUrl} />
                    </div>
                ) : null}
            </CollapsiblePanel>
        </Collapsible>
    );
}

function MediaCardMenuActionList() {
    const data = useMediaCardDataContext();
    const visiblePlugins = MEDIA_CARD_ACTION_PLUGINS.filter((plugin) =>
        plugin.isAvailable(data)
    );
    return (
        <>
            {visiblePlugins.map((plugin) => (
                <React.Fragment key={plugin.id}>
                    {plugin.separatorBefore ? <MenuSeparator /> : null}
                    {plugin.render("menu")}
                </React.Fragment>
            ))}
        </>
    );
}

function MediaCardContextMenuActionList() {
    const data = useMediaCardDataContext();
    const visiblePlugins = MEDIA_CARD_ACTION_PLUGINS.filter((plugin) =>
        plugin.isAvailable(data)
    );
    return (
        <>
            {visiblePlugins.map((plugin) => (
                <React.Fragment key={plugin.id}>
                    {plugin.separatorBefore ? <ContextMenuSeparator /> : null}
                    {plugin.render("contextMenu")}
                </React.Fragment>
            ))}
        </>
    );
}

function MediaCardMenuCommentTextarea() {
    const { isNote, item } = useMediaCardDataContext();
    const { isOverlayOpen } = useMediaCardSurfaceContext();

    if (isNote) {
        return null;
    }

    return <CommentTextarea isOpen={isOverlayOpen} item={item} />;
}

function MediaCardMenuContent() {
    return (
        <>
            <MediaCardMenuDetails />
            <MediaCardMenuCommentTextarea />
            <MenuSeparator />
            <MediaCardMenuActionList />
        </>
    );
}

function MediaCardContextMenuContent() {
    return (
        <>
            <MediaCardMenuDetails />
            <MediaCardMenuCommentTextarea />
            <ContextMenuSeparator />
            <MediaCardContextMenuActionList />
        </>
    );
}

function MediaCardMenuSurface() {
    const { displayTitle } = useMediaCardDataContext();
    const { isMenuOpen, onMenuOpenChange } = useMediaCardSurfaceContext();

    return (
        <Menu modal={false} onOpenChange={onMenuOpenChange} open={isMenuOpen}>
            <MenuTrigger
                render={
                    <Button
                        className="w-full min-w-0 flex-1 justify-start overflow-clip text-nowrap px-0 text-left text-[11px]!"
                        size="xs"
                        title={displayTitle}
                        type="button"
                        variant="ghost"
                    />
                }
            >
                <Ticker>{displayTitle}</Ticker>
            </MenuTrigger>
            <MenuPopup>
                <MediaCardMenuContent />
            </MenuPopup>
        </Menu>
    );
}

function MediaCardContextMenuSurface({ children }: React.PropsWithChildren) {
    const { item } = useMediaCardDataContext();
    const { hoveredItemIdRef, hoverPinnedItemIdRef, openPickerItemId } =
        useMediaCardEnvironmentContext();

    const [isMenuOpen, setIsMenuOpen] = React.useState(false);
    const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false);

    const isPointerOverCardRef = React.useRef(false);
    const isPickerOpen = openPickerItemId === item.id;
    const isHoverPinned = isMenuOpen || isContextMenuOpen || isPickerOpen;

    React.useEffect(
        () => () => {
            if (hoveredItemIdRef.current === item.id) {
                hoveredItemIdRef.current = null;
            }
            if (hoverPinnedItemIdRef.current === item.id) {
                hoverPinnedItemIdRef.current = null;
            }
        },
        [hoveredItemIdRef, hoverPinnedItemIdRef, item.id]
    );

    React.useEffect(() => {
        if (isHoverPinned) {
            hoverPinnedItemIdRef.current = item.id;
            hoveredItemIdRef.current = item.id;
            return;
        }
        if (hoverPinnedItemIdRef.current !== item.id) {
            return;
        }
        hoverPinnedItemIdRef.current = null;
        if (
            !isPointerOverCardRef.current &&
            hoveredItemIdRef.current === item.id
        ) {
            hoveredItemIdRef.current = null;
        }
    }, [hoveredItemIdRef, hoverPinnedItemIdRef, isHoverPinned, item.id]);

    const handleMouseEnter = useStableCallback(() => {
        isPointerOverCardRef.current = true;
        const pinnedId = hoverPinnedItemIdRef.current;
        if (pinnedId !== null && pinnedId !== item.id) {
            return;
        }
        hoveredItemIdRef.current = item.id;
    });

    const handleMouseLeave = useStableCallback(() => {
        isPointerOverCardRef.current = false;
        if (hoveredItemIdRef.current === item.id && !isHoverPinned) {
            hoveredItemIdRef.current = null;
        }
    });

    return (
        <MediaCardSurfaceContext
            value={{
                isMenuOpen,
                isOverlayOpen: isMenuOpen || isContextMenuOpen,
                onMenuOpenChange: setIsMenuOpen,
            }}
        >
            <ContextMenu onOpenChange={setIsContextMenuOpen}>
                <ContextMenuTrigger
                    className="group relative flex shrink-0 flex-col ease-out before:absolute before:-inset-x-2 before:-top-2 before:bottom-0 before:-z-10 before:rounded-xl before:bg-muted/50 before:opacity-0 before:transition-transform before:ease-out hover:before:opacity-100 focus-visible:outline-none active:before:scale-x-[0.99] active:before:scale-y-[0.98] active:before:opacity-80!"
                    onMouseEnter={handleMouseEnter}
                    onMouseLeave={handleMouseLeave}
                    role="group"
                >
                    {children}
                </ContextMenuTrigger>
                <ContextMenuPopup>
                    <MediaCardContextMenuContent />
                </ContextMenuPopup>
            </ContextMenu>
        </MediaCardSurfaceContext>
    );
}

function MediaCardPreview(props: React.ComponentProps<"div">) {
    const { isNote, item, previewImageUrl } = useMediaCardDataContext();
    const { isZoomed, onZoomChange } = useMediaCardInteractionContext();
    const { isLastVisited } = useLastVisited();

    const hasNoteContent = (item.noteContentText ?? "").trim().length > 0;
    const previewVideoUrl = itemPreviewVideoUrl(item);

    return (
        // biome-ignore lint/a11y/useSemanticElements: ControlledZoom conflicts with anchor elements
        <div
            {...props}
            aria-label={
                isNote
                    ? item.noteContentText?.trim() || "Note"
                    : getLibraryItemTitle(item)
            }
            className={cn(
                "squircle relative flex flex-col overflow-clip rounded-xl focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
                { "bg-muted/90": isNote }
            )}
            role="link"
            tabIndex={0}
        >
            {isNote ? (
                <div className="mask-b-from-[calc(100%-var(--fade-size))] size-full max-h-60 select-none p-4 [--fade-size:5rem]">
                    <Streamdown className="text-[11px] text-foreground">
                        {hasNoteContent && item.noteContentHtml
                            ? item.noteContentHtml
                            : "Tap to start writing in this note"}
                    </Streamdown>
                </div>
            ) : (
                <>
                    <ControlledZoom
                        isZoomed={isZoomed}
                        onZoomChange={onZoomChange}
                    >
                        <MediaPreview
                            src={previewImageUrl}
                            videoSrc={previewVideoUrl}
                        />
                    </ControlledZoom>
                    {isLastVisited(item.id) ? (
                        <span className="absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-xl bg-black/45 px-1.5 py-px font-medium text-white text-xs leading-normal">
                            <T>Last visited</T>
                            <ArrowUpRight
                                aria-hidden
                                className="hidden size-4 group-hover:inline-block"
                                focusable="false"
                            />
                        </span>
                    ) : (
                        <span className="absolute right-2 bottom-2 rounded-xl bg-black/50 px-1.5 py-px font-medium text-white text-xs leading-normal opacity-0 group-hover:opacity-100">
                            <ArrowUpRight
                                aria-hidden
                                className="size-4"
                                focusable="false"
                            />
                        </span>
                    )}
                </>
            )}
        </div>
    );
}

function MediaCardOpenTarget() {
    const { isNote, item } = useMediaCardDataContext();
    const { onOpenInNewTab, onOpenNote } = useMediaCardEnvironmentContext();
    const { markVisited } = useLastVisited();

    const handleOpen = useStableCallback(() => {
        if (isNote) {
            onOpenNote(item);
            return;
        }
        onOpenInNewTab(item);
        markVisited(item.id);
    });

    const handleOpenTargetClick = useStableCallback(
        (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
            handleOpen();
        }
    );

    const handleOpenTargetKeyDown = useStableCallback(
        (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === "Enter") {
                handleOpen();
            }
        }
    );

    return (
        <MediaCardPreview
            onClick={handleOpenTargetClick}
            onKeyDown={handleOpenTargetKeyDown}
        />
    );
}

function MediaCardActions() {
    const { item } = useMediaCardDataContext();
    const {
        collections,
        onUpdateItemCollections,
        openPickerItemId,
        setOpenPickerItemId,
    } = useMediaCardEnvironmentContext();

    const isPickerOpen = openPickerItemId === item.id;

    const handlePickerOpenChange = useStableCallback((nextOpen: boolean) => {
        setOpenPickerItemId(nextOpen ? item.id : null);
    });

    return (
        <div className="flex items-center py-1.5">
            <CollectionComboboxPicker
                collections={collections}
                items={[item]}
                onOpenChange={handlePickerOpenChange}
                onUpdateItemCollections={onUpdateItemCollections}
                open={isPickerOpen}
                showSmartCollectionsIndicator={
                    item.collections.length > 0 &&
                    isRecentlySmartCollected(item.smartCollectedAt)
                }
            />
            <MediaCardMenuSurface />
        </div>
    );
}

function MediaCardLocked({ data }: { data: LockedLibraryPreviewPlaceholder }) {
    return (
        <div className="relative flex flex-col overflow-clip rounded-xl ring-1 ring-border/30">
            {data.kind === "note" ? (
                <div className="relative min-h-56 bg-linear-to-br from-note-surface-from via-background to-note-surface-to p-4">
                    <div className="absolute inset-0 bg-background/30" />
                    <div className="relative flex h-full flex-col gap-3">
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-[86%]" />
                            <Skeleton className="h-3 w-[74%]" />
                            <Skeleton className="h-3 w-[68%]" />
                            <Skeleton className="h-3 w-[56%]" />
                        </div>
                    </div>
                </div>
            ) : (
                <div
                    className={cn(
                        "relative overflow-clip bg-linear-to-br from-muted/75 via-card to-muted/45",
                        data.aspect
                    )}
                >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.45),transparent_38%)]" />
                    <div className="absolute inset-0 bg-background/25" />
                    <div className="relative flex h-full flex-col justify-between p-4">
                        <div className="space-y-2">
                            <Skeleton className="h-3 w-[88%]" />
                            <Skeleton className="h-3 w-[62%]" />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function MediaCardFavoriteAction({
    variant,
}: {
    variant: "menu" | "contextMenu";
}) {
    const { handleToggle, isFavorite } = useMediaCardFavoriteAction();
    const content = (
        <>
            <Star
                className={cn(
                    "size-4.5 text-muted-foreground",
                    isFavorite && "fill-current"
                )}
            />
            {isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            <Kbd className="ml-auto">
                <AltKbd />F
            </Kbd>
        </>
    );
    return variant === "menu" ? (
        <MenuItem onClick={handleToggle}>{content}</MenuItem>
    ) : (
        <ContextMenuItem onClick={handleToggle}>{content}</ContextMenuItem>
    );
}

function MediaCardNoteAction({ variant }: { variant: "menu" | "contextMenu" }) {
    const handleOpenNote = useMediaCardNoteAction();
    const content = (
        <>
            <FilePenLineIcon className="size-4.5 text-muted-foreground" />
            Edit note
        </>
    );
    return variant === "menu" ? (
        <MenuItem onClick={handleOpenNote}>{content}</MenuItem>
    ) : (
        <ContextMenuItem onClick={handleOpenNote}>{content}</ContextMenuItem>
    );
}

function MediaCardQuickLookAction({
    variant,
}: {
    variant: "menu" | "contextMenu";
}) {
    const { displayTitle, item } = useMediaCardDataContext();

    const handleOpen = useStableCallback(() => {
        openQuickLook({
            description: getLibraryItemDomain(item.url),
            title: displayTitle,
            url: item.url,
        });
    });
    const content = (
        <>
            <EyeIcon className="size-4.5 text-muted-foreground" />
            Quick Look
            <Kbd className="ml-auto">
                <AltKbd />E
            </Kbd>
        </>
    );
    return variant === "menu" ? (
        <MenuItem onClick={handleOpen}>{content}</MenuItem>
    ) : (
        <ContextMenuItem onClick={handleOpen}>{content}</ContextMenuItem>
    );
}

function MediaCardZoomAction({ variant }: { variant: "menu" | "contextMenu" }) {
    const { onZoomIn } = useMediaCardInteractionContext();
    const content = (
        <>
            <ZoomIn className="size-4.5 text-muted-foreground" />
            Zoom in
        </>
    );
    return variant === "menu" ? (
        <MenuItem onClick={onZoomIn}>{content}</MenuItem>
    ) : (
        <ContextMenuItem onClick={onZoomIn}>{content}</ContextMenuItem>
    );
}

function MediaCardOpenLinkAction({
    variant,
}: {
    variant: "menu" | "contextMenu";
}) {
    const { SourceIcon, handleOpenInNewTab } = useMediaCardLinkActions();
    const content = (
        <>
            {SourceIcon ? (
                <SourceIcon className="size-4 text-muted-foreground" />
            ) : (
                <ExternalLinkIcon className="size-4.5 text-muted-foreground" />
            )}
            Open in New Tab
            <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
        </>
    );
    return variant === "menu" ? (
        <MenuItem className="cursor-alias" onClick={handleOpenInNewTab}>
            {content}
        </MenuItem>
    ) : (
        <ContextMenuItem className="cursor-alias" onClick={handleOpenInNewTab}>
            {content}
        </ContextMenuItem>
    );
}

function MediaCardCopyLinkAction({
    variant,
}: {
    variant: "menu" | "contextMenu";
}) {
    const { handleCopyLink } = useMediaCardLinkActions();
    const content = (
        <>
            <LinkIcon className="size-4.5 text-muted-foreground" />
            Copy link URL
        </>
    );
    return variant === "menu" ? (
        <MenuItem onClick={handleCopyLink}>{content}</MenuItem>
    ) : (
        <ContextMenuItem onClick={handleCopyLink}>{content}</ContextMenuItem>
    );
}

function MediaCardDownloadAction({
    variant,
}: {
    variant: "menu" | "contextMenu";
}) {
    const { isDownloading, onDownload } = useMediaCardInteractionContext();
    const content = (
        <>
            <DownloadIcon className="size-4.5 text-muted-foreground" />
            {isDownloading ? "Downloading…" : "Download"}
        </>
    );
    return variant === "menu" ? (
        <MenuItem disabled={isDownloading} onClick={onDownload}>
            {content}
        </MenuItem>
    ) : (
        <ContextMenuItem disabled={isDownloading} onClick={onDownload}>
            {content}
        </ContextMenuItem>
    );
}

function MediaCardFindSimilarAction({
    variant,
}: {
    variant: "menu" | "contextMenu";
}) {
    const handleFindSimilar = useMediaCardFindSimilarAction();
    const content = (
        <>
            <SearchIcon className="size-4.5 text-muted-foreground" />
            Find similar
        </>
    );
    return variant === "menu" ? (
        <MenuItem onClick={handleFindSimilar}>{content}</MenuItem>
    ) : (
        <ContextMenuItem onClick={handleFindSimilar}>{content}</ContextMenuItem>
    );
}

function MediaCardWaybackAction({
    variant,
}: {
    variant: "menu" | "contextMenu";
}) {
    const {
        handleWayback180,
        handleWayback30,
        handleWayback365,
        handleWayback90,
        handleWaybackAll,
    } = useMediaCardWaybackActions();
    const menuContent = (
        <>
            <History className="size-4.5 text-muted-foreground" />
            Previous versions
        </>
    );
    if (variant === "menu") {
        return (
            <MenuSub>
                <MenuSubTrigger>{menuContent}</MenuSubTrigger>
                <MenuSubPopup>
                    <MenuGroup>
                        <MenuGroupLabel>Wayback Machine</MenuGroupLabel>
                        <MenuItem onClick={handleWayback30}>
                            <History className="size-4 text-muted-foreground" />{" "}
                            1 month ago
                        </MenuItem>
                        <MenuItem onClick={handleWayback90}>
                            <History className="size-4 text-muted-foreground" />{" "}
                            3 months ago
                        </MenuItem>
                        <MenuItem onClick={handleWayback180}>
                            <History className="size-4 text-muted-foreground" />{" "}
                            6 months ago
                        </MenuItem>
                        <MenuItem onClick={handleWayback365}>
                            <History className="size-4 text-muted-foreground" />{" "}
                            1 year ago
                        </MenuItem>
                        <MenuItem onClick={handleWaybackAll}>
                            <History className="size-4 text-muted-foreground" />
                            View all snapshots
                        </MenuItem>
                    </MenuGroup>
                </MenuSubPopup>
            </MenuSub>
        );
    }
    return (
        <ContextMenuSub>
            <ContextMenuSubTrigger>{menuContent}</ContextMenuSubTrigger>
            <ContextMenuSubPopup>
                <ContextMenuGroup>
                    <ContextMenuGroupLabel>
                        Wayback Machine
                    </ContextMenuGroupLabel>
                    <ContextMenuItem onClick={handleWayback30}>
                        <History className="size-4 text-muted-foreground" /> 1
                        month ago
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleWayback90}>
                        <History className="size-4 text-muted-foreground" /> 3
                        months ago
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleWayback180}>
                        <History className="size-4 text-muted-foreground" /> 6
                        months ago
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleWayback365}>
                        <History className="size-4 text-muted-foreground" /> 1
                        year ago
                    </ContextMenuItem>
                    <ContextMenuItem onClick={handleWaybackAll}>
                        <History className="size-4 text-muted-foreground" />
                        View all snapshots
                    </ContextMenuItem>
                </ContextMenuGroup>
            </ContextMenuSubPopup>
        </ContextMenuSub>
    );
}

function MediaCardDeleteAction({
    variant,
}: {
    variant: "menu" | "contextMenu";
}) {
    const { handleDelete, isDeletePending } = useMediaCardDeleteAction();
    const content = (
        <>
            {isDeletePending ? <T>Deleting…</T> : <T>Delete</T>}
            <Kbd className="ml-auto">
                <CmdKbd />⌫
            </Kbd>
        </>
    );
    return variant === "menu" ? (
        <MenuItem disabled={isDeletePending} onClick={handleDelete}>
            {content}
        </MenuItem>
    ) : (
        <ContextMenuItem disabled={isDeletePending} onClick={handleDelete}>
            {content}
        </ContextMenuItem>
    );
}

interface DeleteItemDialogProps {
    isDeletePending: boolean;
    onConfirmDelete: () => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
    pendingDeleteItem: LibraryItemWithCollections | null;
}

function DeleteItemDialog({
    isDeletePending,
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
                        <T>Delete?</T>
                    </DialogTitle>
                    <DialogDescription>
                        <T>
                            <Var>
                                {pendingDeleteItem?.noteContentText?.trim() ||
                                    pendingDeleteItem?.caption?.trim() ||
                                    pendingDeleteItem?.url ||
                                    "This saved item"}
                            </Var>{" "}
                            will be moved to Recently deleted. You have 30 days
                            to restore it before it's permanently deleted. This
                            only removes it from your library, not from the
                            original platform.
                        </T>
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <DialogClose
                        disabled={isDeletePending}
                        render={<Button variant="ghost" />}
                    >
                        <T>Cancel</T>
                    </DialogClose>
                    <Button
                        isLoading={isDeletePending}
                        onClick={onConfirmDelete}
                        variant="destructive"
                    >
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
    collections: LibraryCollectionSummary[];
    createResultsDescriptionDraft: string;
    createResultsDescriptionId: string;
    createResultsError: string | null;
    createResultsNameDraft: string;
    createResultsNameInputId: string;
    isCreatingResultsCollection: boolean;
    onCreateCollectionFromResultsSubmit: () => void;
    onOpenChange: (open: boolean) => void;
    onUpdateCreateResultsDescriptionDraft: (description: string) => void;
    onUpdateCreateResultsError: (error: string | null) => void;
    onUpdateCreateResultsNameDraft: (name: string) => void;
    onUpdateItemCollections: (
        itemId: string,
        collectionIds: string[]
    ) => Promise<LibraryItemCollectionsUpdateResult>;
    onUpdateItemsCollections: (input: {
        itemIds: string[];
        nextSharedCollectionIds: string[];
        previousSharedCollectionIds: string[];
    }) => Promise<LibraryItemsCollectionsUpdateResult>;
    open: boolean;
    resultItemCount: number;
    visibleResultItems: LibraryItemWithCollections[];
}

function CreateFromResultsCollectionDialog({
    collections,
    createResultsDescriptionDraft,
    createResultsDescriptionId,
    createResultsError,
    createResultsNameDraft,
    createResultsNameInputId,
    isCreatingResultsCollection,
    onCreateCollectionFromResultsSubmit,
    onOpenChange,
    onUpdateCreateResultsDescriptionDraft,
    onUpdateCreateResultsError,
    onUpdateCreateResultsNameDraft,
    onUpdateItemCollections,
    onUpdateItemsCollections,
    open,
    resultItemCount,
    visibleResultItems,
}: CreateFromResultsCollectionDialogProps) {
    const handleResultsFormSubmit = useStableCallback(
        (event: React.ChangeEvent<HTMLFormElement>) => {
            event.preventDefault();
            onCreateCollectionFromResultsSubmit();
        }
    );

    const handleResultsNameChange = useStableCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            onUpdateCreateResultsNameDraft(event.currentTarget.value);
            if (createResultsError) {
                onUpdateCreateResultsError(null);
            }
        }
    );

    const handleResultsDescriptionChange = useStableCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            onUpdateCreateResultsDescriptionDraft(event.currentTarget.value);
        }
    );

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
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
                                New collection with {resultItemCount} current
                                result
                                {resultItemCount === 1 ? "" : "s"}
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
                                className="-mx-[calc(--spacing(3)-1px)] *:resize-none"
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
                        <CollectionComboboxPicker
                            collections={collections}
                            items={visibleResultItems}
                            onUpdateItemCollections={onUpdateItemCollections}
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
                        </CollectionComboboxPicker>
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

interface BrowserContentProps extends React.PropsWithChildren {
    connectedIntegrationCount: number;
    lockedItemCount: number;
    totalItemCount: number;
}

export function BrowserContent({
    children,
    connectedIntegrationCount,
    lockedItemCount,
    totalItemCount,
}: BrowserContentProps) {
    const { items, setItems } = useItemsStateContext();
    const { hasAccess } = useSubscriptionAccess();
    const isExtensionInstalled = useIsExtensionInstalled();
    const paletteCaretTimeout = useTimeout();
    const unreachableProbeTimeout = useTimeout();

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
    } = useLibraryItemIndexes(items);
    const hoverHotkeySurface = useHoverHotkeySurface();

    const {
        handleCreateCollectionFromResults,
        handleToggleItemFavorite,
        handleUpdateItemCollections,
        handleUpdateItemsCollections,
    } = useCollectionMutations({
        allCollections,
        items,
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
    const { lastVisitedItemIds } = useLastVisited();
    const { clearSearchHistory, recordSearchTerm, searchHistory } =
        useSearchHistory();
    const [isRemoveDuplicatesDialogOpen, setIsRemoveDuplicatesDialogOpen] =
        React.useState(false);
    const [pendingRemoveDuplicateIds, setPendingRemoveDuplicateIds] =
        React.useState<string[]>([]);
    const [isRemovingDuplicates, startRemoveDuplicatesTransition] =
        React.useTransition();
    const [unreachableProbe, setUnreachableProbe] = React.useState({
        checked: 0,
        isActive: false,
        probeFailed: false,
        total: 0,
    });
    const unreachableProbeVersionRef = React.useRef(0);
    const itemsRef = React.useRef(items);
    const [paletteSection, setPaletteSection] =
        React.useState<PaletteSection>("search");
    const [composerAttachments, setComposerAttachments] = React.useState<
        ComposerAttachment[]
    >([]);
    const [askCacheResponse, setAskCacheResponse] =
        React.useState<AskCacheResponseState | null>(null);

    const [openPickerItemId, setOpenPickerItemId] = React.useState<
        string | null
    >(null);
    const hoveredItemIdRef = React.useRef<string | null>(null);
    const hoverPinnedItemIdRef = React.useRef<string | null>(null);

    const [isCreateResultsDialogOpen, setIsCreateResultsDialogOpen] =
        React.useState(false);
    const [createResultsNameDraft, setCreateResultsNameDraft] =
        React.useState("");
    const [createResultsDescriptionDraft, setCreateResultsDescriptionDraft] =
        React.useState("");
    const [createResultsError, setCreateResultsError] = React.useState<
        string | null
    >(null);

    const inputRef = React.useRef<HTMLInputElement>(null);
    const composerInputActionsRef = React.useRef<ComposerInputActions | null>(
        null
    );
    const composerAttachmentsRef = React.useRef<ComposerAttachment[]>([]);
    const askCacheRequestVersionRef = React.useRef(0);

    const createResultsNameInputId = React.useId();
    const createResultsDescriptionId = React.useId();

    const setComposerOpen = useStableCallback((value: boolean) => {
        if (value) {
            composerInputActionsRef.current?.open();
            return;
        }
        composerInputActionsRef.current?.close();
    });

    const {
        handleConfirmDelete,
        handleCopyLink,
        handleDeleteDialogOpenChange,
        handleOpenInNewTab,
        handleRequestDelete,
        isDeletePending,
        pendingDeleteItem,
    } = useLibraryItemActions({
        onDeleteSuccess: mergeCollectionSummaries,
        removeItems: (itemIds) =>
            setItems((current) =>
                current.filter((item) => !itemIds.includes(item.id))
            ),
    });
    const pendingDeleteItemIdRef = React.useRef<string | null>(
        pendingDeleteItem?.id ?? null
    );

    React.useEffect(() => {
        itemsRef.current = items;
        composerAttachmentsRef.current = composerAttachments;
        pendingDeleteItemIdRef.current = pendingDeleteItem?.id ?? null;
    });

    const [
        isCreatingResultsCollection,
        startCreateResultsCollectionTransition,
    ] = React.useTransition();

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

    React.useEffect(() => {
        if (!unreachableFilterEnabled) {
            unreachableProbeVersionRef.current += 1;
            setUnreachableProbe({
                checked: 0,
                isActive: false,
                probeFailed: false,
                total: 0,
            });
            return;
        }

        const version = unreachableProbeVersionRef.current + 1;
        unreachableProbeVersionRef.current = version;

        // Track pending sleeps so cleanup can settle them: a cleared timeout
        // never fires its callback, which would otherwise leave `run()` awaiting
        // a promise that never settles and keep the loop closure alive.
        const pendingSleepResolvers = new Set<() => void>();

        const sleep = (ms: number) =>
            new Promise<void>((resolve) => {
                pendingSleepResolvers.add(resolve);
                unreachableProbeTimeout.start(ms, () => {
                    pendingSleepResolvers.delete(resolve);
                    resolve();
                });
            });

        // Local set so the async loop does not re-probe the same batch while
        // waiting for React to commit `setItems` into `itemsRef`.
        const probedItemIds = new Set<string>();

        const run = async () => {
            let consecutiveFailures = 0;

            while (unreachableProbeVersionRef.current === version) {
                const currentItems = itemsRef.current;
                const probeableItems = currentItems.filter((item) =>
                    isLinkProbeCandidate(item)
                );
                const candidates = probeableItems.filter(
                    (item) =>
                        !probedItemIds.has(item.id) &&
                        needsLinkReachabilityProbe(item)
                );
                const totalProbeable = probeableItems.length;
                const checked = totalProbeable - candidates.length;

                if (candidates.length === 0) {
                    setUnreachableProbe({
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

                setUnreachableProbe({
                    checked,
                    isActive: true,
                    probeFailed: false,
                    total: totalProbeable,
                });

                const batch = candidates.slice(0, LINK_REACHABILITY_BATCH_MAX);
                let result: LibraryItemsReachabilityProbeResult;
                try {
                    result = await probeLibraryItemsReachabilityAction({
                        itemIds: batch.map((item) => item.id),
                    });
                } catch (error) {
                    if (unreachableProbeVersionRef.current !== version) {
                        return;
                    }
                    log.error("Link reachability probe threw", error);
                    consecutiveFailures += 1;
                    if (consecutiveFailures > LINK_PROBE_MAX_RETRIES) {
                        setUnreachableProbe({
                            checked,
                            isActive: false,
                            probeFailed: true,
                            total: totalProbeable,
                        });
                        return;
                    }
                    await sleep(
                        LINK_PROBE_RETRY_BACKOFF_BASE_MS *
                            2 ** (consecutiveFailures - 1)
                    );
                    continue;
                }

                if (unreachableProbeVersionRef.current !== version) {
                    return;
                }

                if (result.status !== ACTION_STATUS.SUCCESS) {
                    log.error("Link reachability probe failed", {
                        message: result.message,
                    });
                    consecutiveFailures += 1;
                    if (consecutiveFailures > LINK_PROBE_MAX_RETRIES) {
                        setUnreachableProbe({
                            checked,
                            isActive: false,
                            probeFailed: true,
                            total: totalProbeable,
                        });
                        return;
                    }
                    await sleep(
                        LINK_PROBE_RETRY_BACKOFF_BASE_MS *
                            2 ** (consecutiveFailures - 1)
                    );
                    continue;
                }

                if (result.rateLimited) {
                    setUnreachableProbe({
                        checked,
                        isActive: true,
                        probeFailed: false,
                        total: totalProbeable,
                    });
                    await sleep(Math.max(1000, result.retryAfterMs));
                    continue;
                }

                consecutiveFailures = 0;

                for (const entry of result.results) {
                    probedItemIds.add(entry.itemId);
                }

                const resultById = new Map(
                    result.results.map((entry) => [entry.itemId, entry])
                );
                setItems((previous) =>
                    previous.map((item) => {
                        const entry = resultById.get(item.id);
                        if (!entry) {
                            return item;
                        }
                        return {
                            ...item,
                            linkCheckedAt: new Date(entry.checkedAt),
                            linkReachability: entry.status,
                        };
                    })
                );
            }
        };

        run().catch((error) => {
            log.error("Link reachability probe loop failed", error);
        });

        return () => {
            unreachableProbeVersionRef.current += 1;
            unreachableProbeTimeout.clear();
            for (const resolve of pendingSleepResolvers) {
                resolve();
            }
        };
    }, [setItems, unreachableFilterEnabled, unreachableProbeTimeout]);

    const domainOptions = buildDomainPaletteOptions(items);

    const buildAskCacheRequest = useStableCallback(
        (prompt: string): AskCacheRequest => ({
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
                    .slice(0, ASK_CACHE_CONTEXT_COLLECTION_LIMIT)
                    .map((collection) => ({
                        id: collection.id,
                        itemCount: collection.itemCount,
                        name: collection.name,
                    })),
                availableDomains: domainOptions
                    .filter((option) => option.value !== ALL_DOMAIN_FILTER)
                    .slice(0, ASK_CACHE_CONTEXT_DOMAIN_LIMIT)
                    .map((option) => ({
                        domain: option.value,
                        itemCount: option.itemCount,
                    })),
                filteredItemCount: filterComposerItems(items, {
                    collectionMembershipFilter,
                    domainFilters,
                    duplicateItemIds,
                    duplicatesFilterEnabled,
                    lastVisitedItemIds: lastVisitedFilterEnabled
                        ? lastVisitedItemIds
                        : [],
                    searchTerms,
                    selectedCollectionIds,
                    sourceFilters,
                    unreachableFilterEnabled,
                    unreachableItemIds,
                }).length,
                totalItemCount,
            },
        })
    );

    const applyAskCachePatch = useStableCallback(
        (patch: AskCacheComposerPatch) => {
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

    const handleAskCacheResult = useStableCallback(
        (prompt: string, result: AskCacheResult) => {
            if (result.status !== ACTION_STATUS.SUCCESS) {
                setAskCacheResponse({
                    message: result.message,
                    prompt,
                    status: "error",
                });
                return;
            }

            for (const operation of result.operations) {
                applyAskCachePatch(operation);
            }
            setPaletteSection("ai-response");
            setAskCacheResponse({
                markdown: result.markdown,
                operationCount: result.operations.length,
                prompt,
                status: "success",
            });
        }
    );

    const handleAskCacheSubmit = useStableCallback(
        async (rawPrompt: string) => {
            const prompt = rawPrompt.trim();
            if (prompt.length === 0) {
                return;
            }

            const requestVersion = askCacheRequestVersionRef.current + 1;
            askCacheRequestVersionRef.current = requestVersion;
            setAskCacheResponse({ prompt, status: "loading" });
            setPaletteSection("ai-response");
            setQuery("");

            try {
                const result = await askCache(buildAskCacheRequest(prompt));
                if (askCacheRequestVersionRef.current !== requestVersion) {
                    return;
                }
                handleAskCacheResult(prompt, result);
            } catch (error) {
                if (askCacheRequestVersionRef.current !== requestVersion) {
                    return;
                }
                log.error("Failed to submit Ask Cache request", error);
                setAskCacheResponse({
                    message: "Ask Cache is unavailable right now.",
                    prompt,
                    status: "error",
                });
                setPaletteSection("ai-response");
            }
        }
    );

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
        composerInputActionsRef.current?.open();
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

    const paletteGroups = buildPaletteGroups({
        askCacheResponse,
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
        onAskCacheSubmit: handleAskCacheSubmit,
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
        setIsComposerOpen: setComposerOpen,
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

    const activeLastVisitedItemIds = lastVisitedFilterEnabled
        ? lastVisitedItemIds
        : [];

    const paletteGroupValueSet = buildPaletteGroupValueSet(paletteGroups);

    const filteredItems = filterComposerItems(items, {
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
    });

    const removableDuplicateIds = buildRemovableDuplicateItemIds({
        allItems: items,
        duplicatesFilterEnabled,
        filteredItems,
    });

    const handleRequestRemoveDuplicates = useStableCallback(() => {
        if (removableDuplicateIds.length === 0) {
            return;
        }
        setPendingRemoveDuplicateIds(removableDuplicateIds);
        setIsRemoveDuplicatesDialogOpen(true);
    });

    const handleRemoveDuplicatesDialogOpenChange = useStableCallback(
        (open: boolean) => {
            if (!(open || isRemovingDuplicates)) {
                setIsRemoveDuplicatesDialogOpen(false);
                setPendingRemoveDuplicateIds([]);
            }
        }
    );

    const handleConfirmRemoveDuplicates = useStableCallback(() => {
        const excessIds = pendingRemoveDuplicateIds;
        if (excessIds.length === 0) {
            setIsRemoveDuplicatesDialogOpen(false);
            return;
        }

        startRemoveDuplicatesTransition(async () => {
            const deletedIds: string[] = [];
            const collectionSummariesById = new Map<
                string,
                LibraryCollectionSummary
            >();
            let failedCount = 0;

            for (
                let offset = 0;
                offset < excessIds.length;
                offset += BATCH_UPDATE_MAX_ITEMS
            ) {
                const batchIds = excessIds.slice(
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

            setIsRemoveDuplicatesDialogOpen(false);
            setPendingRemoveDuplicateIds([]);

            if (failedCount === 0 && deletedIds.length === excessIds.length) {
                setDuplicatesFilterEnabled(false);
            } else if (failedCount > 0) {
                log.error("Remove duplicates finished with failures", {
                    deletedCount: deletedIds.length,
                    failedCount,
                    requestedCount: excessIds.length,
                });
            }
        });
    });

    const sortedItems = sortComposerItems(filteredItems, sortMode);

    const effectiveGroupBy: EffectiveGroupByMode = duplicatesFilterEnabled
        ? "canonical-url"
        : groupBy;

    const groups = buildBrowserGroups(
        sortedItems,
        effectiveGroupBy,
        sortMode,
        collections
    );

    const hasActiveFilters = browserHasActiveFilters({
        collectionMembershipFilter,
        domainFilters,
        duplicatesFilterEnabled,
        lastVisitedItemIds: activeLastVisitedItemIds,
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
    } = useSectionCollapseState({
        groupBy: effectiveGroupBy,
        groups,
        hasActiveFilters,
        shouldShowEmptyLibraryPeek,
        shouldShowNoFilteredResults,
    });

    const resolvedColumnCount =
        columnCountMode === "auto" ? undefined : Number(columnCountMode);

    const collapsedSectionKeySet = new Set(collapsedSectionKeys);

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

    const visibleResultItems = groups.flatMap((section) => section.items);

    const resultCollectionItemIds = visibleResultItems.map((item) => item.id);

    const shouldShowLockedPreview =
        isPreviewOnly && !hasActiveFilters && effectiveGroupBy === "none";

    const canClear =
        (hasActiveFilters || hasNonDefaultView) && !shouldShowEmptyLibraryPeek;

    const suggestions = buildComposerSuggestions({
        clearLibraryPalette,
        collectionMembershipFilter,
        collections,
        domainFilters,
        duplicatesFilterEnabled,
        groupBy,
        isExtensionInstalled,
        items: filteredItems,
        lastVisitedFilterEnabled,
        onClearCollectionFilters,
        onCreateCollection: requestCreate,
        onToggleCollectionSelection: onRemoveCollectionFilter,
        searchTerms,
        selectedCollectionIds,
        setCollectionMembershipFilter,
        setDomainFilters,
        setGroupBy,
        setIsComposerOpen: setComposerOpen,
        setQuery,
        setSearchTerms,
        setSortMode,
        setSourceFilters,
        sortMode,
        sourceFilters,
        unreachableFilterEnabled,
    });

    const [isSuggestionsOpen, setIsSuggestionsOpen] = React.useState(true);

    const prevSuggestionCountRef = React.useRef(0);
    React.useEffect(() => {
        if (prevSuggestionCountRef.current === 0 && suggestions.length > 0) {
            setIsSuggestionsOpen(true);
        }
        prevSuggestionCountRef.current = suggestions.length;
    }, [suggestions.length]);

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
            }
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
            if (paletteGroupValueSet.has(next)) {
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

    const stackEntries = buildPaletteStackEntries({
        collectionMembershipFilter,
        collections,
        columnCountMode,
        composerAttachments,
        domainFilters,
        duplicatesFilterEnabled,
        groupBy,
        lastVisitedFilterEnabled,
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
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (
                event.key === "Escape" ||
                (event.key === "Tab" &&
                    paletteSection === "search" &&
                    query.trim() !== "")
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
                handleAskCacheSubmit(query).catch((error) => {
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
        }
    );

    const handleCreateNote = useStableCallback(() => {
        openQuickLookNote(null);
    });

    const handleOpenComposerFromOnboarding = useStableCallback(() => {
        setPaletteSection("search");
        focusPaletteInput(true);
    });

    const handleCreateResultsDialogOpenChange = useStableCallback(
        (open: boolean) => {
            if (open) {
                setCreateResultsError(null);
                setCreateResultsNameDraft(
                    buildResultsCollectionName(searchTerms)
                );
                setCreateResultsDescriptionDraft("");
                setIsCreateResultsDialogOpen(true);
                return;
            }

            if (!isCreatingResultsCollection) {
                setIsCreateResultsDialogOpen(false);
                setCreateResultsError(null);
            }
        }
    );

    const handleCreateCollectionFromResultsSubmit = useStableCallback(() => {
        startCreateResultsCollectionTransition(async () => {
            let result: CollectionCreateFromItemsResult;

            const description = createResultsDescriptionDraft || undefined;
            try {
                result = await handleCreateCollectionFromResults({
                    description,
                    itemIds: resultCollectionItemIds,
                    name: createResultsNameDraft,
                });
            } catch {
                result = {
                    message: "We couldn't create this collection right now.",
                    status: "ERROR",
                };
            }

            if (result.status !== ACTION_STATUS.CREATED) {
                setCreateResultsError(result.message);
                return;
            }

            setIsCreateResultsDialogOpen(false);
            setCreateResultsError(null);
        });
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
                        [
                            buildItemsCsv(
                                "Section",
                                sectionTitle,
                                sectionItems,
                                "\n"
                            ),
                        ],
                        { type: MIME_TYPES.csv }
                    ),
                    {
                        description: "CSV file",
                        extension: "csv",
                        name: getBrowserSectionExportFileName(sectionTitle),
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
            openQuickLookNote(item);
        }
    );

    const handleOpenFavoriteItem = useStableCallback(
        (item: LibraryItemWithCollections) => {
            if (item.kind === ITEM_KIND_NOTE) {
                openQuickLookNote(item);
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

    useCardHoverHotkeys({
        hoveredItemIdRef,
        hoverHotkeySurface,
        itemsRef,
        onDelete: handleRequestDelete,
        onItemFavoriteToggle: handleItemFavoriteToggle,
        pendingDeleteItemIdRef,
    });

    const handleFindSimilar = useStableCallback(
        (item: LibraryItemWithCollections) => {
            const similarDomain = getLibraryItemDomain(item.url);
            const nextFilters = buildSimilarBrowserFilterState(
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

            setItems((current) => {
                const existingIndex = current.findIndex(
                    (item) => item.id === result.item.id
                );

                if (existingIndex === -1) {
                    return [result.item, ...current];
                }

                return current.map((item) =>
                    item.id === result.item.id ? result.item : item
                );
            });
            return result.item;
        }
    );

    const handlePasteUrlIntoLibrary = useStableCallback(async (url: string) => {
        const result = await createLibraryBookmarkFromPastedUrl({ url });

        if (result.status !== ACTION_STATUS.SUCCESS) {
            return;
        }

        setItems((current) => {
            const existingIndex = current.findIndex(
                (item) => item.id === result.item.id
            );

            if (existingIndex === -1) {
                return [result.item, ...current];
            }

            return current.map((item) =>
                item.id === result.item.id ? result.item : item
            );
        });
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
        PALETTE_PLACEHOLDER_BY_SECTION[paletteSection] ?? "Ask Cache anything";

    const handleOpenCreateResultsDialog = useStableCallback(() =>
        handleCreateResultsDialogOpenChange(true)
    );

    const mergeImportedLibraryItems = useStableCallback(
        (imported: LibraryItemWithCollections[]) => {
            setItems((current) => {
                if (imported.length === 0) {
                    return current;
                }
                return mergeById(current, imported);
            });
        }
    );

    const itemsContextValue: ItemsContext = {
        collectionPreviewThumbnailUrlsById,
        favoriteItemIdSet,
        favoriteItems,
        items,
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
        setItems,
    };

    const browserContextValue: BrowserContext = {
        clearLibraryPalette,
        collapsedSectionKeys: collapsedSectionKeySet,
        collections,
        columnCount: resolvedColumnCount,
        enableSectionCollapse,
        hoveredItemIdRef,
        hoverPinnedItemIdRef,
        onCollapseAllSections: collapseAllSections,
        onCreateCollectionFromResults: handleOpenCreateResultsDialog,
        onExpandAllSections: expandAllSections,
        onExportSectionResults: handleExportSectionResults,
        onToggleSection: toggleSection,
        openPickerItemId,
        setOpenPickerItemId,
        shouldShowEmptyLibraryPeek,
        shouldShowNoFilteredResults,
        shouldShowUnreachableProbePending:
            isUnreachableProbePending && filteredItems.length === 0,
    };

    return (
        <ItemsContext value={itemsContextValue}>
            <QuickLookRoot
                onSaveNote={handleSaveNote}
                onUrlPaste={handlePasteUrlIntoLibrary}
            >
                <BrowserContext value={browserContextValue}>
                    {children}
                    <div className="z-0 flex min-h-0 w-full flex-1 items-stretch">
                        <div
                            className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 p-8"
                            style={
                                {
                                    "--library-section-sticky-top": "108px",
                                } as React.CSSProperties
                            }
                        >
                            <Composer>
                                <ComposerInput
                                    actionsRef={composerInputActionsRef}
                                    groups={paletteGroups}
                                    onKeyDown={handlePaletteInputKeyDown}
                                    onOpenChange={handleComposerOpenChange}
                                    onValueChange={handleComposerInputChange}
                                    placeholder={placeholder}
                                    query={query}
                                    ref={inputRef}
                                    stackEntries={stackEntries}
                                />
                                <ComposerActionsList
                                    canClear={canClear}
                                    duplicatesFilterEnabled={
                                        duplicatesFilterEnabled
                                    }
                                    groupBy={groupBy}
                                    metrics={buildComposerMetrics({
                                        getSourceLabel,
                                        items: filteredItems,
                                    })}
                                    onClearPalette={clearLibraryPalette}
                                    onCreateNote={handleCreateNote}
                                    onRemoveDuplicates={
                                        handleRequestRemoveDuplicates
                                    }
                                    removableDuplicateCount={
                                        removableDuplicateIds.length
                                    }
                                    resultsSummary={resultsSummary}
                                    sectionsLength={groups.length}
                                >
                                    <ComposerActionNew />
                                    <ComposerActionMetrics />
                                    <OnboardingMenu
                                        connectedIntegrationCount={
                                            connectedIntegrationCount
                                        }
                                        onCreateCollection={requestCreate}
                                        onCreateNote={handleCreateNote}
                                        onOpenComposer={
                                            handleOpenComposerFromOnboarding
                                        }
                                    />
                                    <ComposerActionRemoveDuplicates />
                                </ComposerActionsList>
                            </Composer>
                            <ComposerSuggestionsList
                                isOpen={isSuggestionsOpen}
                                onOpenChange={setIsSuggestionsOpen}
                                suggestions={suggestions}
                            >
                                {(suggestion, index) => (
                                    <Button
                                        className="text-muted-foreground"
                                        key={suggestion.label}
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
                                )}
                            </ComposerSuggestionsList>
                            {isPreviewOnly ? <InlinePaywallBanner /> : null}
                            <BrowserEmpty />
                            <BrowserEmptyWithFilters />
                            <BrowserUnreachableProbePending />
                            <BrowserGroupList groups={groups}>
                                {(group) => (
                                    <BrowserGroup>
                                        {enableSectionCollapse ? (
                                            <>
                                                <BrowserGroupResults />
                                                {group.title ? null : (
                                                    <BrowserGroupAIOverview>
                                                        <BrowserGroupAIOverviewContent />
                                                    </BrowserGroupAIOverview>
                                                )}
                                                <BrowserGroupEmpty>
                                                    No items were found in this
                                                    section.
                                                </BrowserGroupEmpty>
                                            </>
                                        ) : null}
                                        <BrowserMasonry>
                                            {(item) => (
                                                <MasonryItem key={item.id}>
                                                    <MediaCardDataProvider
                                                        item={item}
                                                    >
                                                        <MediaCardInteractionProvider>
                                                            <MediaCardContextMenuSurface>
                                                                <MediaCardOpenTarget />
                                                                <MediaCardActions />
                                                            </MediaCardContextMenuSurface>
                                                        </MediaCardInteractionProvider>
                                                    </MediaCardDataProvider>
                                                </MasonryItem>
                                            )}
                                        </BrowserMasonry>
                                    </BrowserGroup>
                                )}
                            </BrowserGroupList>
                            {shouldShowLockedPreview ? (
                                <div className="relative isolate flex flex-col gap-8">
                                    <BlockPaywallBanner
                                        length={totalItemCount}
                                    />
                                    <div className="pointer-events-none absolute inset-0 z-10 rounded-[2rem] bg-linear-to-b from-background/10 via-background/45 to-background/75" />
                                    <div className="select-none blur-[1.5px]">
                                        <div className="contain-layout contain-paint contain-style [overflow-clip-margin:0.5rem]">
                                            <MasonryRoot
                                                columnCount={
                                                    resolvedColumnCount
                                                }
                                                gap={16}
                                                items={
                                                    LOCKED_LIBRARY_PREVIEW_PLACEHOLDERS
                                                }
                                                maxColumnCount={7}
                                            >
                                                {(previewPlaceholder) => (
                                                    <MasonryItem
                                                        key={
                                                            previewPlaceholder.id
                                                        }
                                                    >
                                                        <MediaCardLocked
                                                            data={
                                                                previewPlaceholder
                                                            }
                                                        />
                                                    </MasonryItem>
                                                )}
                                            </MasonryRoot>
                                        </div>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                        <QuickLookContent />
                    </div>
                    <DeleteItemDialog
                        isDeletePending={isDeletePending}
                        onConfirmDelete={handleConfirmDelete}
                        onOpenChange={handleDeleteDialogOpenChange}
                        open={pendingDeleteItem !== null}
                        pendingDeleteItem={pendingDeleteItem}
                    />
                    <RemoveDuplicatesDialog
                        count={pendingRemoveDuplicateIds.length}
                        isRemoving={isRemovingDuplicates}
                        onConfirm={handleConfirmRemoveDuplicates}
                        onOpenChange={handleRemoveDuplicatesDialogOpenChange}
                        open={isRemoveDuplicatesDialogOpen}
                    />
                    <CreateFromResultsCollectionDialog
                        collections={collections}
                        createResultsDescriptionDraft={
                            createResultsDescriptionDraft
                        }
                        createResultsDescriptionId={createResultsDescriptionId}
                        createResultsError={createResultsError}
                        createResultsNameDraft={createResultsNameDraft}
                        createResultsNameInputId={createResultsNameInputId}
                        isCreatingResultsCollection={
                            isCreatingResultsCollection
                        }
                        onCreateCollectionFromResultsSubmit={
                            handleCreateCollectionFromResultsSubmit
                        }
                        onOpenChange={handleCreateResultsDialogOpenChange}
                        onUpdateCreateResultsDescriptionDraft={
                            setCreateResultsDescriptionDraft
                        }
                        onUpdateCreateResultsError={setCreateResultsError}
                        onUpdateCreateResultsNameDraft={
                            setCreateResultsNameDraft
                        }
                        onUpdateItemCollections={handleUpdateItemCollections}
                        onUpdateItemsCollections={handleUpdateItemsCollections}
                        open={isCreateResultsDialogOpen}
                        resultItemCount={resultCollectionItemIds.length}
                        visibleResultItems={visibleResultItems}
                    />
                    <SuccessfulUpgradeDialog />
                </BrowserContext>
            </QuickLookRoot>
        </ItemsContext>
    );
}
