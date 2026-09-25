"use client";

import type { BaseUIEvent } from "@base-ui/react";
import { Toolbar } from "@base-ui/react/toolbar";
import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useRefWithInit } from "@base-ui/utils/useRefWithInit";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import { useValueAsRef } from "@base-ui/utils/useValueAsRef";
import { Calligraph } from "calligraph";
import { cn } from "cn";
import { T, useGT } from "gt-next";
import {
    ArchiveIcon,
    ArchiveX,
    ArrowUpDown,
    ChevronRight,
    Clock,
    ClockFading,
    Component,
    CopyCheck,
    CopyIcon,
    CopyPlus,
    Download,
    EllipsisIcon,
    ExternalLinkIcon,
    FileSpreadsheetIcon,
    Globe,
    GlobeCheck,
    LayoutList,
    LibraryBig,
    Lightbulb,
    LinkIcon,
    ListFilter,
    LockKeyhole,
    PencilSparkles,
    PenLine,
    PlusIcon,
    SignalHigh,
    SignalMedium,
    Sparkle,
    Star,
    Trash2Icon,
    UserRoundPlus,
    X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Image from "next/image";
import { parseAsArrayOf, parseAsString, useQueryState } from "nuqs";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import { useSubscriptionAccess } from "@/components/billing/subscription";
import {
    useItemsContext,
    useItemsStateContext,
} from "@/components/session/items";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CollapsibleListVertical } from "@/components/ui/collapsible-list";
import {
    Combobox,
    ComboboxCollection,
    ComboboxEmpty,
    ComboboxGroup,
    ComboboxGroupLabel,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxPopup,
    ComboboxSeparator,
    ComboboxTrigger,
} from "@/components/ui/combobox";
import {
    DataList,
    DataListGroup,
    DataListItem,
    DataListSection,
} from "@/components/ui/data-list";
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
import { ErrorMessage } from "@/components/ui/error-message";
import { GradientWaveText } from "@/components/ui/gradient-wave-text";
import {
    HOVER_HOTKEY_REGIONS,
    useHoverHotkeyRegionClaim,
    useHoverHotkeySurface,
} from "@/components/ui/hover-hotkey-surface";
import {
    ChevronDownFilledIcon,
    NotionIcon,
    PriorityNoneIcon,
    ShareArrowSolidIcon,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { AltKbd, CmdKbd, Kbd, ShiftKbd } from "@/components/ui/kbd";
import {
    Menu,
    MenuGroup,
    MenuGroupLabel,
    MenuItem,
    MenuPopup,
    MenuSeparator,
    MenuShortcut,
    MenuSub,
    MenuSubPopup,
    MenuSubTrigger,
    MenuTrigger,
} from "@/components/ui/menu";
import { Placeholder } from "@/components/ui/placeholder";
import {
    Popover,
    PopoverDescription,
    PopoverPopup,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    PreviewCard,
    PreviewCardPopup,
    PreviewCardTrigger,
} from "@/components/ui/preview-card";
import { SidebarItem } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TextMatch } from "@/components/ui/text-match";
import { Textarea } from "@/components/ui/textarea";
import { useCollectionsSuggestions } from "@/hooks/queries/use-collections-suggestions";
import { useSmartCollectionsPreference } from "@/hooks/queries/use-smart-collections-preference";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import {
    type CollectionCreateResult,
    createCollection,
    deleteCollection,
    duplicateCollection,
    renameCollection,
    setSmartCollectionsPreference,
    updateCollectionPriority,
} from "@/lib/collections/actions";
import {
    groupCollectionsBySortField,
    type RelativeDateGroupId,
} from "@/lib/collections/grouping";
import {
    disableCollectionSharing,
    shareCollectionPublicly,
} from "@/lib/collections/sharing/actions";
import { buildPublicCollectionShareUrl } from "@/lib/collections/sharing/url";
import {
    type CollectionTemplateOption,
    TEMPLATE_BY_VALUE,
    TEMPLATES,
    type TemplateValue,
} from "@/lib/collections/templates";
import {
    buildItemsCsv,
    type CollectionSortField,
    itemPreviewImageUrl,
    type LibraryCollectionSummary,
    type LibraryCollectionTag,
    type LibraryItemWithCollections,
    toLibraryCollectionTag,
} from "@/lib/collections/utils";
import { tryAction } from "@/lib/common/action";
import {
    countBy,
    keyBy,
    mergeById,
    removeValue,
    toggleValue,
} from "@/lib/common/array";
import {
    forgetImageAspect,
    peekImageAspect,
    preloadImageAspect,
} from "@/lib/common/aspect-ratio";
import { getHexColorFromName } from "@/lib/common/color";
import {
    ACTION_STATUS,
    DESCRIPTION_MAX_LENGTH,
    ITEM_KIND_NOTE,
    MIME_TYPES,
    NAME_MAX_LENGTH,
} from "@/lib/common/constants";
import { dayjs } from "@/lib/common/dayjs";
import { getOwnerDocument, getOwnerWindow } from "@/lib/common/dom";
import { saveFile } from "@/lib/common/file";
import { getSystemControlKey } from "@/lib/common/keyboard";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    getNoteExcerpt,
    normalizeWhitespace,
    slugify,
} from "@/lib/common/string";
import {
    isHttpUrl,
    normalizeURL,
    openExternalUrl,
    parseDisplayUrl,
} from "@/lib/common/url";
import { sendCollectionToNotion } from "@/lib/integrations/notion/actions";
import { getSourceLabel } from "@/lib/integrations/support";
import { getCollectionDescription } from "@/lib/intelligence/actions";
import type { CollectionPriority } from "@/prisma/client/enums";
import AppIconSmall from "@/public/cache-icon-small.png";
import EmptyCollectionStateImage from "@/public/empty-collection-state.png";
import SmartCollectionsBackgroundImg from "@/public/smart-collections-background-wide.webp";

const NAME_REQUIRED_MESSAGE = "Enter a collection name.";
const CREATE_ERROR_MESSAGE = "We couldn't create this collection right now.";
const DESCRIPTION_GENERATION_ERROR_MESSAGE =
    "We couldn't generate a collection description right now.";
const DELETE_ERROR_MESSAGE = "We couldn't delete this collection right now.";
const DUPLICATE_ERROR_MESSAGE =
    "We couldn't make a copy of this collection right now.";
const EMPTY_LINKS_ERROR_MESSAGE = "There are no links in this collection yet.";
const EMPTY_ITEMS_ERROR_MESSAGE = "There are no items in this collection yet.";
const RENAME_ERROR_MESSAGE = "We couldn't rename this collection right now.";
const DISABLE_SHARING_ERROR_MESSAGE =
    "We couldn't stop sharing this collection right now.";
const UPDATE_PRIORITY_ERROR_MESSAGE =
    "We couldn't update this collection's priority right now.";
const COPY_LINKS_ERROR_MESSAGE = "We couldn't copy these links right now.";
const COPY_TITLE_ERROR_MESSAGE =
    "We couldn't copy this collection's title right now.";
const COPY_SHARE_LINK_ERROR_MESSAGE =
    "We couldn't copy this public link right now.";
const COPY_SHARE_LINK_MISSING_MESSAGE =
    "Create a public link before trying to copy it.";
const EXPORT_CSV_ERROR_MESSAGE =
    "We couldn't export this collection right now.";
const SEND_TO_NOTION_ERROR_MESSAGE =
    "We couldn't send this collection to Notion right now.";
const DISABLE_SMART_COLLECTIONS_ERROR_MESSAGE =
    "We couldn't turn off smart collections right now.";
const ENABLE_SMART_COLLECTIONS_ERROR_MESSAGE =
    "We couldn't turn on smart collections right now.";
const SHARE_COLLECTION_ERROR_MESSAGE =
    "We couldn't create a public link right now.";

const PREVIEW_SLIDE_INTERVAL_MS = 1400;
const PREVIEW_CROSSFADE_MS = 400;

const COLLECTIONS_LIST_SORT_FIELD_STORAGE_KEY = "cache:collections:sort-field";
const COLLECTIONS_LIST_TEXT_MATCH_QUERY_STORAGE_KEY =
    "cache:collections:text-match-query";
const COLLECTIONS_LIST_VIEW_STORAGE_KEY = "cache:collections:view";
const COLLECTIONS_LIST_FAVORITE_IDS_STORAGE_KEY =
    "cache:collections:favorite-ids";
const COLLECTIONS_LIST_OPEN_STORAGE_KEY = "cache:collections:list-open";
const COLLECTIONS_FAVORITES_LIST_OPEN_STORAGE_KEY =
    "cache:collections:favorites-open";
const COLLECTIONS_SUGGESTIONS_OPEN_STORAGE_KEY =
    "cache:collections:suggestions-open";

const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
    compactDisplay: "short",
    notation: "compact",
});

const INITIAL_CREATE_FORM_STATE: CreateFormState = {
    descriptionDraft: "",
    descriptionErrorMessage: null,
    errorMessage: null,
    nameDraft: "",
    pendingDescription: null,
};

const PRIORITY_RANK: Record<CollectionPriority, number> = {
    archive: 4,
    none: 3,
    peripheral: 2,
    relevant: 1,
    very_relevant: 0,
};

const GROUP_LABELS: Record<ComboboxGroupData["group"], string> = {
    sort: "Sort",
    "text-match": "Match collection name",
    view: "Visibility",
};

const COLLECTIONS_LIST_GROUP_LABELS: Record<string, React.ReactNode> = {
    "last-3-days": <T>Last 3 days</T>,
    "last-7-days": <T>Last 7 days</T>,
    "last-30-days": <T>Last 30 days</T>,
    older: <T>Older</T>,
} satisfies Record<RelativeDateGroupId, React.ReactNode>;

const DEFAULT_PRIORITY: PriorityOption = {
    icon: PriorityNoneIcon,
    label: "No priority",
    value: "none",
};

const PRIORITIES: PriorityOption[] = [
    DEFAULT_PRIORITY,
    {
        icon: Sparkle,
        label: "Very relevant",
        value: "very_relevant",
    },
    {
        icon: SignalHigh,
        label: "Relevant",
        value: "relevant",
    },
    {
        icon: SignalMedium,
        label: "Background",
        value: "peripheral",
    },
    {
        icon: ArchiveIcon,
        label: "Archive",
        value: "archive",
    },
];

const PRIORITY_BY_VALUE = new Map(
    PRIORITIES.map((option) => [option.value, option])
);

const SORT_OPTIONS: SortingOption[] = [
    {
        icon: SignalHigh,
        label: "Priority",
        value: "priority",
    },
    {
        icon: Clock,
        label: "Updated",
        value: "updated",
    },
    {
        icon: ClockFading,
        label: "Created",
        value: "created",
    },
    {
        icon: Component,
        label: "Count",
        value: "count",
    },
    {
        icon: ArrowUpDown,
        label: "Name",
        value: "name",
    },
];

const SORT_OPTION_BY_VALUE = new Map(
    SORT_OPTIONS.map((option) => [option.value, option])
);

const VIEW_OPTIONS = [
    { icon: LayoutList, label: "Show all", value: "show-all" },
    { icon: ArchiveX, label: "Exclude archives", value: "exclude-archives" },
    { icon: GlobeCheck, label: "Show shared only", value: "show-shared-only" },
] as const;

const LIST_FORMATTER = new Intl.ListFormat(undefined, {
    style: "long",
    type: "conjunction",
});

const NAME_COLLATOR = new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: "base",
});

const SUMMARY_SORTERS = {
    count: compareItemCount,
    created: compareCreatedAt,
    name: compareNames,
    priority: comparePriorities,
    updated: compareUpdatedAt,
} satisfies SummarySorter;

type CollectionView = "show-all" | "exclude-archives" | "show-shared-only";

type SortableCollectionSummary = Pick<
    LibraryCollectionSummary,
    "createdAt" | "itemCount" | "name" | "priority" | "updatedAt"
>;

type CollectionShareState = Pick<
    LibraryCollectionTag,
    "id" | "shareId" | "sharedAt" | "updatedAt"
>;

type CollectionAction = "notion" | "priority" | "share";

type CollectionsListStatusTone = "error" | "success";

interface CollectionStatus {
    message: string;
    tone: CollectionsListStatusTone;
}

interface CollectionItemStyle extends React.CSSProperties {
    "--accent-color": string;
    "--collection-background": string;
    "--text-muted-color": string;
}

type CollectionListSource = "favorites" | "collections";

interface PriorityComboboxOpenTarget {
    collectionId: string;
    source: CollectionListSource;
}

interface SyncCreatedCollectionInput {
    assignedItemIds: string[];
    collection: LibraryCollectionSummary;
}

interface CreateCollectionAndSyncInput {
    assignToItemId?: string;
    description?: string;
    name: string;
    syncCreated: (input: SyncCreatedCollectionInput) => void;
}

interface PriorityOption {
    icon: React.ElementType;
    label: string;
    value: CollectionPriority;
}

interface SortingOption {
    icon: React.ElementType;
    label: string;
    value: Exclude<CollectionSortField, "text-match">;
}

interface ComboboxValue {
    icon: React.ElementType;
    label: string;
    sortField: CollectionSortField;
    sortQuery: string;
    view: CollectionView;
}

interface ComboboxGroupData {
    group: "sort" | "text-match" | "view";
    items: ComboboxValue[];
}

interface ReadyPreviewSlide {
    aspectRatio: number;
    src: string;
}

type CollectionAccessAction =
    | "copy"
    | "export"
    | "open"
    | "send to Notion"
    | "share";

type PriorityBreakdownEntry = PriorityOption & { count: number };

type SummarySorter = Record<
    Exclude<CollectionSortField, "text-match">,
    (a: SortableCollectionSummary, b: SortableCollectionSummary) => number
>;

interface CollectionsRootContext {
    collectionSummaries: LibraryCollectionSummary[];
    collections: LibraryCollectionSummary[];
    mergeCollectionSummaries: (collections: LibraryCollectionSummary[]) => void;
    onClearCollectionFilters: () => void;
    onCloseCreate: () => void;
    onSelectCollection: (collectionId: string) => void;
    replaceCollections: (collections: LibraryCollectionSummary[]) => void;
    requestCreate: (itemId?: string) => void;
    selectedCollectionIdSet: ReadonlySet<string>;
    selectedCollectionIds: string[];
    syncCollectionCreated: (input: SyncCreatedCollectionInput) => void;
    syncCollectionDeleted: (collectionId: string) => void;
    syncCollectionName: (id: string, name: string) => void;
    syncCollectionPriority: (id: string, priority: CollectionPriority) => void;
    syncCollectionShare: (next: CollectionShareState) => void;
}

interface CollectionsRootPendingActionsContext {
    claimCollectionAction: (
        action: CollectionAction,
        collectionId: string
    ) => (() => void) | null;
    isCollectionActionPending: (
        action: CollectionAction,
        collectionId: string
    ) => boolean;
}

interface CollectionsListHoverContext {
    hoveredCollectionIdRef: React.RefObject<string | null>;
    hoveredCollectionSourceRef: React.RefObject<CollectionListSource | null>;
    setHoveredCollectionSource: (source: CollectionListSource | null) => void;
}

interface CollectionsListItemContext {
    collection: LibraryCollectionSummary;
    isSelected: boolean;
    source: CollectionListSource;
}

interface CollectionsListStateContext {
    pendingDelete: LibraryCollectionSummary | null;
    pendingPriorityComboboxOpen: PriorityComboboxOpenTarget | null;
    pendingRename: LibraryCollectionSummary | null;
}

interface CollectionsListActionsContext {
    closeCreateDialog: () => void;
    closePendingDelete: () => void;
    closePendingRename: () => void;
    createSubmissionPendingRef: React.RefObject<boolean>;
    onCopyLinks: (collection: LibraryCollectionSummary) => Promise<void>;
    onCopyTitle: (collection: LibraryCollectionSummary) => Promise<void>;
    onDelete: (collection: LibraryCollectionSummary) => void;
    onDuplicate: (collection: LibraryCollectionSummary) => void;
    onExportCsv: (collection: LibraryCollectionSummary) => void;
    onOpenLinks: (collection: LibraryCollectionSummary) => void;
    onRename: (collection: LibraryCollectionSummary) => void;
    onUpdatePriority: (
        collectionId: string,
        priority: CollectionPriority
    ) => Promise<void>;
    openCreateDialog: (itemId?: string) => void;
    setPendingPriorityComboboxOpen: React.Dispatch<
        React.SetStateAction<PriorityComboboxOpenTarget | null>
    >;
    syncCreated: (input: SyncCreatedCollectionInput) => void;
    syncDeleted: (collectionId: string) => void;
    syncName: (id: string, name: string) => void;
}

interface CreateFormState {
    descriptionDraft: string;
    descriptionErrorMessage: string | null;
    errorMessage: string | null;
    nameDraft: string;
    pendingDescription: { readonly title: string } | null;
}

const log = createLogger("library:collections");

const createCollectionSafely = tryAction(
    createCollection,
    CREATE_ERROR_MESSAGE
);
const getCollectionDescriptionSafely = tryAction(
    getCollectionDescription,
    DESCRIPTION_GENERATION_ERROR_MESSAGE
);
const deleteCollectionSafely = tryAction(
    deleteCollection,
    DELETE_ERROR_MESSAGE
);
const duplicateCollectionSafely = tryAction(
    duplicateCollection,
    DUPLICATE_ERROR_MESSAGE
);
const renameCollectionSafely = tryAction(
    renameCollection,
    RENAME_ERROR_MESSAGE
);
const updateCollectionPrioritySafely = tryAction(
    updateCollectionPriority,
    UPDATE_PRIORITY_ERROR_MESSAGE
);
const disableCollectionSharingSafely = tryAction(
    disableCollectionSharing,
    DISABLE_SHARING_ERROR_MESSAGE
);
const sendCollectionToNotionSafely = tryAction(
    sendCollectionToNotion,
    SEND_TO_NOTION_ERROR_MESSAGE
);
export const shareCollectionPubliclySafely = tryAction(
    shareCollectionPublicly,
    SHARE_COLLECTION_ERROR_MESSAGE,
    (input) => ({ collectionId: input.collectionId })
);

const { useStore: useCollectionsListStore, getState: getCollectionsListState } =
    createStore({
        createItemId: null as string | null,
        favoriteCollectionIds: storage<string[]>([], {
            storageKey: COLLECTIONS_LIST_FAVORITE_IDS_STORAGE_KEY,
        }),
        isCollectionsListOpen: storage(false, {
            storageKey: COLLECTIONS_LIST_OPEN_STORAGE_KEY,
        }),
        isCreateOpen: false,
        isFavoritesListOpen: storage(true, {
            storageKey: COLLECTIONS_FAVORITES_LIST_OPEN_STORAGE_KEY,
        }),
        isSuggestionsOpen: storage(true, {
            storageKey: COLLECTIONS_SUGGESTIONS_OPEN_STORAGE_KEY,
        }),
        sortField: storage<CollectionSortField>("priority", {
            storageKey: COLLECTIONS_LIST_SORT_FIELD_STORAGE_KEY,
        }),
        status: null as CollectionStatus | null,
        textMatchQuery: storage("", {
            storageKey: COLLECTIONS_LIST_TEXT_MATCH_QUERY_STORAGE_KEY,
        }),
        view: storage<CollectionView>("show-all", {
            storageKey: COLLECTIONS_LIST_VIEW_STORAGE_KEY,
        }),
    });

const CollectionsRootContext =
    React.createContext<CollectionsRootContext | null>(null);

export function useCollectionsContext(): CollectionsRootContext {
    const context = React.use(CollectionsRootContext);
    if (!context) {
        throw new Error(
            "Collections context is required for collection controls."
        );
    }
    return context;
}

const CollectionsListStateContext =
    React.createContext<CollectionsListStateContext | null>(null);

function useCollectionsListStateContext(): CollectionsListStateContext {
    const context = React.use(CollectionsListStateContext);
    if (!context) {
        throw new Error(
            "Collections list state must be read within a CollectionsListProvider."
        );
    }
    return context;
}

const CollectionsListActionsContext =
    React.createContext<CollectionsListActionsContext | null>(null);

function useCollectionsListActionsContext(): CollectionsListActionsContext {
    const context = React.use(CollectionsListActionsContext);
    if (!context) {
        throw new Error(
            "Collections list actions must be used within a CollectionsListProvider."
        );
    }
    return context;
}

const CollectionsListHoverContext =
    React.createContext<CollectionsListHoverContext | null>(null);

function useCollectionsListHoverContext(): CollectionsListHoverContext {
    const context = React.use(CollectionsListHoverContext);
    if (!context) {
        throw new Error(
            "Collections list hover state must be read within a CollectionsListProvider."
        );
    }
    return context;
}

const CollectionsListItemContext =
    React.createContext<CollectionsListItemContext | null>(null);

function useCollectionsListItemContext() {
    const context = React.use(CollectionsListItemContext);
    if (!context) {
        throw new Error(
            "CollectionsListItem compound components must be used within CollectionsListItem."
        );
    }
    return context;
}

const CollectionsRootPendingActionsContext =
    React.createContext<CollectionsRootPendingActionsContext | null>(null);

export function useCollectionsPendingActionsContext(): CollectionsRootPendingActionsContext {
    const context = React.use(CollectionsRootPendingActionsContext);
    if (!context) {
        throw new Error(
            "Pending collection actions must be read within a CollectionsProvider."
        );
    }
    return context;
}

interface CollectionActionRunInput {
    accessAction?: CollectionAccessAction;
    action: CollectionAction;
    collection: LibraryCollectionSummary;
    run: () => Promise<void>;
}

export function useCollectionActionRunner() {
    const { claimCollectionAction } = useCollectionsPendingActionsContext();
    const { dismissStatus } = useCollectionStatus();
    const ensureAccess = useCollectionAccessGate();
    const [isPending, startTransition] = React.useTransition();

    const runCollectionAction = useStableCallback(
        ({
            accessAction,
            action,
            collection,
            run,
        }: CollectionActionRunInput) => {
            if (accessAction && !ensureAccess(collection, accessAction)) {
                return;
            }
            const releaseAction = claimCollectionAction(action, collection.id);
            if (!releaseAction) {
                return;
            }
            dismissStatus();
            startTransition(async () => {
                try {
                    await run();
                } finally {
                    releaseAction();
                }
            });
        }
    );

    return { isPending, runCollectionAction };
}

function useCollectionStatus() {
    const { status, setStatus } = useCollectionsListStore();

    const showError = useStableCallback((message: string) => {
        setStatus({ message, tone: "error" });
    });

    const showSuccess = useStableCallback((message: string) => {
        setStatus({ message, tone: "success" });
    });

    const dismissStatus = useStableCallback(() => {
        setStatus(null);
    });

    return { dismissStatus, showError, showSuccess, status };
}

function useSubmissionDialog({
    onClose,
    submissionPendingRef,
}: {
    onClose: () => void;
    // Only passed when pending state must be read outside this hook, e.g.
    // the create dialog shares it with the mod+n shortcut handler.
    submissionPendingRef?: React.RefObject<boolean>;
}) {
    const [isSubmitting, startTransition] = React.useTransition();
    const internalPendingRef = React.useRef(false);
    const pendingRef = submissionPendingRef ?? internalPendingRef;

    const handleOpenChange = useStableCallback((nextOpen: boolean) => {
        if (!(nextOpen || pendingRef.current)) {
            onClose();
        }
    });

    const runSubmission = useStableCallback((run: () => Promise<void>) => {
        if (pendingRef.current) {
            return;
        }
        pendingRef.current = true;
        startTransition(async () => {
            try {
                await run();
            } finally {
                pendingRef.current = false;
            }
        });
    });

    return { handleOpenChange, isSubmitting, runSubmission };
}

function useSmartCollectionsToggle() {
    const { showError } = useCollectionStatus();
    const { disabled, isLoading, mutate } = useSmartCollectionsPreference();
    const isEnabled = typeof disabled === "undefined" ? undefined : !disabled;

    const setEnabled = useStableCallback(async (enabled: boolean) => {
        try {
            await mutate(
                async () => {
                    const result = await setSmartCollectionsPreference({
                        enabled,
                    });
                    if (result.status !== ACTION_STATUS.UPDATED) {
                        throw new Error(result.message);
                    }
                    return { disabled: !enabled };
                },
                {
                    optimisticData: { disabled: !enabled },
                    rollbackOnError: true,
                }
            );
        } catch (error) {
            log.error(
                `Failed to ${enabled ? "enable" : "disable"} smart collections`,
                { error }
            );
            showError(
                enabled
                    ? ENABLE_SMART_COLLECTIONS_ERROR_MESSAGE
                    : DISABLE_SMART_COLLECTIONS_ERROR_MESSAGE
            );
        }
    });

    return { isEnabled, isLoading, setEnabled };
}

export function useCollectionAccessGate() {
    const { itemsByCollectionId } = useItemsContext();
    const { hasAccess } = useSubscriptionAccess();
    const { showError } = useCollectionStatus();

    return useStableCallback(
        (
            collection: LibraryCollectionSummary,
            action: CollectionAccessAction
        ): boolean => {
            const visibleItemCount =
                itemsByCollectionId.get(collection.id)?.length ?? 0;
            const isHidden =
                !hasAccess && visibleItemCount < collection.itemCount;

            if (isHidden) {
                showError(
                    `Upgrade to ${action} every item in ${collection.name}.`
                );
                return false;
            }
            return true;
        }
    );
}

function useCopyWithFeedback() {
    const { copyToClipboard } = useCopyToClipboard();
    const { showError, showSuccess } = useCollectionStatus();

    return useStableCallback(
        async (text: string, successMessage: string, errorMessage: string) => {
            if (await copyToClipboard(text)) {
                showSuccess(successMessage);
            } else {
                showError(errorMessage);
            }
        }
    );
}

function useToggleCollectionFavorite() {
    const { favoriteCollectionIds, setFavoriteCollectionIds } =
        useCollectionsListStore();
    const { showSuccess } = useCollectionStatus();

    const favoriteCollectionIdSet = new Set(favoriteCollectionIds);

    const toggleFavorite = useStableCallback(
        (collection: LibraryCollectionSummary) => {
            const isNowFavorite = !favoriteCollectionIdSet.has(collection.id);
            setFavoriteCollectionIds((current) =>
                toggleValue(current, collection.id)
            );
            showSuccess(
                isNowFavorite
                    ? `${collection.name} added to Favorites.`
                    : `${collection.name} removed from Favorites.`
            );
        }
    );

    return { favoriteCollectionIdSet, toggleFavorite };
}

function useFavoriteCollections() {
    const { collectionSummaries } = useCollectionsContext();
    const { favoriteCollectionIds } = useCollectionsListStore();

    return getFavoriteCollections(collectionSummaries, favoriteCollectionIds);
}

function useCollectionDialogRequests() {
    const { dismissStatus } = useCollectionStatus();
    const { onCloseCreate, requestCreate } = useCollectionsContext();
    const createSubmissionPendingRef = React.useRef(false);

    const [pendingRename, setPendingRename] =
        React.useState<LibraryCollectionSummary | null>(null);
    const [pendingDelete, setPendingDelete] =
        React.useState<LibraryCollectionSummary | null>(null);

    const openCreateDialog = useStableCallback((itemId?: string) => {
        dismissStatus();
        requestCreate(itemId);
    });

    const requestDelete = useStableCallback(
        (collection: LibraryCollectionSummary) => {
            dismissStatus();
            setPendingDelete(collection);
        }
    );

    const requestRename = useStableCallback(
        (collection: LibraryCollectionSummary) => {
            dismissStatus();
            setPendingRename(collection);
        }
    );

    const closePendingDelete = useStableCallback(() => {
        setPendingDelete(null);
    });

    const closePendingRename = useStableCallback(() => {
        setPendingRename(null);
    });

    const handleCreateShortcutPress = useStableCallback(() => {
        if (getCollectionsListState().isCreateOpen) {
            if (createSubmissionPendingRef.current) {
                return;
            }
            onCloseCreate();
            return;
        }
        openCreateDialog();
    });

    useHotkeys("mod+n", handleCreateShortcutPress, {
        description: "Create a new collection",
        preventDefault: true,
    });

    return {
        closeCreateDialog: onCloseCreate,
        closePendingDelete,
        closePendingRename,
        createSubmissionPendingRef,
        openCreateDialog,
        pendingDelete,
        pendingRename,
        requestDelete,
        requestRename,
    };
}

function useCollectionRowActions() {
    const { collections, syncCollectionCreated, syncCollectionPriority } =
        useCollectionsContext();
    const { claimCollectionAction } = useCollectionsPendingActionsContext();
    const { itemsByCollectionId } = useItemsContext();
    const { dismissStatus, showError, showSuccess } = useCollectionStatus();
    const ensureAccess = useCollectionAccessGate();
    const copyWithFeedback = useCopyWithFeedback();
    const [, startTransition] = React.useTransition();

    const [pendingPriorityComboboxOpen, setPendingPriorityComboboxOpen] =
        React.useState<PriorityComboboxOpenTarget | null>(null);

    const getCollectionItems = (collectionId: string) =>
        itemsByCollectionId.get(collectionId) ?? [];

    const getAccessibleItemUrls = (
        collection: LibraryCollectionSummary,
        action: CollectionAccessAction
    ): string[] | null => {
        if (!ensureAccess(collection, action)) {
            return null;
        }
        const urls = getItemUrls(getCollectionItems(collection.id));
        if (urls.length === 0) {
            showError(EMPTY_LINKS_ERROR_MESSAGE);
            return null;
        }
        return urls;
    };

    const onCopyLinks = useStableCallback(
        async (collection: LibraryCollectionSummary) => {
            const urls = getAccessibleItemUrls(collection, "copy");
            if (!urls) {
                return;
            }

            await copyWithFeedback(
                urls.join("\n"),
                `Links from ${collection.name} copied to the clipboard.`,
                COPY_LINKS_ERROR_MESSAGE
            );
        }
    );

    const onCopyTitle = useStableCallback(
        async (collection: LibraryCollectionSummary) => {
            await copyWithFeedback(
                collection.name,
                `${collection.name} title copied to the clipboard.`,
                COPY_TITLE_ERROR_MESSAGE
            );
        }
    );

    const onOpenLinks = useStableCallback(
        (collection: LibraryCollectionSummary) => {
            const urls = getAccessibleItemUrls(collection, "open");
            if (!urls) {
                return;
            }

            showSuccess(
                `Opening ${urls.length} link${urls.length === 1 ? "" : "s"} from ${collection.name}.`
            );

            for (const url of urls) {
                openExternalUrl(url);
            }
        }
    );

    const onExportCsv = useStableCallback(
        (collection: LibraryCollectionSummary) => {
            if (!ensureAccess(collection, "export")) {
                return;
            }

            const items = getCollectionItems(collection.id);
            if (items.length === 0) {
                showError(EMPTY_ITEMS_ERROR_MESSAGE);
                return;
            }

            startTransition(async () => {
                try {
                    await saveFile(
                        new Blob(
                            [
                                buildItemsCsv(
                                    "Collection",
                                    collection.name,
                                    items
                                ),
                            ],
                            {
                                type: MIME_TYPES.csv,
                            }
                        ),
                        {
                            description: "CSV file",
                            extension: "csv",
                            name: `${slugify(collection.name) || "collection"}-links`,
                        }
                    );
                    showSuccess(`${collection.name} exported as CSV.`);
                } catch {
                    showError(EXPORT_CSV_ERROR_MESSAGE);
                }
            });
        }
    );

    const onUpdatePriority = useStableCallback(
        async (collectionId: string, priority: CollectionPriority) => {
            const previous = collections.find(
                (c) => c.id === collectionId
            )?.priority;

            if (!previous || previous === priority) {
                return;
            }

            const releaseAction = claimCollectionAction(
                "priority",
                collectionId
            );
            if (!releaseAction) {
                return;
            }

            syncCollectionPriority(collectionId, priority);

            try {
                const result = await updateCollectionPrioritySafely({
                    collectionId,
                    priority,
                });

                if (result.status === ACTION_STATUS.UPDATED) {
                    syncCollectionPriority(
                        result.collection.id,
                        result.collection.priority
                    );
                } else {
                    syncCollectionPriority(collectionId, previous);
                    showError(result.message);
                }
            } finally {
                releaseAction();
            }
        }
    );

    const onDuplicate = useStableCallback(
        (collection: LibraryCollectionSummary) => {
            dismissStatus();

            startTransition(async () => {
                const result = await duplicateCollectionSafely({
                    collectionId: collection.id,
                });

                if (result.status !== ACTION_STATUS.CREATED) {
                    showError(result.message);
                    return;
                }

                syncCollectionCreated({
                    assignedItemIds: result.assignedItemIds,
                    collection: result.collection,
                });
                showSuccess(
                    `${collection.name} copied as ${result.collection.name}.`
                );
            });
        }
    );

    return {
        onCopyLinks,
        onCopyTitle,
        onDuplicate,
        onExportCsv,
        onOpenLinks,
        onUpdatePriority,
        pendingPriorityComboboxOpen,
        setPendingPriorityComboboxOpen,
    };
}

function getItemUrls(items: LibraryItemWithCollections[]): string[] {
    return items.flatMap((item) => {
        const url = normalizeURL(item.url);
        return isHttpUrl(url) ? [url] : [];
    });
}

function useCollectionPanelHotkeys() {
    const { setIsCollectionsListOpen, setIsFavoritesListOpen } =
        useCollectionsListStore();

    const handleCollectionsListShortcutPress = useStableCallback(() => {
        setIsCollectionsListOpen((prev) => !prev);
    });

    const handleFavoritesListShortcutPress = useStableCallback(() => {
        setIsFavoritesListOpen((prev) => !prev);
    });

    useHotkeys("shift+mod+c", handleCollectionsListShortcutPress, {
        description: "Toggle collections panel",
        preventDefault: true,
    });

    useHotkeys("shift+mod+f", handleFavoritesListShortcutPress, {
        description: "Toggle favorites panel",
        preventDefault: true,
    });
}

interface UseCollectionHoverHotkeysProps {
    hoveredCollectionIdRef: React.RefObject<string | null>;
    hoveredCollectionSourceRef: React.RefObject<CollectionListSource | null>;
    onCopyLinks: (collection: LibraryCollectionSummary) => Promise<void>;
    onDelete: (collection: LibraryCollectionSummary) => void;
    onRename: (collection: LibraryCollectionSummary) => void;
    onSetPriorityComboboxOpen: React.Dispatch<
        React.SetStateAction<PriorityComboboxOpenTarget | null>
    >;
    onUpdatePriority: (
        collectionId: string,
        priority: CollectionPriority
    ) => Promise<void>;
}

function useCollectionHoverHotkeys({
    hoveredCollectionIdRef,
    hoveredCollectionSourceRef,
    onCopyLinks,
    onDelete,
    onRename,
    onSetPriorityComboboxOpen,
    onUpdatePriority,
}: UseCollectionHoverHotkeysProps) {
    const { favoriteCollectionIdSet, toggleFavorite } =
        useToggleCollectionFavorite();
    const { collections } = useCollectionsContext();
    const hoverHotkeySurface = useHoverHotkeySurface();

    const resolveHoveredCollection = useStableCallback(() => {
        if (!hoverHotkeySurface.isOwnedBy(HOVER_HOTKEY_REGIONS.collections)) {
            return null;
        }
        return (
            collections.find(
                (collection) => collection.id === hoveredCollectionIdRef.current
            ) ?? null
        );
    });

    const handleRename = useStableCallback((event: KeyboardEvent) => {
        const target = resolveHoveredCollection();
        if (target) {
            event.preventDefault();
            onRename(target);
        }
    });

    const handleDelete = useStableCallback((event: KeyboardEvent) => {
        const target = resolveHoveredCollection();
        if (target) {
            event.preventDefault();
            onDelete(target);
        }
    });

    const handleCopyLinks = useStableCallback((event: KeyboardEvent) => {
        const target = resolveHoveredCollection();
        if (target && target.itemCount > 0) {
            event.preventDefault();
            onCopyLinks(target);
        }
    });

    const handleFavorite = useStableCallback((event: KeyboardEvent) => {
        const target = resolveHoveredCollection();
        if (target && !favoriteCollectionIdSet.has(target.id)) {
            event.preventDefault();
            toggleFavorite(target);
        }
    });

    const handleArchiveToggle = useStableCallback((event: KeyboardEvent) => {
        const target = resolveHoveredCollection();
        if (target) {
            event.preventDefault();
            onUpdatePriority(
                target.id,
                getToggledArchivePriority(target.priority)
            );
        }
    });

    const handleSetPriority = useStableCallback((event: KeyboardEvent) => {
        const target = resolveHoveredCollection();
        if (!target) {
            return;
        }
        const source = hoveredCollectionSourceRef.current;
        if (!source) {
            return;
        }
        event.preventDefault();
        onSetPriorityComboboxOpen({ collectionId: target.id, source });
    });

    useHotkeys("alt+e", handleRename, {
        description: "Rename hovered collection",
    });

    useHotkeys(["delete", "backspace"], handleDelete, {
        description: "Delete hovered collection",
    });

    useHotkeys("c", handleCopyLinks, {
        description: "Copy links from hovered collection",
    });

    useHotkeys("alt+f", handleFavorite, {
        description: "Favorite hovered collection",
    });

    useHotkeys("shift+mod+a", handleArchiveToggle, {
        description: "Archive or unarchive hovered collection",
    });

    useHotkeys("p", handleSetPriority, {
        description: "Set priority for hovered collection",
    });
}

interface UseCollectionPreviewPlaybackProps {
    isCycling: boolean;
    shouldLoad: boolean;
    thumbnails: string[];
}

function useCollectionPreviewPlayback({
    isCycling,
    shouldLoad,
    thumbnails,
}: UseCollectionPreviewPlaybackProps) {
    const prefersReducedMotion = useReducedMotion();
    const thumbnailsKey = thumbnails.join("\0");
    const slideTimeout = useTimeout();

    const [aspectsBySrc, setAspectsBySrc] = React.useState<
        Record<string, number>
    >({});
    const [activeSrc, setActiveSrc] = React.useState<string | null>(null);
    const [prevShouldLoad, setPrevShouldLoad] = React.useState(shouldLoad);

    const readySlides = thumbnails.flatMap((url) => {
        const aspectRatio = aspectsBySrc[url] ?? peekImageAspect(url);
        return aspectRatio === undefined ? [] : [{ aspectRatio, src: url }];
    });
    const readySlidesRef = useValueAsRef(readySlides);

    if (!Object.is(prevShouldLoad, shouldLoad)) {
        setPrevShouldLoad(shouldLoad);
        // Reset playback so the next hover starts from the first slide.
        if (!shouldLoad) {
            setActiveSrc(null);
        }
    }

    React.useEffect(() => {
        if (!shouldLoad) {
            return;
        }

        let cancelled = false;
        const urls =
            thumbnailsKey.length === 0 ? [] : thumbnailsKey.split("\0");

        for (const url of urls) {
            preloadImageAspect(url).then((aspectRatio) => {
                if (cancelled || aspectRatio === null) {
                    return;
                }
                setAspectsBySrc((previous) =>
                    previous[url] === undefined
                        ? { ...previous, [url]: aspectRatio }
                        : previous
                );
            });
        }

        return () => {
            cancelled = true;
        };
    }, [shouldLoad, thumbnailsKey]);

    const activeSlide = resolveActivePreviewSlide(readySlides, activeSrc);
    if (activeSlide !== null && !Object.is(activeSlide.src, activeSrc)) {
        setActiveSrc(activeSlide.src);
    }

    const shouldCycle =
        isCycling && readySlides.length > 1 && prefersReducedMotion !== true;

    React.useEffect(() => {
        if (!shouldCycle) {
            slideTimeout.clear();
            return;
        }

        const scheduleNext = () => {
            slideTimeout.start(PREVIEW_SLIDE_INTERVAL_MS, () => {
                setActiveSrc((currentSrc) =>
                    nextPreviewSlideSrc(readySlidesRef.current, currentSrc)
                );
                scheduleNext();
            });
        };
        scheduleNext();

        return () => {
            slideTimeout.clear();
        };
    }, [shouldCycle, slideTimeout, readySlidesRef]);

    const reportSlideError = useStableCallback((src: string) => {
        forgetImageAspect(src);
        setAspectsBySrc((previous) => {
            if (previous[src] === undefined) {
                return previous;
            }
            const next = { ...previous };
            delete next[src];
            return next;
        });
        setActiveSrc((currentSrc) => (currentSrc === src ? null : currentSrc));
    });

    return {
        activeSlide,
        reportSlideError,
    };
}

function resolveActivePreviewSlide(
    readySlides: ReadyPreviewSlide[],
    activeSrc: string | null
): ReadyPreviewSlide | null {
    if (activeSrc !== null) {
        const match = readySlides.find((slide) => slide.src === activeSrc);
        if (match) {
            return match;
        }
    }
    return readySlides[0] ?? null;
}

function nextPreviewSlideSrc(
    readySlides: ReadyPreviewSlide[],
    activeSrc: string | null
): string | null {
    const [first] = readySlides;
    if (!first) {
        return null;
    }
    if (readySlides.length === 1) {
        return first.src;
    }
    const currentIndex = readySlides.findIndex(
        (slide) => slide.src === activeSrc
    );
    const nextIndex =
        currentIndex < 0 ? 0 : (currentIndex + 1) % readySlides.length;
    return readySlides[nextIndex]?.src ?? first.src;
}

function useFailedImageSrc(src: string | Blob | undefined) {
    const [failedSrc, setFailedSrc] = React.useState<string | Blob | null>(
        null
    );

    const handleError = useStableCallback(() => {
        if (src) {
            setFailedSrc(src);
        }
    });

    return { handleError, hasFailed: failedSrc === src };
}

interface UseInternalCollectionsStateProps {
    initialCollections: LibraryCollectionSummary[];
}

function useInternalCollectionsState({
    initialCollections,
}: UseInternalCollectionsStateProps) {
    const { sortField, textMatchQuery, view } = useCollectionsListStore();

    const [collections, setCollections] = React.useState<
        LibraryCollectionSummary[]
    >(() => initialCollections);

    const [selectedCollectionIds, setSelectedCollectionIds] = useQueryState(
        "collection",
        parseAsArrayOf(parseAsString).withDefault([])
    );

    const collectionSummaries = sortCollectionSummaries(
        getVisibleCollections(collections, view),
        sortField,
        sortField === "text-match" ? textMatchQuery : ""
    );

    const validCollectionIds = new Set(
        collections.map((collection) => collection.id)
    );
    const validSelectedCollectionIds = selectedCollectionIds.filter((id) =>
        validCollectionIds.has(id)
    );
    const selectedCollectionIdSet = new Set(validSelectedCollectionIds);

    const clearCollectionFilters = useStableCallback(() => {
        setSelectedCollectionIds([]);
    });

    const toggleCollectionSelection = useStableCallback((id: string) => {
        setSelectedCollectionIds((current) =>
            toggleValue(
                current.filter((activeId) => validCollectionIds.has(activeId)),
                id
            )
        );
    });

    const mergeCollectionSummariesState = useStableCallback(
        (nextCollections: LibraryCollectionSummary[]) => {
            setCollections((current) =>
                mergeCollectionSummaries(current, nextCollections)
            );
        }
    );

    const replaceCollections = useStableCallback(
        (nextCollections: LibraryCollectionSummary[]) => {
            setCollections(sortCollections(nextCollections));
            const nextCollectionIdSet = new Set(
                nextCollections.map((collection) => collection.id)
            );
            setSelectedCollectionIds((current) =>
                current.filter((id) => nextCollectionIdSet.has(id))
            );
        }
    );

    const syncCollectionName = useStableCallback((id: string, name: string) => {
        setCollections((current) => replaceCollectionName(current, id, name));
    });

    const syncCollectionPriority = useStableCallback(
        (id: string, priority: CollectionPriority) => {
            setCollections((current) =>
                replaceCollectionPriority(current, id, priority)
            );
        }
    );

    const syncCollectionShare = useStableCallback(
        (next: CollectionShareState) => {
            setCollections((current) =>
                replaceCollectionShareState(current, next)
            );
        }
    );

    const syncCollectionDeleted = useStableCallback((collectionId: string) => {
        setCollections((current) =>
            current.filter((collection) => collection.id !== collectionId)
        );
        setSelectedCollectionIds((current) =>
            removeValue(current, collectionId)
        );
    });

    return {
        collectionSummaries,
        collections,
        mergeCollectionSummaries: mergeCollectionSummariesState,
        onClearCollectionFilters: clearCollectionFilters,
        onSelectCollection: toggleCollectionSelection,
        replaceCollections,
        selectedCollectionIdSet,
        selectedCollectionIds: validSelectedCollectionIds,
        syncCollectionDeleted,
        syncCollectionName,
        syncCollectionPriority,
        syncCollectionShare,
    };
}

function getTextMatchScore(name: string, query: string): number {
    if (query.length === 0) {
        return 0;
    }
    if (name === query) {
        return 3;
    }
    if (name.startsWith(query)) {
        return 2;
    }
    if (name.includes(query)) {
        return 1;
    }
    return 0;
}

function sortCollectionSummaries<T extends SortableCollectionSummary>(
    collections: readonly T[],
    sortField: CollectionSortField,
    query = ""
): T[] {
    if (sortField !== "text-match") {
        return collections.toSorted(SUMMARY_SORTERS[sortField]);
    }
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
        return collections.toSorted(compareNames);
    }
    const decorated = collections.map((collection) => {
        const normalizedName = collection.name.trim().toLowerCase();
        return {
            collection,
            score: getTextMatchScore(normalizedName, normalizedQuery),
        };
    });
    decorated.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return NAME_COLLATOR.compare(a.collection.name, b.collection.name);
    });
    return decorated.map((item) => item.collection);
}

function getVisibleCollections(
    collections: LibraryCollectionSummary[],
    view: CollectionView
): LibraryCollectionSummary[] {
    if (view === "exclude-archives") {
        return collections.filter(
            (collection) => collection.priority !== "archive"
        );
    }
    if (view === "show-shared-only") {
        return collections.filter((collection) => collection.shareId !== null);
    }
    return collections;
}

function mergeCollectionSummaries(
    collections: LibraryCollectionSummary[],
    nextCollections: LibraryCollectionSummary[]
): LibraryCollectionSummary[] {
    if (nextCollections.length === 0) {
        return collections;
    }
    return sortCollections(mergeById(collections, nextCollections));
}

function useCreateDialogState() {
    const { setCreateItemId, setIsCreateOpen } = useCollectionsListStore();

    const requestCreate = useStableCallback((itemId?: string) => {
        setCreateItemId(itemId ?? null);
        setIsCreateOpen(true);
    });

    const onCloseCreate = useStableCallback(() => {
        setIsCreateOpen(false);
        setCreateItemId(null);
    });

    return { onCloseCreate, requestCreate };
}

function compareCreatedAt<
    T extends Pick<SortableCollectionSummary, "createdAt" | "name">,
>(a: T, b: T) {
    const diff = b.createdAt.getTime() - a.createdAt.getTime();
    return diff === 0 ? compareNames(a, b) : diff;
}

function compareUpdatedAt<
    T extends Pick<SortableCollectionSummary, "name" | "updatedAt">,
>(a: T, b: T) {
    const diff = b.updatedAt.getTime() - a.updatedAt.getTime();
    return diff === 0 ? compareNames(a, b) : diff;
}

function compareItemCount<
    T extends Pick<SortableCollectionSummary, "itemCount" | "name">,
>(a: T, b: T) {
    const diff = b.itemCount - a.itemCount;
    return diff === 0 ? compareNames(a, b) : diff;
}

export function reconcileCollectionTags(
    collections: readonly LibraryCollectionSummary[],
    tags: readonly LibraryCollectionTag[]
): LibraryCollectionTag[] {
    const collectionById = keyBy(collections, (collection) => collection.id);

    return tags.flatMap((tag) => {
        const collection = collectionById.get(tag.id);
        return collection ? [toLibraryCollectionTag(collection)] : [];
    });
}

export function replaceMultipleItemCollections(
    items: LibraryItemWithCollections[],
    itemCollections: Array<{
        collections: LibraryCollectionTag[];
        itemId: string;
    }>
): LibraryItemWithCollections[] {
    if (itemCollections.length === 0) {
        return items;
    }

    const collectionsByItemId = keyBy(itemCollections, (entry) => entry.itemId);

    return items.map((item) => {
        const nextCollections = collectionsByItemId.get(item.id)?.collections;
        return nextCollections === undefined
            ? item
            : { ...item, collections: nextCollections };
    });
}

function getToggledArchivePriority(
    priority: CollectionPriority
): CollectionPriority {
    return priority === "archive" ? "none" : "archive";
}

function compareNames<T extends Pick<SortableCollectionSummary, "name">>(
    a: T,
    b: T
) {
    return NAME_COLLATOR.compare(a.name, b.name);
}

function comparePriorities<
    T extends Pick<SortableCollectionSummary, "name" | "priority">,
>(a: T, b: T) {
    const diff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return diff === 0 ? compareNames(a, b) : diff;
}

export function sortCollections<
    T extends Pick<LibraryCollectionSummary, "name" | "priority">,
>(collections: readonly T[]): T[] {
    return collections.toSorted(comparePriorities);
}

function patchCollection<T extends LibraryCollectionTag>(
    collections: T[],
    id: string,
    patch: Partial<Pick<T, keyof LibraryCollectionTag>>
): T[] {
    const index = collections.findIndex((collection) => collection.id === id);
    const current = collections[index];
    if (current === undefined) {
        return collections;
    }

    const next = { ...current, ...patch };
    const hasChanges = (
        Object.keys(patch) as Array<keyof LibraryCollectionTag>
    ).some((key) => current[key] !== next[key]);

    if (!hasChanges) {
        return collections;
    }

    return collections.map((collection, collectionIndex) =>
        collectionIndex === index ? next : collection
    );
}

function replaceCollectionShareState<T extends LibraryCollectionTag>(
    collections: T[],
    next: CollectionShareState
): T[] {
    return patchCollection(collections, next.id, {
        sharedAt: next.sharedAt,
        shareId: next.shareId,
        updatedAt: next.updatedAt,
    });
}

function replaceCollectionName<T extends LibraryCollectionTag>(
    collections: T[],
    id: string,
    name: string
): T[] {
    const nextCollections = patchCollection(collections, id, { name });
    return nextCollections === collections
        ? collections
        : sortCollections(nextCollections);
}

function replaceCollectionPriority<T extends LibraryCollectionTag>(
    collections: T[],
    id: string,
    priority: CollectionPriority
): T[] {
    const nextCollections = patchCollection(collections, id, { priority });
    return nextCollections === collections
        ? collections
        : sortCollections(nextCollections);
}

function getFavoriteCollections(
    collectionSummaries: LibraryCollectionSummary[],
    favoriteCollectionIds: readonly string[]
): LibraryCollectionSummary[] {
    if (favoriteCollectionIds.length === 0) {
        return [];
    }
    const favoriteCollectionIdSet = new Set(favoriteCollectionIds);
    return collectionSummaries.filter((collection) =>
        favoriteCollectionIdSet.has(collection.id)
    );
}

function getCreatedAssignedItemIds(
    result: Extract<
        CollectionCreateResult,
        { status: typeof ACTION_STATUS.CREATED }
    >
): string[] {
    return result.assignedItemId ? [result.assignedItemId] : [];
}

async function createCollectionAndSync({
    assignToItemId,
    description,
    name,
    syncCreated,
}: CreateCollectionAndSyncInput): Promise<CollectionCreateResult> {
    const result = await createCollectionSafely({
        assignToItemId,
        description,
        name,
    });

    if (result.status !== ACTION_STATUS.CREATED) {
        return result;
    }

    syncCreated({
        assignedItemIds: getCreatedAssignedItemIds(result),
        collection: result.collection,
    });
    return result;
}

async function refreshCollectionSuggestions(
    mutateSuggestions: () => Promise<unknown>,
    errorMessage: string
): Promise<void> {
    try {
        await mutateSuggestions();
    } catch (error) {
        log.error(errorMessage, { error });
    }
}

function getPriorityOption(priority: CollectionPriority): PriorityOption {
    return PRIORITY_BY_VALUE.get(priority) ?? DEFAULT_PRIORITY;
}

function getCollectionItemStyle(
    name: string,
    isSelected: boolean
): CollectionItemStyle {
    const hexColor = getHexColorFromName(name);
    const baseMix = `color-mix(in srgb, ${hexColor} ${isSelected ? 20 : 10}%, transparent)`;

    return {
        "--accent-color": `color-mix(in srgb, ${hexColor}, light-dark(black, white) 20%)`,
        "--collection-background": isSelected
            ? `color-mix(in srgb, ${baseMix}, light-dark(white, black) 2%)`
            : `color-mix(in srgb, ${baseMix}, light-dark(black, white) 2%)`,
        "--text-muted-color": `color-mix(in srgb, ${hexColor} 28%, light-dark(black, white) 22%)`,
    };
}

function toComboboxValue(
    option: { icon: React.ElementType; label: string },
    current: ComboboxValue,
    overrides: Partial<
        Pick<ComboboxValue, "sortField" | "sortQuery" | "view">
    > = {}
): ComboboxValue {
    return {
        icon: option.icon,
        label: option.label,
        sortField: overrides.sortField ?? current.sortField,
        sortQuery: overrides.sortQuery ?? current.sortQuery,
        view: overrides.view ?? current.view,
    };
}

function getComboboxCollectionsSortingGroups(
    inputValue: string,
    currentValue: ComboboxValue
): ComboboxGroupData[] {
    const query = inputValue.trim();
    const normalizedQuery = query.toLowerCase();

    const matchingSortOptions = SORT_OPTIONS.filter((option) =>
        option.label.toLowerCase().includes(normalizedQuery)
    );

    const hasActiveTextMatch =
        currentValue.sortField === "text-match" &&
        currentValue.sortQuery.length > 0;

    const queryMatchesActiveTextMatch =
        hasActiveTextMatch &&
        currentValue.sortQuery.toLowerCase().includes(normalizedQuery);

    let textMatchItem: ComboboxValue | null = null;

    if (
        hasActiveTextMatch &&
        (normalizedQuery.length === 0 || queryMatchesActiveTextMatch)
    ) {
        textMatchItem = toComboboxValue(
            {
                icon: ListFilter,
                label: `\u201c${currentValue.sortQuery}\u201d`,
            },
            currentValue,
            { sortField: "text-match" }
        );
    } else if (normalizedQuery.length > 0) {
        textMatchItem = toComboboxValue(
            { icon: ListFilter, label: `\u201c${query}\u201d` },
            currentValue,
            { sortField: "text-match", sortQuery: query }
        );
    }

    const groups: ComboboxGroupData[] = [];

    if (matchingSortOptions.length > 0) {
        groups.push({
            group: "sort",
            items: matchingSortOptions.map((option) =>
                toComboboxValue(option, currentValue, {
                    sortField: option.value,
                })
            ),
        });
    }

    if (textMatchItem) {
        groups.push({ group: "text-match", items: [textMatchItem] });
    }

    const matchingViewOptions = VIEW_OPTIONS.filter((option) =>
        option.label.toLowerCase().includes(normalizedQuery)
    );

    if (matchingViewOptions.length > 0) {
        groups.push({
            group: "view",
            items: matchingViewOptions.map((option) =>
                toComboboxValue(option, currentValue, { view: option.value })
            ),
        });
    }

    return groups;
}

function getComboboxOptionValue(value: ComboboxValue): string {
    return `${value.sortField}:${value.view}:${value.sortQuery}`;
}

function isComboboxValueEqual(
    item: ComboboxValue,
    value: ComboboxValue
): boolean {
    return (
        item.sortField === value.sortField &&
        item.view === value.view &&
        (item.sortField !== "text-match" || item.sortQuery === value.sortQuery)
    );
}

function formatFavoritesGroupSummary(
    collectionLabels: string[],
    individualItemCount: number
): string {
    if (collectionLabels.length === 0 && individualItemCount === 0) {
        return "";
    }
    if (collectionLabels.length === 0) {
        return individualItemCount === 1
            ? "1 item"
            : `${individualItemCount} items`;
    }
    if (individualItemCount === 0) {
        return LIST_FORMATTER.format(collectionLabels);
    }
    const moreLabel =
        individualItemCount === 1 ? "1 more" : `${individualItemCount} more`;
    return LIST_FORMATTER.format([...collectionLabels, moreLabel]);
}

function getFavoriteItemLabel(item: LibraryItemWithCollections): string {
    if (item.kind === ITEM_KIND_NOTE) {
        return getNoteExcerpt(item.noteContentText) || "Untitled note";
    }
    return item.caption?.trim() || parseDisplayUrl(item.url) || "Saved item";
}

function buildPriorityBreakdownEntries(
    priorityCounts: Partial<Record<CollectionPriority, number>> | undefined
): PriorityBreakdownEntry[] {
    return PRIORITIES.flatMap((option) => {
        const optionCount = priorityCounts?.[option.value] ?? 0;
        return optionCount > 0 ? [{ ...option, count: optionCount }] : [];
    }).sort(
        (left, right) => PRIORITY_RANK[left.value] - PRIORITY_RANK[right.value]
    );
}

function appendCollection(
    items: LibraryItemWithCollections[],
    itemIds: string[],
    collection: LibraryCollectionTag
): LibraryItemWithCollections[] {
    const itemIdSet = new Set(itemIds);
    if (itemIdSet.size === 0) {
        return items;
    }

    return items.map((item) => {
        if (!itemIdSet.has(item.id)) {
            return item;
        }
        if (item.collections.some((entry) => entry.id === collection.id)) {
            return item;
        }
        return {
            ...item,
            collections: sortCollections([...item.collections, collection]),
        };
    });
}

function areCollectionTagListsEqual(
    current: readonly LibraryCollectionTag[],
    next: readonly LibraryCollectionTag[]
): boolean {
    return (
        current.length === next.length &&
        current.every((collection, index) => collection === next[index])
    );
}

function replaceItemCollectionTags(
    items: LibraryItemWithCollections[],
    updater: (tags: LibraryCollectionTag[]) => LibraryCollectionTag[]
): LibraryItemWithCollections[] {
    let hasChanges = false;
    const nextItems = items.map((item) => {
        const nextCollections = updater(item.collections);
        if (areCollectionTagListsEqual(item.collections, nextCollections)) {
            return item;
        }
        hasChanges = true;
        return { ...item, collections: nextCollections };
    });

    return hasChanges ? nextItems : items;
}

function getCollectionActionKey(
    action: CollectionAction,
    collectionId: string
): string {
    return `${action}:${collectionId}`;
}

export function Collections() {
    return (
        <CollectionsListProvider>
            <CollectionsListFavorites
                className="group/collapsible"
                data-sidebar-collapsible=""
            >
                <CollectionsListToolbar className="group">
                    <CollectionsListFavoritesTrigger>
                        <T>Favorites</T>
                    </CollectionsListFavoritesTrigger>
                    <CollectionsListToolbarGroup>
                        <Kbd className="invisible bg-transparent opacity-80 group-hover:visible group-focus-visible:visible group-has-data-open/collapsible:hidden">
                            <ShiftKbd />
                            <CmdKbd />F
                        </Kbd>
                    </CollectionsListToolbarGroup>
                </CollectionsListToolbar>
                <CollapsiblePanel>
                    <CollectionsListFavoritesItemsContent>
                        {(item) => (
                            <CollectionsListFavoritesItem
                                item={item}
                                key={item.id}
                            />
                        )}
                    </CollectionsListFavoritesItemsContent>
                    <CollectionsListFavoritesContent>
                        {(collection) => (
                            <CollectionsListItem
                                collection={collection}
                                key={collection.id}
                                source="favorites"
                            >
                                <CollectionsListItemPriorityCombobox />
                                <CollectionsListItemTrigger>
                                    <CollectionsListItemValue />
                                </CollectionsListItemTrigger>
                                <CollectionsListItemControls>
                                    {dayjs(collection.updatedAt).fromNow(true)}
                                </CollectionsListItemControls>
                            </CollectionsListItem>
                        )}
                    </CollectionsListFavoritesContent>
                </CollapsiblePanel>
            </CollectionsListFavorites>
            <CollectionsList
                className="group/collapsible"
                data-sidebar-collapsible=""
            >
                <CollectionsListToolbar className="group">
                    <CollectionsListTrigger>
                        <T>Collections</T>
                    </CollectionsListTrigger>
                    <CollectionsListToolbarGroup>
                        <Kbd className="invisible bg-transparent opacity-80 group-hover:visible group-focus-visible:visible group-has-data-open/collapsible:hidden">
                            <ShiftKbd />
                            <CmdKbd />C
                        </Kbd>
                        <CollectionsListToolbarButton
                            render={<CollectionsListClearButton />}
                        />
                        <CollectionsListToolbarButton
                            render={<CollectionsListSortingCombobox />}
                        />
                        <CollectionsListToolbarButton
                            render={<CollectionsListCreateButton />}
                        />
                    </CollectionsListToolbarGroup>
                </CollectionsListToolbar>
                <CollapsiblePanel>
                    <div className="flex p-1.5 pt-0.5 pl-2.5">
                        <CollectionsListSmartCollectionsPopover />
                    </div>
                    <CollectionsListEmpty />
                    <CollectionsListContent>
                        {(collection) => (
                            <CollectionsListItem
                                collection={collection}
                                key={collection.id}
                                source="collections"
                            >
                                <CollectionsListItemPriorityCombobox />
                                <CollectionsListItemTrigger>
                                    <CollectionsListItemValue />
                                </CollectionsListItemTrigger>
                                <CollectionsListItemControls>
                                    {COMPACT_NUMBER_FORMATTER.format(
                                        collection.itemCount
                                    )}
                                </CollectionsListItemControls>
                            </CollectionsListItem>
                        )}
                    </CollectionsListContent>
                    <CollectionsListSuggestions>
                        {(template) => (
                            <CollectionsListSuggestionItem
                                key={template.value}
                                template={template}
                            />
                        )}
                    </CollectionsListSuggestions>
                </CollapsiblePanel>
            </CollectionsList>
            <CollectionsListStatus />
            <CollectionsRenameDialog />
            <CollectionsCreateDialog />
            <CollectionsDeleteDialog />
        </CollectionsListProvider>
    );
}

interface CollectionsProviderProps extends React.PropsWithChildren {
    initialCollections: LibraryCollectionSummary[];
}

export function CollectionsProvider({
    children,
    initialCollections,
}: CollectionsProviderProps) {
    const { setItems } = useItemsStateContext();
    const state = useInternalCollectionsState({ initialCollections });
    const createDialog = useCreateDialogState();
    const collectionActionKeys = useRefWithInit(
        () => new Set<string>()
    ).current;
    const [pendingCollectionActionKeys, setPendingCollectionActionKeys] =
        React.useState<ReadonlySet<string>>(() => new Set());

    const claimCollectionAction = useStableCallback(
        (action: CollectionAction, collectionId: string) => {
            const key = getCollectionActionKey(action, collectionId);
            if (collectionActionKeys.has(key)) {
                return null;
            }

            collectionActionKeys.add(key);
            setPendingCollectionActionKeys(new Set(collectionActionKeys));

            return () => {
                if (!collectionActionKeys.delete(key)) {
                    return;
                }
                setPendingCollectionActionKeys(new Set(collectionActionKeys));
            };
        }
    );

    const isCollectionActionPending = (
        action: CollectionAction,
        collectionId: string
    ) =>
        pendingCollectionActionKeys.has(
            getCollectionActionKey(action, collectionId)
        );

    const syncCollectionCreated = useStableCallback(
        (input: SyncCreatedCollectionInput) => {
            state.mergeCollectionSummaries([input.collection]);
            setItems((current) =>
                appendCollection(
                    current,
                    input.assignedItemIds,
                    input.collection
                )
            );
        }
    );

    const syncCollectionDeleted = useStableCallback((collectionId: string) => {
        state.syncCollectionDeleted(collectionId);
        setItems((current) =>
            replaceItemCollectionTags(current, (tags) =>
                tags.filter((tag) => tag.id !== collectionId)
            )
        );
    });

    const syncCollectionName = useStableCallback((id: string, name: string) => {
        state.syncCollectionName(id, name);
        setItems((current) =>
            replaceItemCollectionTags(current, (tags) =>
                replaceCollectionName(tags, id, name)
            )
        );
    });

    const syncCollectionPriority = useStableCallback(
        (id: string, priority: CollectionPriority) => {
            state.syncCollectionPriority(id, priority);
            setItems((current) =>
                replaceItemCollectionTags(current, (tags) =>
                    replaceCollectionPriority(tags, id, priority)
                )
            );
        }
    );

    const syncCollectionShare = useStableCallback(
        (next: CollectionShareState) => {
            state.syncCollectionShare(next);
            setItems((current) =>
                replaceItemCollectionTags(current, (tags) =>
                    replaceCollectionShareState(tags, next)
                )
            );
        }
    );

    const contextValue: CollectionsRootContext = {
        ...state,
        onCloseCreate: createDialog.onCloseCreate,
        requestCreate: createDialog.requestCreate,
        syncCollectionCreated,
        syncCollectionDeleted,
        syncCollectionName,
        syncCollectionPriority,
        syncCollectionShare,
    };

    const pendingActionsContextValue: CollectionsRootPendingActionsContext = {
        claimCollectionAction,
        isCollectionActionPending,
    };

    return (
        <CollectionsRootContext value={contextValue}>
            <CollectionsRootPendingActionsContext
                value={pendingActionsContextValue}
            >
                {children}
            </CollectionsRootPendingActionsContext>
        </CollectionsRootContext>
    );
}

function CollectionsListProvider({ children }: React.PropsWithChildren) {
    const { syncCollectionCreated, syncCollectionDeleted, syncCollectionName } =
        useCollectionsContext();
    const { setFavoriteCollectionIds } = useCollectionsListStore();
    const dialogs = useCollectionDialogRequests();
    const rowActions = useCollectionRowActions();

    const hoveredCollectionIdRef = React.useRef<string | null>(null);
    const hoveredCollectionSourceRef =
        React.useRef<CollectionListSource | null>(null);
    const hoverHotkeySurface = useHoverHotkeySurface();

    useCollectionHoverHotkeys({
        hoveredCollectionIdRef,
        hoveredCollectionSourceRef,
        onCopyLinks: rowActions.onCopyLinks,
        onDelete: dialogs.requestDelete,
        onRename: dialogs.requestRename,
        onSetPriorityComboboxOpen: rowActions.setPendingPriorityComboboxOpen,
        onUpdatePriority: rowActions.onUpdatePriority,
    });

    useCollectionPanelHotkeys();

    const syncDeleted = useStableCallback((collectionId: string) => {
        syncCollectionDeleted(collectionId);
        if (hoveredCollectionIdRef.current === collectionId) {
            hoveredCollectionIdRef.current = null;
            hoverHotkeySurface.clear();
        }
        setFavoriteCollectionIds((current) =>
            removeValue(current, collectionId)
        );
    });

    const setHoveredCollectionSource = useStableCallback(
        (source: CollectionListSource | null) => {
            hoveredCollectionSourceRef.current = source;
        }
    );

    React.useEffect(() => {
        const clearStaleCollectionHover = () => {
            hoveredCollectionIdRef.current = null;
            hoveredCollectionSourceRef.current = null;
            hoverHotkeySurface.clear();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                clearStaleCollectionHover();
            }
        };
        const win = getOwnerWindow();
        const doc = getOwnerDocument();
        win.addEventListener("blur", clearStaleCollectionHover);
        doc.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            win.removeEventListener("blur", clearStaleCollectionHover);
            doc.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [hoverHotkeySurface]);

    const hoverContextValue: CollectionsListHoverContext = {
        hoveredCollectionIdRef,
        hoveredCollectionSourceRef,
        setHoveredCollectionSource,
    };

    const stateContextValue: CollectionsListStateContext = {
        pendingDelete: dialogs.pendingDelete,
        pendingPriorityComboboxOpen: rowActions.pendingPriorityComboboxOpen,
        pendingRename: dialogs.pendingRename,
    };

    const actionsContextValue: CollectionsListActionsContext = {
        closeCreateDialog: dialogs.closeCreateDialog,
        closePendingDelete: dialogs.closePendingDelete,
        closePendingRename: dialogs.closePendingRename,
        createSubmissionPendingRef: dialogs.createSubmissionPendingRef,
        onCopyLinks: rowActions.onCopyLinks,
        onCopyTitle: rowActions.onCopyTitle,
        onDelete: dialogs.requestDelete,
        onDuplicate: rowActions.onDuplicate,
        onExportCsv: rowActions.onExportCsv,
        onOpenLinks: rowActions.onOpenLinks,
        onRename: dialogs.requestRename,
        onUpdatePriority: rowActions.onUpdatePriority,
        openCreateDialog: dialogs.openCreateDialog,
        setPendingPriorityComboboxOpen:
            rowActions.setPendingPriorityComboboxOpen,
        syncCreated: syncCollectionCreated,
        syncDeleted,
        syncName: syncCollectionName,
    };

    return (
        <CollectionsListHoverContext value={hoverContextValue}>
            <CollectionsListStateContext value={stateContextValue}>
                <CollectionsListActionsContext value={actionsContextValue}>
                    {children}
                </CollectionsListActionsContext>
            </CollectionsListStateContext>
        </CollectionsListHoverContext>
    );
}

function CollectionsList(props: React.ComponentProps<typeof Collapsible>) {
    const { isCollectionsListOpen, setIsCollectionsListOpen } =
        useCollectionsListStore();

    return (
        <Collapsible
            {...props}
            onOpenChange={setIsCollectionsListOpen}
            open={isCollectionsListOpen}
        />
    );
}

interface CollectionsListChildrenProps<T> {
    children: (item: T, index: number) => React.ReactNode;
}

function CollectionsListContent({
    children,
}: CollectionsListChildrenProps<LibraryCollectionSummary>) {
    const { collectionSummaries } = useCollectionsContext();
    const { sortField } = useCollectionsListStore();

    const groups = groupCollectionsBySortField(
        collectionSummaries,
        sortField,
        dayjs()
    );

    if (!groups) {
        return (
            <CollapsibleListVertical className="ml-1.25" maxVisible={10}>
                {collectionSummaries.map(children)}
            </CollapsibleListVertical>
        );
    }

    return groups.map((group) => (
        <CollectionsListGroup
            collections={group.collections}
            key={group.groupId}
            label={
                COLLECTIONS_LIST_GROUP_LABELS[group.groupId] ?? group.groupId
            }
        >
            {children}
        </CollectionsListGroup>
    ));
}

function CollectionsListFavoritesContent({
    children,
}: CollectionsListChildrenProps<LibraryCollectionSummary>) {
    const favoriteCollections = useFavoriteCollections();

    return (
        <CollapsibleListVertical className="ml-1.25" maxVisible={10}>
            {favoriteCollections.map(children)}
        </CollapsibleListVertical>
    );
}

interface CollectionsListGroupProps {
    children: (
        item: LibraryCollectionSummary,
        index: number
    ) => React.ReactNode;
    collections: LibraryCollectionSummary[];
    label: React.ReactNode;
}

function CollectionsListGroup({
    children,
    collections,
    label,
}: CollectionsListGroupProps) {
    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-between px-2.5 py-1.5">
                <span className="min-w-0 truncate font-medium text-[11px] text-muted-foreground/50">
                    {label}
                </span>
            </div>
            <CollapsibleListVertical className="ml-1.25" maxVisible={10}>
                {collections.map(children)}
            </CollapsibleListVertical>
        </div>
    );
}

interface CollectionsListGroupTriggerProps
    extends React.ComponentProps<typeof CollapsibleTrigger> {
    count: number;
    description?: string;
    isOpen: boolean;
    labels: string[];
    placeholder: string;
    priorityCounts?: Partial<Record<CollectionPriority, number>>;
}

function CollectionsListGroupTrigger({
    children,
    count,
    description,
    isOpen,
    labels,
    placeholder,
    priorityCounts,
    render,
    ...props
}: CollectionsListGroupTriggerProps) {
    const gt = useGT();

    return (
        <PreviewCard>
            <PreviewCardTrigger
                render={
                    <CollapsibleTrigger
                        {...props}
                        render={
                            render ?? (
                                <SidebarItem
                                    render={<button type="button" />}
                                />
                            )
                        }
                        title={
                            isOpen ? gt("Collapse group") : gt("Expand group")
                        }
                    />
                }
            >
                <span className="min-w-0 text-xs">
                    {children}&nbsp;
                    <Calligraph className="mx-0.5 opacity-80">
                        {count}
                    </Calligraph>
                </span>
                <ChevronDownFilledIcon
                    aria-hidden
                    className="-ml-0.5"
                    focusable="false"
                />
            </PreviewCardTrigger>
            <PreviewCardPopup
                align="start"
                className="p-3"
                positionMethod="fixed"
                side="right"
            >
                <CollectionsListGroupSummary
                    description={description}
                    isOpen={isOpen}
                    labels={labels}
                    placeholder={placeholder}
                    priorityCounts={priorityCounts}
                />
            </PreviewCardPopup>
        </PreviewCard>
    );
}

interface CollectionsListGroupSummaryProps {
    description?: string;
    isOpen: boolean;
    labels: string[];
    placeholder: string;
    priorityCounts?: Partial<Record<CollectionPriority, number>>;
}

function CollectionsListGroupSummary({
    description,
    isOpen,
    labels,
    placeholder,
    priorityCounts,
}: CollectionsListGroupSummaryProps) {
    const priorityBreakdownEntries =
        buildPriorityBreakdownEntries(priorityCounts);

    if (isOpen && priorityBreakdownEntries.length > 0) {
        return <CollectionsListBreakdown entries={priorityBreakdownEntries} />;
    }

    const summary =
        description ??
        (labels.length > 0 ? LIST_FORMATTER.format(labels) : placeholder);

    return (
        <p className="whitespace-normal font-medium text-xs leading-tight">
            {summary}
        </p>
    );
}

function CollectionsListTrigger(
    props: React.ComponentProps<typeof CollapsibleTrigger>
) {
    const { collectionSummaries } = useCollectionsContext();
    const { isCollectionsListOpen } = useCollectionsListStore();

    const collectionLabels = collectionSummaries.map(
        (collection) => collection.name
    );
    const priorityCounts = countBy(
        collectionSummaries,
        (collection) => collection.priority
    );

    return (
        <CollectionsListGroupTrigger
            {...props}
            count={collectionSummaries.length}
            isOpen={isCollectionsListOpen}
            labels={collectionLabels}
            placeholder="No collections yet"
            priorityCounts={priorityCounts}
        />
    );
}

function CollectionsListFavorites(
    props: React.ComponentProps<typeof Collapsible>
) {
    const { isFavoritesListOpen, setIsFavoritesListOpen } =
        useCollectionsListStore();
    const { favoriteItems } = useItemsContext();
    const favoriteCollections = useFavoriteCollections();

    const hasFavoriteItems = favoriteItems.length > 0;
    const hasFavoriteCollections = favoriteCollections.length > 0;

    if (!(hasFavoriteCollections || hasFavoriteItems)) {
        return null;
    }

    return (
        <Collapsible
            {...props}
            onOpenChange={setIsFavoritesListOpen}
            open={isFavoritesListOpen}
        />
    );
}

function CollectionsListFavoritesTrigger(
    props: React.ComponentProps<typeof CollapsibleTrigger>
) {
    const { favoriteItems } = useItemsContext();
    const { isFavoritesListOpen } = useCollectionsListStore();

    const favoriteCollections = useFavoriteCollections();
    const collectionLabels = favoriteCollections.map(
        (collection) => collection.name
    );

    return (
        <CollectionsListGroupTrigger
            {...props}
            count={favoriteCollections.length + favoriteItems.length}
            description={formatFavoritesGroupSummary(
                collectionLabels,
                favoriteItems.length
            )}
            isOpen={isFavoritesListOpen}
            labels={collectionLabels}
            placeholder="No favorites yet"
            priorityCounts={countBy(
                favoriteCollections,
                (collection) => collection.priority
            )}
        />
    );
}

function CollectionsListFavoritesItemsContent({
    children,
}: CollectionsListChildrenProps<LibraryItemWithCollections>) {
    const { favoriteItems } = useItemsContext();

    return (
        <CollapsibleListVertical className="ml-1.25" maxVisible={10}>
            {favoriteItems.map(children)}
        </CollapsibleListVertical>
    );
}

interface CollectionsListFavoritesItemProps {
    item: LibraryItemWithCollections;
}

function CollectionsListFavoritesItem({
    item,
}: CollectionsListFavoritesItemProps) {
    const { onOpenFavoriteItem, onItemFavoriteToggle: onToggleItemFavorite } =
        useItemsContext();
    const { showError } = useCollectionStatus();

    const isNote = item.kind === ITEM_KIND_NOTE;
    const previewImageUrl = itemPreviewImageUrl(item);
    const noteExcerpt = getNoteExcerpt(item.noteContentText);
    const label = getFavoriteItemLabel(item);

    const handleClick = useStableCallback((event: React.SyntheticEvent) => {
        event.preventDefault();
        onOpenFavoriteItem(item);
    });

    const handleRemoveFavorite = useStableCallback(async () => {
        const result = await onToggleItemFavorite(item);
        if (result.status === ACTION_STATUS.UPDATED) {
            return;
        }
        log.error("Failed to remove item from favorites", {
            itemId: item.id,
            message: result.message,
        });
        showError(result.message);
    });

    return (
        <div className="group relative flex select-none items-center">
            <div className="pointer-events-none absolute top-1/2 left-1.25 z-10 size-6 -translate-y-1/2 overflow-hidden rounded-md">
                {isNote ? null : (
                    <>
                        <CollectionsListFavoritesItemImage
                            alt=""
                            className="size-full object-cover"
                            src={previewImageUrl ?? undefined}
                        />
                        <div
                            aria-hidden
                            className="squircle pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/5 ring-inset dark:ring-white/5"
                        />
                    </>
                )}
            </div>
            <PreviewCard>
                <PreviewCardTrigger
                    onClick={handleClick}
                    render={
                        <SidebarItem
                            className="w-full min-w-0 flex-1 justify-start pr-8 pl-8.5 text-left"
                            render={<Button variant="ghost" />}
                        />
                    }
                >
                    <span className="min-w-0 flex-1 truncate font-medium text-sm leading-none tracking-tight">
                        {label}
                    </span>
                </PreviewCardTrigger>
                <PreviewCardPopup
                    className="pointer-events-none p-0"
                    positionMethod="fixed"
                    side="right"
                >
                    {isNote ? (
                        <div className="overflow-hidden bg-linear-to-br from-note-surface-from via-background to-note-surface-to p-3">
                            <p className="line-clamp-6 whitespace-pre-wrap text-left text-foreground text-xs leading-snug">
                                {noteExcerpt || "Empty note"}
                            </p>
                        </div>
                    ) : (
                        <CollectionsListFavoritesItemImage
                            alt=""
                            className="aspect-auto h-auto w-full"
                            src={previewImageUrl ?? undefined}
                        />
                    )}
                    <div
                        aria-hidden
                        className="squircle pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/5 ring-inset dark:ring-white/5"
                    />
                </PreviewCardPopup>
            </PreviewCard>
            <Button
                aria-label="Remove from favorites"
                className="absolute top-1/2 right-1 z-10 size-6 -translate-y-1/2 text-muted-foreground opacity-100 pointer-fine:opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100"
                onClick={handleRemoveFavorite}
                size="icon-xs"
                title="Remove from favorites"
                variant="ghost"
            >
                <Trash2Icon
                    aria-hidden
                    className="size-3.5 shrink-0"
                    focusable="false"
                />
            </Button>
        </div>
    );
}

function CollectionsListFavoritesItemImage({
    alt,
    className,
    src,
    ...props
}: React.ComponentProps<"img">) {
    const { handleError, hasFailed } = useFailedImageSrc(src);

    if (!src || hasFailed) {
        return (
            <Placeholder
                {...props}
                className={cn("min-h-32 w-full", className)}
            />
        );
    }

    return (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/correctness/useImageSize: resource error lifecycle is not user interaction (upstream exempts img onError); dynamic aspect ratio parent handles layout
        <img
            {...props}
            alt={alt}
            className={cn("drag-none", className)}
            decoding="async"
            loading="lazy"
            onError={handleError}
            src={src}
        />
    );
}

function CollectionsListToolbar({
    className,
    ...props
}: React.ComponentProps<typeof Toolbar.Root>) {
    return (
        <Toolbar.Root
            {...props}
            className={cn(
                "relative flex w-full items-center justify-between",
                className
            )}
        />
    );
}

function CollectionsListToolbarGroup({
    className,
    ...props
}: React.ComponentProps<typeof Toolbar.Group>) {
    return (
        <Toolbar.Group
            {...props}
            className={cn(
                "pointer-events-none absolute right-1 flex items-center justify-end gap-1",
                className
            )}
        />
    );
}

function CollectionsListToolbarButton({
    className,
    ...props
}: React.ComponentProps<typeof Toolbar.Button>) {
    return (
        <Toolbar.Button
            {...props}
            className={cn(
                "pointer-events-auto opacity-80 hover:opacity-100",
                className
            )}
        />
    );
}

function CollectionsListEmpty({
    className,
    ...props
}: React.ComponentProps<"div">) {
    const { collections, collectionSummaries } = useCollectionsContext();
    const { openCreateDialog } = useCollectionsListActionsContext();
    const { setTextMatchQuery, setView, textMatchQuery, view } =
        useCollectionsListStore();

    const collectionCount = collections.length;
    const hasActiveFilters = view !== "show-all" || textMatchQuery.length > 0;

    const handleRequestCreate = useStableCallback(() => openCreateDialog());
    const handleClearFilters = useStableCallback(() => {
        setView("show-all");
        setTextMatchQuery("");
    });

    if (collectionSummaries.length > 0) {
        return null;
    }

    return (
        <div
            {...props}
            className={cn(
                "flex flex-col items-center justify-center gap-4 rounded-2xl border border-border/30 border-dashed px-4 py-7 text-center font-medium text-muted-foreground text-xs italic leading-tight",
                className
            )}
        >
            <div className="flex flex-col items-center gap-3">
                {collectionCount > 0 ? (
                    <>
                        <span>
                            <T>No collections match this view.</T>
                        </span>
                        {hasActiveFilters ? (
                            <Button
                                onClick={handleClearFilters}
                                size="sm"
                                variant="secondary"
                            >
                                <T>Clear filters</T>
                            </Button>
                        ) : null}
                    </>
                ) : (
                    <>
                        <Image
                            alt="empty cluster"
                            className="squircle mx-auto size-10 rounded-lg outline-1 outline-black/5 -outline-offset-1 dark:outline-white/5"
                            height={40}
                            src={EmptyCollectionStateImage}
                            width={40}
                        />
                        <span className="inline-flex items-center">
                            <T>
                                No collections found.&nbsp;{" "}
                                <button
                                    className="inline cursor-pointer underline hover:no-underline"
                                    onClick={handleRequestCreate}
                                    type="button"
                                >
                                    Create your first collection
                                </button>
                            </T>
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}

function CollectionsListStatus({
    className,
    ...props
}: React.ComponentProps<"div">) {
    const { dismissStatus, status } = useCollectionStatus();
    const tone = status?.tone;

    if (!status?.message) {
        return null;
    }

    return (
        <div
            {...props}
            className={cn(
                "flex items-center justify-between gap-2 px-2.5 pr-1",
                className
            )}
            data-sidebar-collapsible=""
        >
            <p
                aria-atomic="true"
                aria-live={tone === "error" ? "assertive" : "polite"}
                className={cn(
                    "truncate text-xs italic leading-tight",
                    tone === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                )}
                role={tone === "error" ? "alert" : "status"}
            >
                {status.message}
            </p>
            <Button onClick={dismissStatus} size="xs" variant="ghost">
                Dismiss
            </Button>
        </div>
    );
}

function CollectionsListClearButton({
    onClick: onClickProp,
    ...props
}: React.ComponentProps<typeof Button>) {
    const { onClearCollectionFilters, selectedCollectionIds } =
        useCollectionsContext();
    const hasAnySelected = selectedCollectionIds.length > 0;

    const onClick = useStableCallback(onClickProp);
    const handleClick = useStableCallback(
        (event: BaseUIEvent<React.MouseEvent<HTMLButtonElement>>) => {
            onClick?.(event);
            onClearCollectionFilters();
        }
    );

    if (!hasAnySelected) {
        return null;
    }

    return (
        <Button
            {...props}
            aria-label="Clear selected collections"
            onClick={handleClick}
            size="icon-xs"
            title="Clear selected collections"
            variant="ghost"
        >
            <X
                aria-hidden
                className="inline-block size-3.5 shrink-0"
                focusable="false"
            />
        </Button>
    );
}

function CollectionsListSortingCombobox({
    render,
    ...props
}: React.ComponentProps<typeof ComboboxTrigger>) {
    const {
        setIsCollectionsListOpen,
        setSortField,
        setTextMatchQuery,
        setView,
        sortField,
        textMatchQuery,
        view,
    } = useCollectionsListStore();

    const [inputValue, setInputValue] = React.useState("");
    const [isSortOpen, setIsSortOpen] = React.useState(false);

    const currentSortOption =
        sortField === "text-match"
            ? {
                  icon: ListFilter,
                  label: `\u201c${textMatchQuery}\u201d`,
              }
            : (SORT_OPTION_BY_VALUE.get(sortField) ?? null);

    const value: ComboboxValue = {
        icon: currentSortOption?.icon ?? ListFilter,
        label: currentSortOption?.label ?? "Priority",
        sortField,
        sortQuery: textMatchQuery,
        view,
    };

    const handleValueChange = useStableCallback(
        (nextValue: ComboboxValue | null) => {
            if (!nextValue) {
                return;
            }

            if (
                nextValue.sortField !== sortField ||
                nextValue.sortQuery !== textMatchQuery
            ) {
                setSortField(nextValue.sortField);
                if (nextValue.sortField === "text-match") {
                    setTextMatchQuery(nextValue.sortQuery);
                } else {
                    setTextMatchQuery("");
                }
                setInputValue("");
            }

            if (nextValue.view !== view) {
                setView(nextValue.view);
            }

            setIsSortOpen(false);
        }
    );

    const handleOpenChange = useStableCallback((nextOpen: boolean) => {
        setIsSortOpen(nextOpen);
        if (nextOpen) {
            setIsCollectionsListOpen(true);
        }
    });

    const handleSortHotkey = useStableCallback((event: KeyboardEvent) => {
        event.preventDefault();
        setIsCollectionsListOpen(true);
        setIsSortOpen(true);
    });

    useHotkeys("mod+f", handleSortHotkey, {
        description: "Sort and organize collections",
        enabled: !isSortOpen,
        preventDefault: true,
    });

    return (
        <Combobox
            autoHighlight
            filter={null}
            inputValue={inputValue}
            isItemEqualToValue={isComboboxValueEqual}
            items={getComboboxCollectionsSortingGroups(inputValue, value)}
            itemToStringValue={getComboboxOptionValue}
            onInputValueChange={setInputValue}
            onOpenChange={handleOpenChange}
            onValueChange={handleValueChange}
            open={isSortOpen}
            value={value}
        >
            <ComboboxTrigger
                {...props}
                render={
                    render ?? (
                        <Button
                            aria-label="Sort and organize collections"
                            size="icon-xs"
                            title={`Sort and organize collections (${getSystemControlKey()}F)`}
                            variant="ghost"
                        />
                    )
                }
            >
                <ListFilter
                    aria-hidden
                    className="inline-block size-3 shrink-0"
                    focusable="false"
                />
            </ComboboxTrigger>
            <ComboboxPopup align="start" positionMethod="fixed" side="right">
                <ComboboxInput
                    endAddon={
                        <Kbd>
                            <CmdKbd />F
                        </Kbd>
                    }
                    placeholder="Filter…"
                />
                <ComboboxEmpty>No matching options</ComboboxEmpty>
                <ComboboxList>
                    {(group: ComboboxGroupData) => (
                        <React.Fragment key={group.group}>
                            <ComboboxGroup items={group.items}>
                                <ComboboxGroupLabel>
                                    {GROUP_LABELS[group.group]}
                                </ComboboxGroupLabel>
                                <ComboboxCollection>
                                    {(option: ComboboxValue) => (
                                        <ComboboxItem
                                            key={getComboboxOptionValue(option)}
                                            shouldShowIndicatorLast
                                            value={option}
                                        >
                                            <CollectionsListSortingComboboxItem
                                                icon={option.icon}
                                                label={option.label}
                                            />
                                        </ComboboxItem>
                                    )}
                                </ComboboxCollection>
                            </ComboboxGroup>
                            {group.group === "sort" && <ComboboxSeparator />}
                        </React.Fragment>
                    )}
                </ComboboxList>
            </ComboboxPopup>
        </Combobox>
    );
}

interface CollectionsListSortingComboboxItemProps {
    icon: React.ElementType;
    label: string;
}

function CollectionsListSortingComboboxItem({
    icon: Icon,
    label,
}: CollectionsListSortingComboboxItemProps) {
    return (
        <span className="flex min-w-0 items-center gap-2 text-foreground text-sm">
            <Icon
                aria-hidden
                className="size-4 text-muted-foreground"
                focusable="false"
            />
            <span className="truncate">{label}</span>
        </span>
    );
}

function CollectionsListCreateButton({
    onClick: onClickProp,
    ...props
}: React.ComponentProps<typeof Button>) {
    const { openCreateDialog } = useCollectionsListActionsContext();

    const onClick = useStableCallback(onClickProp);
    const handleClick = useStableCallback(
        (event: BaseUIEvent<React.MouseEvent<HTMLButtonElement>>) => {
            onClick?.(event);
            openCreateDialog();
        }
    );

    return (
        <Button
            {...props}
            aria-label="Create collection"
            onClick={handleClick}
            size="icon-xs"
            title={`Create a new collection (${getSystemControlKey()}N)`}
            variant="ghost"
        >
            <PlusIcon
                aria-hidden
                className="inline-block size-4 shrink-0"
                focusable="false"
            />
        </Button>
    );
}

function CollectionsListSmartCollectionsPopover() {
    const { isEnabled, isLoading, setEnabled } = useSmartCollectionsToggle();

    const handleToggle = useStableCallback(async () => {
        if (typeof isEnabled === "undefined") {
            return;
        }
        await setEnabled(!isEnabled);
    });

    if (isLoading || typeof isEnabled === "undefined") {
        return (
            <div className="flex items-center gap-0.5 text-nowrap font-medium text-[11px] opacity-40">
                Smart Collections
                <span>is</span>
                <Skeleton className="h-4 w-20" />
            </div>
        );
    }

    return (
        <Popover>
            <span
                aria-atomic="true"
                aria-live="polite"
                className="sr-only"
                role="status"
            >
                Smart Collections is {isEnabled ? "active" : "off"}
            </span>
            <PopoverTrigger
                className={cn(
                    "group not-sr-only flex items-center text-nowrap font-medium text-[11px]",
                    isEnabled
                        ? "opacity-70 data-popup-open:opacity-100"
                        : "opacity-50"
                )}
                openOnHover
            >
                <GradientWaveText
                    ariaLabel="Smart Collections"
                    className="w-fit underline decoration-muted-foreground/20 decoration-dotted underline-offset-2"
                >
                    Smart Collections
                </GradientWaveText>
                &nbsp;is {isEnabled ? "active" : "off"}
            </PopoverTrigger>
            <PopoverPopup align="start" positionMethod="fixed">
                <Image
                    alt=""
                    aria-hidden
                    className="-mx-(--viewport-inline-padding) -mt-4 aspect-32/9 h-auto max-h-24 w-(--positioner-width) min-w-0 max-w-(--positioner-width) rounded-t-lg"
                    priority
                    sizes="auto,288px"
                    src={SmartCollectionsBackgroundImg}
                />
                <div className="mt-4 flex max-w-64 flex-col gap-2">
                    <PopoverTitle>Let Cache do the organizing</PopoverTitle>
                    <PopoverDescription className="text-foreground text-xs leading-snug">
                        Smart Collections will use AI to automatically group
                        your saves into contextual collections as you add new
                        entries.
                    </PopoverDescription>
                    <Button
                        className="w-fit px-0 text-muted-foreground text-xs"
                        onClick={handleToggle}
                        size="xs"
                        variant="link"
                    >
                        {isEnabled
                            ? "Turn off Smart Collections"
                            : "Turn on Smart Collections"}
                    </Button>
                </div>
            </PopoverPopup>
        </Popover>
    );
}

function CollectionsListSuggestions({
    children,
}: CollectionsListChildrenProps<CollectionTemplateOption>) {
    const { collectionSummaries } = useCollectionsContext();
    const { isSuggestionsOpen, setIsSuggestionsOpen } =
        useCollectionsListStore();
    const { items, isLoading } = useCollectionsSuggestions();

    if (!(collectionSummaries.length && items.length) || isLoading) {
        return null;
    }

    return (
        <Collapsible
            className="ml-1.25 flex flex-col gap-1 pt-0.5"
            onOpenChange={setIsSuggestionsOpen}
            open={isSuggestionsOpen}
        >
            <CollapsibleTrigger
                className="flex items-center p-1.5 text-muted-foreground text-xs hover:text-foreground"
                title={
                    isSuggestionsOpen
                        ? "Hide suggested collections"
                        : "Show suggested collections"
                }
            >
                {isSuggestionsOpen ? (
                    <T>Hide suggestions</T>
                ) : (
                    <T>Show suggestions</T>
                )}
            </CollapsibleTrigger>
            <CollapsiblePanel>
                <div className="flex flex-col gap-1">{items.map(children)}</div>
            </CollapsiblePanel>
        </Collapsible>
    );
}

interface CollectionsListSuggestionItemProps {
    template: CollectionTemplateOption;
}

function CollectionsListSuggestionItem({
    template,
}: CollectionsListSuggestionItemProps) {
    const { showError, showSuccess } = useCollectionStatus();
    const { syncCreated } = useCollectionsListActionsContext();
    const { mutate: mutateSuggestions } = useCollectionsSuggestions();
    const [isPending, startTransition] = React.useTransition();

    const handleClick = useStableCallback((event: React.SyntheticEvent) => {
        if (isPending) {
            event.preventDefault();
            return;
        }
        startTransition(async () => {
            const result = await createCollectionAndSync({
                description: template.description,
                name: template.name,
                syncCreated,
            });
            if (result.status !== ACTION_STATUS.CREATED) {
                showError(result.message);
                return;
            }
            await refreshCollectionSuggestions(
                mutateSuggestions,
                "Failed to refresh collection suggestions after creating from template"
            );
            showSuccess(`${template.name} created from template.`);
        });
    });

    return (
        <div className="group relative flex select-none items-center">
            <PreviewCard>
                <PreviewCardTrigger
                    render={
                        <SidebarItem
                            className="w-full min-w-0 flex-1 justify-start rounded-lg pr-8 pl-9.5 text-left hover:bg-transparent"
                            render={
                                <button
                                    disabled={isPending}
                                    onClick={handleClick}
                                    type="button"
                                />
                            }
                        />
                    }
                >
                    <span className="absolute top-1/2 left-1.25 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-md border-none bg-muted text-muted-foreground">
                        <PlusIcon
                            aria-hidden
                            className="size-4"
                            focusable="false"
                        />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium text-sm leading-none">
                        {template.name}
                    </span>
                    {isPending ? (
                        <Spinner className="absolute right-3 size-3.5" />
                    ) : (
                        <span className="absolute right-3 text-muted-foreground text-xs opacity-0 group-hover:opacity-100">
                            <T>Add</T>
                        </span>
                    )}
                </PreviewCardTrigger>
                <PreviewCardPopup
                    align="start"
                    className="p-3"
                    positionMethod="fixed"
                    side="right"
                >
                    <div className="flex max-w-64 flex-col gap-1">
                        <p className="font-medium text-xs leading-tight">
                            {template.name}
                        </p>
                        <p className="text-muted-foreground text-xs leading-snug">
                            {template.description}
                        </p>
                    </div>
                </PreviewCardPopup>
            </PreviewCard>
        </div>
    );
}

interface CollectionsListBreakdownProps {
    entries: PriorityBreakdownEntry[];
}

function CollectionsListBreakdown({ entries }: CollectionsListBreakdownProps) {
    return (
        <DataList>
            <DataListSection>
                <DataListGroup className="mt-0">
                    {entries.map(({ count, icon: Icon, label, value }) => (
                        <DataListItem
                            icon={
                                <Icon
                                    aria-hidden
                                    className="size-4 text-muted-foreground sm:size-3.5"
                                    focusable="false"
                                />
                            }
                            key={value}
                            label={label}
                            value={count}
                        />
                    ))}
                </DataListGroup>
            </DataListSection>
        </DataList>
    );
}

interface CollectionsListItemProps extends React.ComponentProps<"div"> {
    collection: LibraryCollectionSummary;
    source: CollectionListSource;
}

function CollectionsListItem({
    className,
    collection,
    onPointerEnter: onPointerEnterProp,
    onPointerLeave: onPointerLeaveProp,
    source,
    style: styleProp,
    ...props
}: CollectionsListItemProps) {
    const { selectedCollectionIdSet } = useCollectionsContext();
    const { hoveredCollectionIdRef, setHoveredCollectionSource } =
        useCollectionsListHoverContext();
    const { claim: claimHoverHotkey, release: releaseHoverHotkeyClaim } =
        useHoverHotkeyRegionClaim(HOVER_HOTKEY_REGIONS.collections);

    const isSelected = selectedCollectionIdSet.has(collection.id);
    const style = getCollectionItemStyle(collection.name, isSelected);

    const handlePointerEnterProp = useStableCallback(onPointerEnterProp);
    const handlePointerLeaveProp = useStableCallback(onPointerLeaveProp);

    const releaseHoverClaim = useStableCallback(() => {
        releaseHoverHotkeyClaim();
        if (hoveredCollectionIdRef.current === collection.id) {
            hoveredCollectionIdRef.current = null;
            setHoveredCollectionSource(null);
        }
    });

    const onPointerEnter = useStableCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            hoveredCollectionIdRef.current = collection.id;
            setHoveredCollectionSource(source);
            claimHoverHotkey();
            handlePointerEnterProp?.(event);
        }
    );

    const onPointerLeave = useStableCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            releaseHoverClaim();
            handlePointerLeaveProp?.(event);
        }
    );

    React.useEffect(() => releaseHoverClaim, [releaseHoverClaim]);

    const contextValue = { collection, isSelected, source };

    return (
        <CollectionsListItemContext value={contextValue}>
            <div
                {...props}
                className={cn(
                    "group relative flex select-none items-center",
                    className
                )}
                onPointerEnter={onPointerEnter}
                onPointerLeave={onPointerLeave}
                style={{ ...style, ...styleProp }}
            />
        </CollectionsListItemContext>
    );
}

function CollectionsListItemTrigger({
    onClick: onClickProp,
    ...props
}: React.ComponentProps<typeof PreviewCardTrigger>) {
    const { onSelectCollection } = useCollectionsContext();
    const { collectionPreviewThumbnailUrlsById } = useItemsContext();
    const { collection, isSelected } = useCollectionsListItemContext();
    const [isHoverIntent, setIsHoverIntent] = React.useState(false);
    const [isPointerOver, setIsPointerOver] = React.useState(false);

    const thumbnails =
        collectionPreviewThumbnailUrlsById.get(collection.id) ?? [];
    const shouldLoad = isPointerOver || isHoverIntent;

    const { activeSlide, reportSlideError } = useCollectionPreviewPlayback({
        isCycling: isHoverIntent,
        shouldLoad,
        thumbnails,
    });

    const isOpen = isHoverIntent && activeSlide !== null;

    const onClick = useStableCallback(onClickProp);
    const handleClick = useStableCallback(
        (
            event: BaseUIEvent<React.MouseEvent<HTMLAnchorElement, MouseEvent>>
        ) => {
            onClick?.(event);
            onSelectCollection(collection.id);
            setIsHoverIntent(false);
            setIsPointerOver(false);
        }
    );

    const handleOpenChange = useStableCallback((nextOpen: boolean) => {
        setIsHoverIntent(nextOpen);
    });

    const handlePointerEnter = useStableCallback(() => {
        setIsPointerOver(true);
    });

    const handlePointerLeave = useStableCallback(() => {
        setIsPointerOver(false);
        setIsHoverIntent(false);
    });

    return (
        <PreviewCard onOpenChange={handleOpenChange} open={isOpen}>
            <PreviewCardTrigger
                {...props}
                data-active={isSelected || undefined}
                onClick={handleClick}
                onPointerEnter={handlePointerEnter}
                onPointerLeave={handlePointerLeave}
                render={
                    <SidebarItem
                        className="w-full min-w-0 flex-1 justify-start pointer-fine:pr-8 pr-15 pl-8.5 text-left before:bg-(--collection-background) hover:bg-transparent focus-visible:ring-(--accent-color)"
                        render={<Button variant="ghost" />}
                    />
                }
            />
            <PreviewCardPopup
                className="p-0"
                positionMethod="fixed"
                side="right"
            >
                {activeSlide ? (
                    <CollectionsListItemPreviewImage
                        activeSlide={activeSlide}
                        name={collection.name}
                        onSlideError={reportSlideError}
                    />
                ) : null}
            </PreviewCardPopup>
        </PreviewCard>
    );
}

interface CollectionsListItemPreviewImageProps {
    activeSlide: ReadyPreviewSlide;
    name: string;
    onSlideError: (src: string) => void;
}

function CollectionsListItemPreviewImage({
    activeSlide,
    name,
    onSlideError,
}: CollectionsListItemPreviewImageProps) {
    const handleError = useStableCallback(() => {
        onSlideError(activeSlide.src);
    });

    return (
        <div
            className="relative w-full"
            style={{ aspectRatio: String(activeSlide.aspectRatio) }}
        >
            <AnimatePresence initial={false}>
                {/* biome-ignore lint/correctness/useImageSize: parent aspect-ratio drives layout */}
                <motion.img
                    alt={`${name} preview`}
                    animate={{ opacity: 1 }}
                    className="drag-none absolute inset-0 size-full object-cover"
                    decoding="async"
                    draggable={false}
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    onError={handleError}
                    src={activeSlide.src}
                    transition={{
                        duration: PREVIEW_CROSSFADE_MS / 1000,
                        ease: "easeOut",
                    }}
                />
            </AnimatePresence>
            <div
                aria-hidden
                className="squircle pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/5 ring-inset dark:ring-white/5"
            />
        </div>
    );
}

function CollectionsListItemValue() {
    const { collection, isSelected } = useCollectionsListItemContext();
    const { textMatchQuery } = useCollectionsListStore();

    return (
        <div className="flex min-w-0 flex-1 items-center gap-3 leading-none">
            <span
                className="max-w-full shrink-0 truncate font-medium text-sm tracking-tight"
                title={collection.description ?? undefined}
            >
                <TextMatch query={textMatchQuery}>{collection.name}</TextMatch>
            </span>
            {isSelected || collection.sources.length === 0 ? null : (
                <span className="invisible max-w-full flex-1 truncate py-px text-[11px] text-muted-foreground opacity-80 group-hover:visible group-focus-visible:visible">
                    {collection.sources.map(getSourceLabel).join(", ")}
                </span>
            )}
        </div>
    );
}

function CollectionsListItemPriorityCombobox() {
    const { pendingPriorityComboboxOpen } = useCollectionsListStateContext();
    const { onUpdatePriority, setPendingPriorityComboboxOpen } =
        useCollectionsListActionsContext();
    const { collection, source } = useCollectionsListItemContext();
    const { isCollectionActionPending } = useCollectionsPendingActionsContext();

    const SelectedPriorityIcon = getPriorityOption(collection.priority).icon;
    const isOpen =
        pendingPriorityComboboxOpen?.collectionId === collection.id &&
        pendingPriorityComboboxOpen.source === source;
    const isPriorityPending = isCollectionActionPending(
        "priority",
        collection.id
    );

    const handleOpenChange = useStableCallback((nextOpen: boolean) => {
        if (isPriorityPending) {
            return;
        }
        if (nextOpen) {
            setPendingPriorityComboboxOpen({
                collectionId: collection.id,
                source,
            });
        } else if (isOpen) {
            setPendingPriorityComboboxOpen(null);
        }
    });

    const handleValueChange = useStableCallback((nextPriority) => {
        if (nextPriority && nextPriority !== collection.priority) {
            onUpdatePriority(collection.id, nextPriority);
        }
        setPendingPriorityComboboxOpen(null);
    });

    return (
        <Combobox
            autoHighlight
            disabled={isPriorityPending}
            items={PRIORITIES}
            onOpenChange={handleOpenChange}
            onValueChange={handleValueChange}
            open={isOpen}
            value={collection.priority}
        >
            <ComboboxTrigger
                render={
                    <Button
                        aria-label={`Change priority for ${collection.name}`}
                        className="absolute top-1/2 left-1.25 z-10 size-6 -translate-y-1/2 border-none bg-(--collection-background) text-(--accent-color)"
                        disabled={isPriorityPending}
                        size="icon-xs"
                        title="Organize collections by relevance level"
                        variant="ghost"
                    />
                }
            >
                <SelectedPriorityIcon
                    aria-hidden
                    className="size-4"
                    focusable="false"
                />
            </ComboboxTrigger>
            <ComboboxPopup className="max-w-64" positionMethod="fixed">
                <ComboboxInput
                    endAddon={<Kbd>P</Kbd>}
                    placeholder={
                        collection.priority === "none"
                            ? "Set priority to…"
                            : "Change priority to…"
                    }
                />
                <ComboboxEmpty>No matching priorities</ComboboxEmpty>
                <ComboboxList>
                    <ComboboxCollection>
                        {(priorityOption: PriorityOption) => (
                            <ComboboxItem
                                key={priorityOption.value}
                                shouldShowIndicatorLast
                                value={priorityOption.value}
                            >
                                <CollectionsListSortingComboboxItem
                                    icon={priorityOption.icon}
                                    label={priorityOption.label}
                                />
                            </ComboboxItem>
                        )}
                    </ComboboxCollection>
                </ComboboxList>
            </ComboboxPopup>
        </Combobox>
    );
}

function CollectionsListItemControls({
    className,
    ...props
}: React.ComponentProps<"span">) {
    const { favoriteCollectionIdSet, toggleFavorite } =
        useToggleCollectionFavorite();
    const { onRename, onDelete, onDuplicate, onUpdatePriority } =
        useCollectionsListActionsContext();
    const { collection } = useCollectionsListItemContext();
    const { isCollectionActionPending } = useCollectionsPendingActionsContext();

    const isFavorite = favoriteCollectionIdSet.has(collection.id);
    const isArchived = collection.priority === "archive";
    const isArchivePending = isCollectionActionPending(
        "priority",
        collection.id
    );
    const updatedAt = dayjs(collection.updatedAt);

    const handleRename = useStableCallback(() => onRename(collection));
    const handleDelete = useStableCallback(() => onDelete(collection));
    const handleFavoriteToggle = useStableCallback(() => {
        toggleFavorite(collection);
    });
    const handleMakeCopy = useStableCallback(() => onDuplicate(collection));
    const handleArchiveToggle = useStableCallback(() =>
        onUpdatePriority(
            collection.id,
            getToggledArchivePriority(collection.priority)
        )
    );

    return (
        <div className="absolute top-1/2 pointer-fine:right-0 right-1 flex pointer-fine:size-9 h-9 -translate-y-1/2 items-center justify-end pointer-fine:justify-center gap-1 pointer-fine:gap-0">
            <span
                {...props}
                className={cn(
                    "pointer-events-none shrink-0 text-nowrap text-(--text-muted-color) text-xs tabular-nums pointer-fine:focus-visible:opacity-0 pointer-fine:group-focus-within:opacity-0 pointer-fine:group-hover:opacity-0",
                    className
                )}
            />
            <Menu>
                <MenuTrigger
                    render={
                        <Button
                            aria-label={`Collection actions for ${collection.name}`}
                            className="pointer-fine:absolute relative size-6 shrink-0 text-(--accent-color) pointer-fine:opacity-0 focus-visible:opacity-100 group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100 group-focus:opacity-100 data-popup-open:bg-muted data-popup-open:opacity-100"
                            size="icon-xs"
                            title={`Collection actions for ${collection.name}`}
                            variant="ghost"
                        />
                    }
                >
                    <EllipsisIcon
                        aria-hidden
                        className="inline-block size-4"
                        focusable="false"
                    />
                </MenuTrigger>
                <MenuPopup align="start" side="right">
                    <MenuGroup>
                        <MenuGroupLabel className="flex items-center gap-1.5">
                            Collection
                            <Badge size="sm" variant="secondary">
                                {collection.shareId ? (
                                    <>
                                        <Globe
                                            aria-hidden
                                            className="size-3"
                                            focusable="false"
                                        />
                                        Public
                                    </>
                                ) : (
                                    <>
                                        <LockKeyhole
                                            aria-hidden
                                            className="size-3"
                                            focusable="false"
                                        />
                                        Private
                                    </>
                                )}
                            </Badge>
                        </MenuGroupLabel>
                        <MenuItem onClick={handleFavoriteToggle}>
                            <Star
                                aria-hidden
                                className={cn(
                                    "size-4 text-muted-foreground",
                                    isFavorite && "fill-current"
                                )}
                                focusable="false"
                            />
                            {isFavorite ? "Unfavorite" : "Favorite"}
                            <MenuShortcut>
                                <AltKbd />F
                            </MenuShortcut>
                        </MenuItem>
                        <MenuItem onClick={handleRename}>
                            <PenLine
                                aria-hidden
                                className="size-4 text-muted-foreground"
                                focusable="false"
                            />
                            Rename
                            <MenuShortcut>
                                <AltKbd />E
                            </MenuShortcut>
                        </MenuItem>
                        <MenuItem onClick={handleMakeCopy}>
                            <CopyPlus
                                aria-hidden
                                className="size-4 text-muted-foreground"
                                focusable="false"
                            />
                            Make a copy
                        </MenuItem>
                        <MenuItem
                            disabled={isArchivePending}
                            onClick={handleArchiveToggle}
                        >
                            {isArchived ? (
                                <ArchiveX
                                    aria-hidden
                                    className="size-4 text-muted-foreground"
                                    focusable="false"
                                />
                            ) : (
                                <ArchiveIcon
                                    aria-hidden
                                    className="size-4 text-muted-foreground"
                                    focusable="false"
                                />
                            )}
                            {isArchived ? "Unarchive" : "Archive"}
                            <MenuShortcut>
                                <ShiftKbd />
                                <CmdKbd />A
                            </MenuShortcut>
                        </MenuItem>
                    </MenuGroup>
                    <MenuSeparator />
                    <MenuGroup>
                        <CollectionsListItemShareSubmenu />
                        <CollectionsListItemExportSubmenu />
                    </MenuGroup>
                    <MenuSeparator />
                    <MenuGroup>
                        <MenuItem onClick={handleDelete}>
                            Delete
                            <MenuShortcut>⌫</MenuShortcut>
                        </MenuItem>
                    </MenuGroup>
                    <MenuItem disabled>
                        <div className="-mt-0.5 space-y-1 text-[10px] text-muted-foreground leading-none *:text-nowrap">
                            <div>Last updated {updatedAt.fromNow()}</div>
                            <div>
                                {updatedAt.format("MMM DD, YYYY, h:mm A")}
                            </div>
                        </div>
                    </MenuItem>
                </MenuPopup>
            </Menu>
        </div>
    );
}

function CollectionsListItemShareSubmenu() {
    const { collection } = useCollectionsListItemContext();
    const { isCollectionActionPending } = useCollectionsPendingActionsContext();
    const { syncCollectionShare } = useCollectionsContext();
    const { showError, showSuccess } = useCollectionStatus();
    const copyWithFeedback = useCopyWithFeedback();
    const { copyToClipboard } = useCopyToClipboard();
    const { isPending, runCollectionAction } = useCollectionActionRunner();

    const isShared = !!collection.shareId;
    const isShareActionPending =
        isPending || isCollectionActionPending("share", collection.id);

    const handleCopyShareLink = useStableCallback(async () => {
        if (!collection.shareId) {
            showError(COPY_SHARE_LINK_MISSING_MESSAGE);
            return;
        }

        await copyWithFeedback(
            buildPublicCollectionShareUrl(collection.shareId),
            `Public link for ${collection.name} copied to the clipboard.`,
            COPY_SHARE_LINK_ERROR_MESSAGE
        );
    });

    const handleDisableShare = useStableCallback(() => {
        runCollectionAction({
            action: "share",
            collection,
            run: async () => {
                const result = await disableCollectionSharingSafely({
                    collectionId: collection.id,
                });

                if (result.status === ACTION_STATUS.DISABLED) {
                    syncCollectionShare(result.collection);
                    showSuccess(
                        `${collection.name} is no longer publicly shared.`
                    );
                } else {
                    showError(result.message);
                }
            },
        });
    });

    const handleEnableShare = useStableCallback(() => {
        runCollectionAction({
            accessAction: "share",
            action: "share",
            collection,
            run: async () => {
                const result = await shareCollectionPubliclySafely({
                    collectionId: collection.id,
                });

                if (result.status === ACTION_STATUS.SHARED) {
                    syncCollectionShare(result.collection);
                    const linkCopied = await copyToClipboard(result.shareUrl);
                    showSuccess(
                        linkCopied
                            ? `${collection.name} is now publicly shared. Link copied to the clipboard.`
                            : `${collection.name} is now publicly shared.`
                    );
                } else {
                    showError(result.message);
                }
            },
        });
    });

    return (
        <MenuSub>
            <MenuSubTrigger>
                <ShareArrowSolidIcon
                    aria-hidden
                    className="inline-block size-4 text-muted-foreground"
                    focusable="false"
                />
                Share
            </MenuSubTrigger>
            <MenuSubPopup>
                {isShared ? (
                    <MenuItem
                        disabled={isShareActionPending}
                        onClick={handleCopyShareLink}
                    >
                        <LinkIcon
                            aria-hidden
                            className="size-4 text-muted-foreground"
                            focusable="false"
                        />
                        Copy public link
                    </MenuItem>
                ) : (
                    <MenuItem
                        closeOnClick={false}
                        disabled={isShareActionPending}
                        onClick={handleEnableShare}
                    >
                        <UserRoundPlus
                            aria-hidden
                            className="size-4 text-muted-foreground"
                            focusable="false"
                        />
                        Create public link
                    </MenuItem>
                )}
                <MenuItem closeOnClick={false} disabled>
                    <LockKeyhole
                        aria-hidden
                        className="size-4 text-muted-foreground"
                        focusable="false"
                    />
                    {isShared ? "Anyone with the link" : "Just me"}
                </MenuItem>
                {isShared ? (
                    <MenuItem
                        closeOnClick={false}
                        disabled={isShareActionPending}
                        onClick={handleDisableShare}
                        variant="destructive"
                    >
                        <Trash2Icon
                            aria-hidden
                            className="size-4"
                            focusable="false"
                        />
                        Stop sharing
                    </MenuItem>
                ) : null}
            </MenuSubPopup>
        </MenuSub>
    );
}

function CollectionsListItemExportSubmenu() {
    const { onCopyLinks, onCopyTitle, onExportCsv, onOpenLinks } =
        useCollectionsListActionsContext();
    const { collection } = useCollectionsListItemContext();
    const { isCollectionActionPending } = useCollectionsPendingActionsContext();
    const { showError, showSuccess } = useCollectionStatus();
    const { isPending, runCollectionAction } = useCollectionActionRunner();

    const hasItems = collection.itemCount > 0;
    const isNotionPending =
        isPending || isCollectionActionPending("notion", collection.id);

    const handleCopyLinks = useStableCallback(() => onCopyLinks(collection));
    const handleCopyTitle = useStableCallback(() => onCopyTitle(collection));
    const handleExportCsv = useStableCallback(() => onExportCsv(collection));
    const handleOpenLinks = useStableCallback(() => onOpenLinks(collection));
    const handleSendToNotion = useStableCallback(() => {
        runCollectionAction({
            accessAction: "send to Notion",
            action: "notion",
            collection,
            run: async () => {
                const result = await sendCollectionToNotionSafely({
                    collectionId: collection.id,
                });
                if (result.status === ACTION_STATUS.SUCCESS) {
                    showSuccess(`${collection.name} sent to Notion.`);
                    openExternalUrl(result.pageUrl);
                } else {
                    showError(result.message);
                }
            },
        });
    });

    return (
        <MenuSub>
            <MenuSubTrigger>
                <Download
                    aria-hidden
                    className="inline-block size-4 text-muted-foreground"
                    focusable="false"
                />
                Export
            </MenuSubTrigger>
            <MenuSubPopup>
                <MenuItem onClick={handleCopyTitle}>
                    <CopyIcon
                        aria-hidden
                        className="size-4 text-muted-foreground"
                        focusable="false"
                    />
                    Copy title
                </MenuItem>
                <MenuItem disabled={!hasItems} onClick={handleCopyLinks}>
                    <CopyCheck
                        aria-hidden
                        className="size-4 text-muted-foreground"
                        focusable="false"
                    />
                    Copy all links
                </MenuItem>
                <MenuItem disabled={!hasItems} onClick={handleOpenLinks}>
                    <ExternalLinkIcon
                        aria-hidden
                        className="size-4 text-muted-foreground"
                        focusable="false"
                    />
                    Open all links
                </MenuItem>
                <MenuSeparator />
                <MenuItem disabled={!hasItems} onClick={handleExportCsv}>
                    <FileSpreadsheetIcon
                        aria-hidden
                        className="size-4 text-muted-foreground"
                        focusable="false"
                    />
                    Export to CSV
                </MenuItem>
                <MenuItem
                    disabled={!hasItems || isNotionPending}
                    onClick={handleSendToNotion}
                >
                    <NotionIcon
                        aria-hidden
                        className="size-4 text-muted-foreground"
                        focusable="false"
                    />
                    {isNotionPending ? "Sending to Notion…" : "Send to Notion"}
                </MenuItem>
            </MenuSubPopup>
        </MenuSub>
    );
}

function CollectionsCreateDialog() {
    const { createItemId, isCreateOpen } = useCollectionsListStore();
    const { showSuccess } = useCollectionStatus();
    const { closeCreateDialog, createSubmissionPendingRef, syncCreated } =
        useCollectionsListActionsContext();
    const { isEnabled, setEnabled } = useSmartCollectionsToggle();
    const { mutate: mutateSuggestions } = useCollectionsSuggestions();

    const {
        handleOpenChange: handleSubmissionOpenChange,
        isSubmitting,
        runSubmission,
    } = useSubmissionDialog({
        onClose: closeCreateDialog,
        submissionPendingRef: createSubmissionPendingRef,
    });

    const nameInputId = React.useId();
    const errorId = React.useId();
    const descriptionInputId = React.useId();
    const descriptionErrorId = React.useId();

    const [formState, setFormState] = React.useState(INITIAL_CREATE_FORM_STATE);

    const {
        descriptionDraft,
        descriptionErrorMessage,
        errorMessage,
        nameDraft,
    } = formState;
    const isDescriptionPending = formState.pendingDescription !== null;
    const isNameValid = normalizeWhitespace(nameDraft).length > 0;

    const handleNameDraftChange = useStableCallback((draft: string) => {
        // Editing the name invalidates any in-flight description request.
        setFormState((current) => ({
            ...current,
            descriptionErrorMessage: null,
            errorMessage: null,
            nameDraft: draft,
            pendingDescription: null,
        }));
    });

    const handleOpenChange = useStableCallback((nextOpen: boolean) => {
        if (nextOpen) {
            return;
        }
        if (createSubmissionPendingRef.current) {
            return;
        }
        setFormState((current) =>
            current.pendingDescription === null
                ? current
                : { ...current, pendingDescription: null }
        );
        handleSubmissionOpenChange(nextOpen);
    });

    const runCreate = useStableCallback(
        (input: {
            description: string | undefined;
            name: string;
            onStart?: () => void;
            shouldRefreshSuggestions: boolean;
            successMessage: (collectionName: string) => string;
        }) => {
            if (formState.pendingDescription !== null) {
                return;
            }
            input.onStart?.();

            runSubmission(async () => {
                const result = await createCollectionAndSync({
                    assignToItemId: createItemId ?? undefined,
                    description: input.description,
                    name: input.name,
                    syncCreated,
                });
                if (result.status !== ACTION_STATUS.CREATED) {
                    setFormState((current) => ({
                        ...current,
                        errorMessage: result.message,
                    }));
                    return;
                }
                if (input.shouldRefreshSuggestions) {
                    await refreshCollectionSuggestions(
                        mutateSuggestions,
                        "Failed to refresh collection suggestions after creation"
                    );
                }
                showSuccess(input.successMessage(result.collection.name));
                closeCreateDialog();
            });
        }
    );

    const handleSubmit = useStableCallback(() => {
        const name = normalizeWhitespace(nameDraft);
        if (name.length === 0) {
            setFormState((current) => ({
                ...current,
                errorMessage: NAME_REQUIRED_MESSAGE,
            }));
            return;
        }

        runCreate({
            description: normalizeWhitespace(descriptionDraft) || undefined,
            name,
            shouldRefreshSuggestions: false,
            successMessage: (collectionName) => `${collectionName} created.`,
        });
    });

    const handleFormSubmit = useStableCallback(
        (event: React.SubmitEvent<HTMLFormElement>) => {
            event.preventDefault();
            handleSubmit();
        }
    );

    const handleNameChange = useStableCallback(
        (event: React.ChangeEvent<HTMLInputElement>) =>
            handleNameDraftChange(event.currentTarget.value)
    );

    const handleDescriptionChange = useStableCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            const nextDescriptionDraft = event.currentTarget.value;
            // Editing the description invalidates any in-flight request.
            setFormState((current) => ({
                ...current,
                descriptionDraft: nextDescriptionDraft,
                descriptionErrorMessage: null,
                pendingDescription: null,
            }));
        }
    );

    const handleGenerateDescription = useStableCallback(async () => {
        const title = normalizeWhitespace(nameDraft);
        if (
            title.length === 0 ||
            formState.pendingDescription !== null ||
            createSubmissionPendingRef.current
        ) {
            return;
        }

        const request = { title };

        setFormState((current) => ({
            ...current,
            descriptionErrorMessage: null,
            pendingDescription: request,
        }));

        try {
            const result = await getCollectionDescriptionSafely({ title });
            // Apply only if this exact request is still current; an edit or a
            // regenerated request invalidates this one.
            setFormState((current) => {
                if (current.pendingDescription !== request) {
                    return current;
                }
                return result.status === ACTION_STATUS.SUCCESS
                    ? {
                          ...current,
                          descriptionDraft: result.description,
                          descriptionErrorMessage: null,
                          pendingDescription: null,
                      }
                    : {
                          ...current,
                          descriptionErrorMessage: result.message,
                          pendingDescription: null,
                      };
            });
        } finally {
            setFormState((current) =>
                current.pendingDescription === request
                    ? { ...current, pendingDescription: null }
                    : current
            );
        }
    });

    const handleEnableSmartCollections = useStableCallback(async () => {
        await setEnabled(true);
    });

    const handleCreateFromTemplate = useStableCallback(
        (value: TemplateValue | null) => {
            if (!value) {
                return;
            }
            const template = TEMPLATE_BY_VALUE.get(value);
            if (!template) {
                return;
            }
            runCreate({
                description: template.description,
                name: template.name,
                onStart: () =>
                    setFormState((current) =>
                        current.errorMessage
                            ? { ...current, errorMessage: null }
                            : current
                    ),
                shouldRefreshSuggestions: true,
                successMessage: () => `${template.name} created from template.`,
            });
        }
    );

    // Reset before paint so reopening never shows the previous draft.
    useIsoLayoutEffect(() => {
        if (isCreateOpen) {
            setFormState(INITIAL_CREATE_FORM_STATE);
        }
    }, [isCreateOpen]);

    return (
        <Dialog onOpenChange={handleOpenChange} open={isCreateOpen}>
            <DialogPopup>
                <form className="contents" onSubmit={handleFormSubmit}>
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
                            <ChevronRight
                                aria-hidden
                                className="inline-block size-3.5 shrink-0"
                                focusable="false"
                            />
                            <DialogTitle className="font-medium text-sm">
                                New collection
                            </DialogTitle>
                        </div>
                    </DialogHeader>
                    <DialogPanel className="space-y-2">
                        <div>
                            <label
                                className="sr-only font-medium text-sm"
                                htmlFor={nameInputId}
                            >
                                Name
                            </label>
                            <Input
                                aria-describedby={
                                    errorMessage ? errorId : undefined
                                }
                                aria-invalid={errorMessage ? true : undefined}
                                autoFocus
                                className="-mx-[calc(--spacing(3)-1px)] font-semibold text-xl tracking-tight"
                                id={nameInputId}
                                isUnstyled
                                maxLength={NAME_MAX_LENGTH}
                                onChange={handleNameChange}
                                placeholder="Collection name"
                                required
                                size="lg"
                                type="text"
                                value={nameDraft}
                            />
                        </div>
                        <div>
                            <label
                                className="sr-only font-medium text-sm"
                                htmlFor={descriptionInputId}
                            >
                                Description (optional)
                            </label>
                            <div className="relative">
                                <Textarea
                                    aria-describedby={
                                        descriptionErrorMessage
                                            ? descriptionErrorId
                                            : undefined
                                    }
                                    aria-invalid={
                                        descriptionErrorMessage
                                            ? true
                                            : undefined
                                    }
                                    className="-mx-[calc(--spacing(3)-1px)] *:resize-none *:pr-10"
                                    id={descriptionInputId}
                                    isUnstyled
                                    maxLength={DESCRIPTION_MAX_LENGTH}
                                    onChange={handleDescriptionChange}
                                    placeholder="Describe what belongs here…"
                                    size="lg"
                                    value={descriptionDraft}
                                />
                                {isNameValid ? (
                                    <Button
                                        aria-label="Suggest a description"
                                        className="absolute top-0.5 right-0"
                                        disabled={isSubmitting}
                                        isLoading={isDescriptionPending}
                                        onClick={handleGenerateDescription}
                                        size="icon-xs"
                                        title="Suggest a description"
                                        type="button"
                                        variant="ghost"
                                    >
                                        <PencilSparkles
                                            aria-hidden
                                            focusable="false"
                                        />
                                    </Button>
                                ) : null}
                            </div>
                            {descriptionErrorMessage ? (
                                <ErrorMessage
                                    className="pt-2"
                                    id={descriptionErrorId}
                                >
                                    {descriptionErrorMessage}
                                </ErrorMessage>
                            ) : null}
                        </div>
                        {errorMessage ? (
                            <ErrorMessage className="pt-2" id={errorId}>
                                {errorMessage}
                            </ErrorMessage>
                        ) : null}
                        <Alert>
                            <Lightbulb aria-hidden focusable="false" />
                            <AlertDescription>
                                <p>
                                    Collections keep your best saves and content
                                    in one place. Use them for ongoing goals, or
                                    just to keep things tidy. Smart Collections
                                    can auto-assign matching entries to it – no
                                    extra work for you.{" "}
                                    {isEnabled === false ? (
                                        <Button
                                            className="inline-flex h-fit! w-fit px-0 text-inherit! leading-tight"
                                            onClick={
                                                handleEnableSmartCollections
                                            }
                                            size="xs"
                                            type="button"
                                            variant="link"
                                        >
                                            Enable Smart Collections
                                        </Button>
                                    ) : null}
                                </p>
                            </AlertDescription>
                        </Alert>
                    </DialogPanel>
                    <DialogFooter>
                        <Combobox
                            autoHighlight
                            items={TEMPLATES}
                            onValueChange={handleCreateFromTemplate}
                        >
                            <ComboboxTrigger
                                disabled={isDescriptionPending || isSubmitting}
                                render={
                                    <Button
                                        className="mr-auto -ml-2"
                                        size="xs"
                                        variant="link"
                                    />
                                }
                            >
                                <LibraryBig
                                    aria-hidden
                                    className="mr-0.5! size-4"
                                    focusable="false"
                                />
                                Explore Templates
                            </ComboboxTrigger>
                            <ComboboxPopup align="start" className="max-w-80">
                                <ComboboxInput placeholder="Create collection from template…" />
                                <ComboboxEmpty>
                                    No matching templates
                                </ComboboxEmpty>
                                <ComboboxList>
                                    <ComboboxCollection>
                                        {(template) => (
                                            <ComboboxItem
                                                key={template.value}
                                                value={template.value}
                                            >
                                                <div className="flex min-w-0 max-w-80 flex-col gap-0.5">
                                                    <span className="min-w-0 truncate text-foreground text-sm">
                                                        {template.name}
                                                    </span>
                                                    <span className="line-clamp-2 text-muted-foreground text-xs">
                                                        {template.description}
                                                    </span>
                                                </div>
                                            </ComboboxItem>
                                        )}
                                    </ComboboxCollection>
                                </ComboboxList>
                            </ComboboxPopup>
                        </Combobox>
                        <Button
                            disabled={!isNameValid || isDescriptionPending}
                            isLoading={isSubmitting}
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

function CollectionsRenameDialog() {
    const { pendingRename } = useCollectionsListStateContext();
    const { showSuccess } = useCollectionStatus();
    const { closePendingRename, syncName } = useCollectionsListActionsContext();

    const isOpen = pendingRename !== null;

    const [nameDraft, setNameDraft] = React.useState("");
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
    const { handleOpenChange, isSubmitting, runSubmission } =
        useSubmissionDialog({ onClose: closePendingRename });

    const inputId = React.useId();
    const errorId = React.useId();

    const handleNameDraftChange = useStableCallback((draft: string) => {
        setNameDraft(draft);
        if (errorMessage) {
            setErrorMessage(null);
        }
    });

    const handleNameChange = useStableCallback(
        (event: React.ChangeEvent<HTMLInputElement>) =>
            handleNameDraftChange(event.currentTarget.value)
    );

    const handleSubmit = useStableCallback(() => {
        const target = pendingRename;
        if (!target) {
            return;
        }

        const previousName = target.name;
        const nextName = normalizeWhitespace(nameDraft);

        if (nextName.length === 0) {
            setErrorMessage(NAME_REQUIRED_MESSAGE);
            return;
        }

        if (nextName === previousName) {
            closePendingRename();
            return;
        }

        syncName(target.id, nextName);
        runSubmission(async () => {
            const result = await renameCollectionSafely({
                collectionId: target.id,
                name: nextName,
            });

            if (result.status === ACTION_STATUS.UPDATED) {
                syncName(result.collection.id, result.collection.name);
                closePendingRename();
                showSuccess(`${result.collection.name} renamed.`);
                return;
            }

            syncName(target.id, previousName);
            setErrorMessage(result.message);
        });
    });

    // Sync draft before paint so the input never flashes empty on open.
    useIsoLayoutEffect(() => {
        if (!pendingRename) {
            return;
        }
        setNameDraft(pendingRename.name);
        setErrorMessage(null);
    }, [pendingRename]);

    const handleFormSubmit = useStableCallback(
        (event: React.SubmitEvent<HTMLFormElement>) => {
            event.preventDefault();
            handleSubmit();
        }
    );

    return (
        <Dialog onOpenChange={handleOpenChange} open={isOpen}>
            <DialogPopup>
                <form className="contents" onSubmit={handleFormSubmit}>
                    <DialogHeader>
                        <DialogTitle>Rename collection</DialogTitle>
                        <DialogDescription>
                            Update how this collection appears across your
                            library.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogPanel>
                        <div>
                            <label
                                className="sr-only font-medium text-sm"
                                htmlFor={inputId}
                            >
                                Name
                            </label>
                            <Input
                                aria-describedby={
                                    errorMessage ? errorId : undefined
                                }
                                aria-invalid={errorMessage ? true : undefined}
                                autoFocus
                                id={inputId}
                                maxLength={NAME_MAX_LENGTH}
                                onChange={handleNameChange}
                                placeholder="Collection name"
                                required
                                type="text"
                                value={nameDraft}
                            />
                            {errorMessage ? (
                                <ErrorMessage className="pt-2" id={errorId}>
                                    {errorMessage}
                                </ErrorMessage>
                            ) : null}
                        </div>
                    </DialogPanel>
                    <DialogFooter>
                        <DialogClose
                            disabled={isSubmitting}
                            render={<Button size="sm" variant="ghost" />}
                        >
                            Cancel
                        </DialogClose>
                        <Button
                            isLoading={isSubmitting}
                            size="sm"
                            type="submit"
                        >
                            Rename collection
                        </Button>
                    </DialogFooter>
                </form>
            </DialogPopup>
        </Dialog>
    );
}

function CollectionsDeleteDialog() {
    const { pendingDelete } = useCollectionsListStateContext();
    const { showSuccess } = useCollectionStatus();
    const { closePendingDelete, syncDeleted } =
        useCollectionsListActionsContext();
    const { handleOpenChange, isSubmitting, runSubmission } =
        useSubmissionDialog({ onClose: closePendingDelete });

    const isOpen = pendingDelete !== null;

    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    // Reset before paint so reopening never shows a stale error.
    useIsoLayoutEffect(() => {
        if (isOpen) {
            setErrorMessage(null);
        }
    }, [isOpen]);

    const handleSubmit = useStableCallback(() => {
        const target = pendingDelete;
        if (!target) {
            return;
        }

        runSubmission(async () => {
            const result = await deleteCollectionSafely({
                collectionId: target.id,
            });

            if (result.status !== ACTION_STATUS.DELETED) {
                setErrorMessage(result.message);
                return;
            }

            syncDeleted(result.collection.id);
            closePendingDelete();
            showSuccess(`${result.collection.name} deleted.`);
        });
    });

    const handleFormSubmit = useStableCallback(
        (event: React.SubmitEvent<HTMLFormElement>) => {
            event.preventDefault();
            handleSubmit();
        }
    );

    return (
        <Dialog onOpenChange={handleOpenChange} open={isOpen}>
            <DialogPopup>
                <form className="contents" onSubmit={handleFormSubmit}>
                    <DialogHeader>
                        <DialogTitle>Delete collection?</DialogTitle>
                        <DialogDescription>
                            Remove {pendingDelete?.name || "this collection"}{" "}
                            from Cache. Saved items will remain in your library,
                            but they won't belong to this collection anymore.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogPanel>
                        {errorMessage ? (
                            <ErrorMessage className="pt-2">
                                {errorMessage}
                            </ErrorMessage>
                        ) : null}
                    </DialogPanel>
                    <DialogFooter>
                        <DialogClose
                            disabled={isSubmitting}
                            render={<Button size="sm" variant="ghost" />}
                        >
                            Cancel
                        </DialogClose>
                        <Button
                            isLoading={isSubmitting}
                            size="sm"
                            type="submit"
                            variant="destructive"
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </form>
            </DialogPopup>
        </Dialog>
    );
}
