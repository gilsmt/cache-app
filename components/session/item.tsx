"use client";

import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import { cn } from "cn";
import { T } from "gt-next";
import {
    ArrowUpRight,
    Check,
    ChevronDown,
    DownloadIcon,
    ExternalLinkIcon,
    EyeIcon,
    FilePenLineIcon,
    History,
    LinkIcon,
    Quote,
    SearchIcon,
    Star,
    Volume2Icon,
    VolumeXIcon,
    ZoomIn,
} from "lucide-react";
import {
    AnimatePresence,
    motion,
    type Transition,
    useReducedMotion,
} from "motion/react";
import * as React from "react";
import { Controlled as ControlledZoom } from "react-medium-image-zoom";
import { Streamdown } from "streamdown";
import useSWR from "swr";
import { CommentComposer } from "@/components/comments/composer";
import { useCopyToClipboard } from "@/components/hooks/use-copy-to-clipboard";
import { useLastVisited } from "@/components/hooks/use-last-visited";
import { ItemCollectionsCombobox } from "@/components/session/collections";
import { openSide } from "@/components/session/side-panel";
import { AvatarGroup } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { AltKbd, CmdKbd, Kbd } from "@/components/ui/kbd";
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
import { Ticker } from "@/components/ui/ticker";
import { Toolbar, ToolbarButton } from "@/components/ui/toolbar";
import { downloadMedia } from "@/lib/collections/actions";
import {
    getLibraryItemPrimaryText,
    getLibraryItemTitle,
    isRecentlySmartCollected,
    itemPreviewImageProxyUrl,
    itemPreviewImageUrl,
    itemPreviewVideoUrl,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import {
    ACTION_STATUS,
    FALLBACK_URL,
    ITEM_KIND_NOTE,
    MIME_TYPES,
} from "@/lib/common/constants";
import { parseDate } from "@/lib/common/date";
import {
    type Dimensions,
    resolveDisplayDimensions,
} from "@/lib/common/dimension";
import { getOwnerDocument, getOwnerWindow } from "@/lib/common/dom";
import { saveFile } from "@/lib/common/file";
import { getImageColors } from "@/lib/common/image-color";
import { createLogger } from "@/lib/common/logs/console/logger";
import { slugify } from "@/lib/common/string";
import { fetchWithTimeout } from "@/lib/common/timeout";
import {
    normalizeURL,
    openExternalUrl,
    toValidUrl,
    tryParseUrl,
} from "@/lib/common/url";
import { getSourceIcon } from "@/lib/integrations/resolver";
import { LibraryItemSource } from "@/prisma/client/enums";
import { useDimensionCacheContext } from "./dimension-cache";

const log = createLogger("session:item");

const FAVORITE_REVEAL_TIMEOUT_MS = 2000;

const TOOLBAR_SLOT_DURATION_SECONDS = 0.22;

const NOTE_QUOTE_PAIRS = [
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["‘", "’"],
    ["«", "»"],
    ["‹", "›"],
] as const;

const ITEM_DOWNLOAD_TIMEOUT_MS = 60_000;

const COBALT_SOURCES = new Set<LibraryItemSource>([
    LibraryItemSource.google_photos,
    LibraryItemSource.instagram,
    LibraryItemSource.pinterest,
    LibraryItemSource.tiktok,
    LibraryItemSource.x_bookmarks,
    LibraryItemSource.youtube_watch_later,
]);

const ITEM_DOWNLOAD_FILE_EXTENSION_BY_MIME_TYPE: Partial<
    Record<string, ItemDownloadFileExtension>
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
};

type ItemCardActionVariant = "menu" | "contextMenu";

const ITEM_CARD_ACTIONS: {
    Component: (props: {
        surface: ItemCardActionVariant;
    }) => React.ReactElement;
    id: string;
    isAvailable?: (data: ItemCardDataContext) => boolean;
    separatorBefore?: boolean;
}[] = [
    { Component: ItemCardFavoriteAction, id: "favorite" },
    {
        Component: ItemCardNoteAction,
        id: "edit-note",
        isAvailable: ({ isNote }) => isNote,
    },
    {
        Component: ItemCardQuickLookAction,
        id: "side",
        isAvailable: ({ item }) =>
            item.kind !== ITEM_KIND_NOTE &&
            toValidUrl(normalizeURL(item.url)) !== FALLBACK_URL,
    },
    {
        Component: ItemCardZoomAction,
        id: "zoom",
        isAvailable: ({ previewImageUrl }) => previewImageUrl !== null,
    },
    {
        Component: ItemCardOpenLinkAction,
        id: "open-link",
        isAvailable: ({ isNote }) => !isNote,
    },
    {
        Component: ItemCardCopyLinkAction,
        id: "copy-link",
        isAvailable: ({ isNote }) => !isNote,
    },
    {
        Component: ItemCardDownloadAction,
        id: "download",
        isAvailable: ({ isNote, item }) =>
            !isNote && COBALT_SOURCES.has(item.source),
        separatorBefore: true,
    },
    { Component: ItemCardFindSimilarAction, id: "find-similar" },
    {
        Component: ItemCardWaybackAction,
        id: "wayback",
        isAvailable: ({ isNote }) => !isNote,
    },
    {
        Component: ItemCardDeleteAction,
        id: "delete",
        separatorBefore: true,
    },
];

type ItemDownloadFileExtension = Exclude<keyof typeof MIME_TYPES, "binary">;

interface ItemHoverVideo {
    handleCanPlay: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
    handlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    handlePointerEnter: () => void;
    handlePointerLeave: () => void;
    handleSoundToggle: (event: React.MouseEvent) => void;
    handleVideoError: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
    isSoundEnabled: boolean;
    isVideoLoading: boolean;
    shouldLoadVideo: boolean;
    videoRef: React.RefObject<HTMLVideoElement | null>;
}

export interface ItemPeekPlaceholder {
    aspect: string;
    id: string;
}

export interface ItemCardEnvironmentContext {
    favoriteItemIdSet: ReadonlySet<string>;
    hoveredItemIdRef: React.RefObject<string | null>;
    hoverPinnedItemIdRef: React.RefObject<string | null>;
    markVisited: (itemId: string) => void;
    onCopyLink: (item: LibraryItemWithCollections) => void;
    onDelete: (item: LibraryItemWithCollections) => void;
    onFindSimilar: (item: LibraryItemWithCollections) => void;
    onItemFavoriteToggle: (item: LibraryItemWithCollections) => void;
    onOpenInNewTab: (item: LibraryItemWithCollections) => void;
    onOpenNote: (item: LibraryItemWithCollections) => void;
    openPickerItemId: string | null;
    pendingDeleteItemId: string | null;
    setOpenPickerItemId: (id: string | null) => void;
}

interface ItemCardDataContext {
    displayTitle: string;
    isNote: boolean;
    item: LibraryItemWithCollections;
    previewImageUrl: string | null;
}

interface ItemCardDownloadContext {
    isDownloading: boolean;
    onDownload: () => void;
}

interface ItemCardZoomContext {
    isZoomed: boolean;
    onZoomChange: (nextZoomed: boolean) => void;
    onZoomIn: () => void;
}

interface ItemCardSurfaceContext {
    isMenuOpen: boolean;
    isOverlayOpen: boolean;
    onMenuOpenChange: (open: boolean) => void;
}

export const ItemCardEnvironmentContext =
    React.createContext<ItemCardEnvironmentContext | null>(null);

function useItemCardEnvironmentContext(): ItemCardEnvironmentContext {
    const context = React.use(ItemCardEnvironmentContext);
    if (!context) {
        throw new Error(
            "ItemCard components must be used inside <ItemCardEnvironmentContext>."
        );
    }
    return context;
}

const ItemCardDataContext = React.createContext<ItemCardDataContext | null>(
    null
);

function useItemCardDataContext(): ItemCardDataContext {
    const context = React.use(ItemCardDataContext);
    if (!context) {
        throw new Error(
            "ItemCard components must be used inside <ItemCardProvider>."
        );
    }
    return context;
}

const ItemCardDownloadContext =
    React.createContext<ItemCardDownloadContext | null>(null);

function useItemCardDownloadContext(): ItemCardDownloadContext {
    const context = React.use(ItemCardDownloadContext);
    if (!context) {
        throw new Error(
            "ItemCard components must be used inside <ItemCardDownloadProvider>."
        );
    }
    return context;
}

const ItemCardZoomContext = React.createContext<ItemCardZoomContext | null>(
    null
);

function useItemCardZoomContext(): ItemCardZoomContext {
    const context = React.use(ItemCardZoomContext);
    if (!context) {
        throw new Error(
            "ItemCard components must be used inside <ItemCardZoomProvider>."
        );
    }
    return context;
}

const ItemCardSurfaceContext =
    React.createContext<ItemCardSurfaceContext | null>(null);

function useItemCardSurfaceContext(): ItemCardSurfaceContext {
    const context = React.use(ItemCardSurfaceContext);
    if (!context) {
        throw new Error(
            "ItemCard surfaces must be used inside <ItemCardSurface>."
        );
    }
    return context;
}

function useItemPreviewDimensions(src: string | null) {
    const imgRef = React.useRef<HTMLImageElement | null>(null);
    const dimensionsCache = useDimensionCacheContext();
    const [hasFailed, setHasFailed] = React.useState(false);
    const [dimensions, setDimensions] = React.useState<Dimensions | null>(() =>
        dimensionsCache.readCached(src)
    );
    const [prevSrc, setPrevSrc] = React.useState(src);

    if (src !== prevSrc) {
        setPrevSrc(src);
        setHasFailed(false);
        setDimensions(dimensionsCache.readCached(src));
    }

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
            dimensionsCache.dimensions(src, next);
            setDimensions((current) =>
                current?.w === w && current?.h === h ? current : next
            );
        }
    );

    const handleError = useStableCallback(
        (event: React.SyntheticEvent<HTMLImageElement>) => {
            if (!src || event.currentTarget.getAttribute("src") !== src) {
                return;
            }
            // Pin a default slot when nothing is known yet so virtualization
            // remounts keep a stable aspect ratio.
            setDimensions(dimensionsCache.pinDefaultIfMissing(src));
            setHasFailed(true);
        }
    );

    const handleLoad = useStableCallback(
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

    React.useEffect(() => {
        if (!src || dimensionsCache.readCached(src)) {
            return;
        }
        let isCancelled = false;
        dimensionsCache.resolveFromServer(src).then((serverDimensions) => {
            if (serverDimensions === null || isCancelled) {
                return;
            }
            setDimensions((current) => current ?? serverDimensions);
        });
        return () => {
            isCancelled = true;
        };
    }, [dimensionsCache, src]);

    return {
        displayDimensions: resolveDisplayDimensions(dimensions),
        handleError,
        handleLoad,
        imgRef,
        isRenderable: !!src && !hasFailed,
    };
}

function useItemHoverVideo(videoSrc: string | null): ItemHoverVideo {
    const videoRef = React.useRef<HTMLVideoElement | null>(null);
    const [isHovered, setIsHovered] = React.useState(false);
    const [isSoundEnabled, setIsSoundEnabled] = React.useState(true);
    const [hasVideoFailed, setHasVideoFailed] = React.useState(false);
    const [hasVideoStarted, setHasVideoStarted] = React.useState(false);
    const [prevVideoSrc, setPrevVideoSrc] = React.useState(videoSrc);

    if (videoSrc !== prevVideoSrc) {
        setPrevVideoSrc(videoSrc);
        setHasVideoStarted(false);
        setHasVideoFailed(false);
    }

    const canRenderVideo = videoSrc !== null && videoSrc.length > 0;
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

    const handleCanPlay = useStableCallback(
        (event: React.SyntheticEvent<HTMLVideoElement>) => {
            const video = event.currentTarget;
            if (video !== videoRef.current) {
                return;
            }
            setHasVideoStarted(true);
            if (!isHovered || hasVideoFailed) {
                return;
            }
            video.play().catch((error: unknown) => {
                log.debug("Failed to play hover preview", { error });
            });
        }
    );

    const handleVideoError = useStableCallback(
        (event: React.SyntheticEvent<HTMLVideoElement>) => {
            const video = event.currentTarget;
            if (video !== videoRef.current) {
                return;
            }
            log.debug("Video source failed to load", {
                mediaError: video.error,
                networkState: video.networkState,
                readyState: video.readyState,
                videoSrc,
            });
            setHasVideoFailed(true);
        }
    );

    const handleSoundToggle = useStableCallback((event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setIsSoundEnabled((prev) => !prev);
    });

    React.useEffect(() => {
        const video = videoRef.current;
        if (
            !(
                video &&
                shouldLoadVideo &&
                video.getAttribute("src") === videoSrc
            )
        ) {
            return;
        }

        video.play().catch((error: unknown) => {
            log.debug("Failed to resume hover preview", { error });
        });
    }, [shouldLoadVideo, videoSrc]);

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

    return {
        handleCanPlay,
        handlePointerDown,
        handlePointerEnter,
        handlePointerLeave: stopHoverPlayback,
        handleSoundToggle,
        handleVideoError,
        isSoundEnabled,
        isVideoLoading,
        shouldLoadVideo,
        videoRef,
    };
}

function useItemHoverReveal(allowReveal: boolean) {
    const [isRevealed, setIsRevealed] = React.useState(false);
    const revealTimeout = useTimeout();

    const handleRevealStart = useStableCallback(() => {
        if (!allowReveal) {
            return;
        }
        revealTimeout.start(FAVORITE_REVEAL_TIMEOUT_MS, () => {
            setIsRevealed(true);
        });
    });

    const handleRevealEnd = useStableCallback(() => {
        revealTimeout.clear();
        setIsRevealed(false);
    });

    return { handleRevealEnd, handleRevealStart, isRevealed };
}

function useItemCardLinkActions() {
    const { item } = useItemCardDataContext();
    const { onCopyLink, onOpenInNewTab } = useItemCardEnvironmentContext();

    const SourceIcon = getSourceIcon(item.source);

    const handleOpenInNewTab = useStableCallback(() => onOpenInNewTab(item));
    const handleCopyLink = useStableCallback(() => onCopyLink(item));

    return { handleCopyLink, handleOpenInNewTab, SourceIcon };
}

function formatWaybackTimestamp(daysOffset: number): string {
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

function getItemDownloadFileExtension(
    url: string,
    contentType: string | null
): ItemDownloadFileExtension | null {
    const normalizedContentType = contentType
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase();

    const contentTypeExtension =
        normalizedContentType &&
        ITEM_DOWNLOAD_FILE_EXTENSION_BY_MIME_TYPE[normalizedContentType];

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
    return (
        Object.values(ITEM_DOWNLOAD_FILE_EXTENSION_BY_MIME_TYPE).find(
            (extension) => extension === urlExtension
        ) ?? null
    );
}

function formatItemDate(dateValue: Date | string | null | undefined): string {
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

async function saveItemMedia(item: LibraryItemWithCollections): Promise<void> {
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
        ITEM_DOWNLOAD_TIMEOUT_MS
    );
    if (!response.ok) {
        throw new Error(`Failed to fetch media download (${response.status})`);
    }

    const blob = await response.blob();
    const extension = getItemDownloadFileExtension(
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

function hasWrappingQuotes(text: string | null): boolean {
    const trimmedText = text?.trim();
    if (!trimmedText || trimmedText.length < 3) {
        return false;
    }
    return NOTE_QUOTE_PAIRS.some(
        ([openingQuote, closingQuote]) =>
            trimmedText.startsWith(openingQuote) &&
            trimmedText.endsWith(closingQuote)
    );
}

interface ItemPreviewProps {
    hover?: ItemHoverVideo | null;
    src: string | null;
    videoSrc?: string | null;
}

export function ItemPreview({
    hover,
    src,
    videoSrc,
}: ItemPreviewProps): React.ReactElement {
    return (
        <ItemPreviewImage src={src}>
            {hover?.shouldLoadVideo ? (
                <video
                    className="squircle drag-none pointer-events-none absolute inset-0 size-full rounded-xl object-contain"
                    crossOrigin="use-credentials"
                    draggable="false"
                    key={videoSrc}
                    loop
                    muted={!hover.isSoundEnabled}
                    onCanPlay={hover.handleCanPlay}
                    onError={hover.handleVideoError}
                    playsInline
                    preload="none"
                    ref={hover.videoRef}
                    src={videoSrc ?? undefined}
                />
            ) : null}
        </ItemPreviewImage>
    );
}

interface ItemNotePreviewProps {
    contentHtml: string | null;
    contentText: string | null;
}

export function ItemNotePreview({
    contentHtml,
    contentText,
}: ItemNotePreviewProps): React.ReactElement {
    const isQuoted = hasWrappingQuotes(contentText);

    return (
        <div className="mask-b-from-[calc(100%-var(--fade-size))] size-full max-h-60 select-none p-4 [--fade-size:1rem]">
            {isQuoted && <Quote className="mx-auto mb-2 size-4" />}
            <Streamdown
                className={cn(
                    "text-[11px] text-foreground",
                    isQuoted && "text-center text-base italic"
                )}
                mode="static"
            >
                {contentHtml ?? "Tap to start writing in this note"}
            </Streamdown>
        </div>
    );
}

export function ItemCardProvider({
    children,
    value,
}: React.PropsWithChildren<{ value: LibraryItemWithCollections }>) {
    const contextValue: ItemCardDataContext = {
        displayTitle: getLibraryItemPrimaryText(value),
        isNote: value.kind === ITEM_KIND_NOTE,
        item: value,
        previewImageUrl: itemPreviewImageUrl(value),
    };

    return (
        <ItemCardDataContext value={contextValue}>
            {children}
        </ItemCardDataContext>
    );
}

export function ItemCardZoomProvider({ children }: React.PropsWithChildren) {
    const [isZoomed, setIsZoomed] = React.useState(false);

    // Ignore zoom-in requests so clicks keep opening the item; zooming in is
    // the card menu's job.
    const handleZoomChange = useStableCallback((nextZoomed: boolean) => {
        if (!nextZoomed) {
            setIsZoomed(false);
        }
    });

    const handleZoomIn = useStableCallback(() => {
        setIsZoomed(true);
    });

    const contextValue: ItemCardZoomContext = {
        isZoomed,
        onZoomChange: handleZoomChange,
        onZoomIn: handleZoomIn,
    };

    return (
        <ItemCardZoomContext value={contextValue}>
            {children}
        </ItemCardZoomContext>
    );
}

export function ItemCardDownloadProvider({
    children,
}: React.PropsWithChildren) {
    const { item } = useItemCardDataContext();
    const [isDownloading, startDownloadTransition] = React.useTransition();
    const [hasDownloadError, setHasDownloadError] = React.useState(false);

    const handleDownload = useStableCallback(() => {
        setHasDownloadError(false);
        startDownloadTransition(async () => {
            try {
                await saveItemMedia(item);
            } catch (error) {
                setHasDownloadError(true);
                log.error("Failed to prepare media download", error, {
                    itemId: item.id,
                    url: item.url,
                });
            }
        });
    });

    const contextValue: ItemCardDownloadContext = {
        isDownloading,
        onDownload: handleDownload,
    };

    return (
        <>
            <ItemCardDownloadContext value={contextValue}>
                {children}
            </ItemCardDownloadContext>
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

export function ItemCardSurface({ children }: React.PropsWithChildren) {
    const { item } = useItemCardDataContext();
    const { hoveredItemIdRef, hoverPinnedItemIdRef, openPickerItemId } =
        useItemCardEnvironmentContext();

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

    const contextValue: ItemCardSurfaceContext = {
        isMenuOpen,
        isOverlayOpen: isMenuOpen || isContextMenuOpen,
        onMenuOpenChange: setIsMenuOpen,
    };

    return (
        <ItemCardSurfaceContext value={contextValue}>
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
                    <ItemCardPopupContent surface="contextMenu" />
                </ContextMenuPopup>
            </ContextMenu>
        </ItemCardSurfaceContext>
    );
}

export function ItemCardTarget() {
    const { isNote, item } = useItemCardDataContext();
    const {
        favoriteItemIdSet,
        markVisited,
        onItemFavoriteToggle,
        onOpenInNewTab,
        onOpenNote,
    } = useItemCardEnvironmentContext();
    const { isZoomed, onZoomChange } = useItemCardZoomContext();

    const isFavorite = favoriteItemIdSet.has(item.id);
    const hasNoteContent = (item.noteContentText ?? "").trim().length > 0;
    const previewImageUrl = itemPreviewImageUrl(item);
    const previewVideoUrl = itemPreviewVideoUrl(item);

    const hover = useItemHoverVideo(isNote ? null : previewVideoUrl);
    const reveal = useItemHoverReveal(!isNote);

    const handleOpen = useStableCallback(() => {
        if (isNote) {
            onOpenNote(item);
            return;
        }
        onOpenInNewTab(item);
        markVisited(item.id);
    });

    const handleToggleFavorite = useStableCallback(() => {
        onItemFavoriteToggle(item);
    });

    const handlePointerEnter = useStableCallback(() => {
        hover.handlePointerEnter();
        reveal.handleRevealStart();
    });

    const handlePointerLeave = useStableCallback(() => {
        hover.handlePointerLeave();
        reveal.handleRevealEnd();
    });

    const handleOpenKeyDown = useStableCallback(
        (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === "Enter") {
                handleOpen();
            }
        }
    );

    return (
        // biome-ignore lint/a11y/useSemanticElements: ControlledZoom conflicts with anchor elements
        <div
            aria-label={
                isNote
                    ? item.noteContentText?.trim() || "Note"
                    : getLibraryItemTitle(item)
            }
            className={cn(
                "squircle group/preview relative flex flex-col overflow-clip rounded-xl focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                { "bg-muted/90": isNote }
            )}
            onClick={handleOpen}
            onKeyDown={handleOpenKeyDown}
            onPointerDown={hover.handlePointerDown}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            role="link"
            tabIndex={0}
        >
            {isNote ? (
                <ItemNotePreview
                    contentHtml={
                        hasNoteContent && item.noteContentHtml
                            ? item.noteContentHtml
                            : null
                    }
                    contentText={item.noteContentText}
                />
            ) : (
                <>
                    <ControlledZoom
                        isZoomed={isZoomed}
                        onZoomChange={onZoomChange}
                    >
                        <ItemPreview
                            hover={hover}
                            src={previewImageUrl}
                            videoSrc={previewVideoUrl}
                        />
                    </ControlledZoom>
                    <ItemCardToolbar
                        isFavorite={isFavorite}
                        isRevealed={reveal.isRevealed}
                        isSoundEnabled={hover.isSoundEnabled}
                        isVideoLoading={hover.isVideoLoading}
                        itemId={item.id}
                        onOpen={handleOpen}
                        onToggleFavorite={handleToggleFavorite}
                        onToggleSound={hover.handleSoundToggle}
                        shouldLoadVideo={hover.shouldLoadVideo}
                    />
                </>
            )}
            <div
                aria-hidden
                className="squircle pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-foreground/5 ring-inset"
            />
        </div>
    );
}

export function ItemCardFooter() {
    const { item } = useItemCardDataContext();
    const { openPickerItemId, setOpenPickerItemId } =
        useItemCardEnvironmentContext();

    const isPickerOpen = openPickerItemId === item.id;
    const showSmartCollectionsIndicator =
        item.collections.length > 0 &&
        isRecentlySmartCollected(item.smartCollectedAt);

    const handlePickerOpenChange = useStableCallback((nextOpen: boolean) => {
        setOpenPickerItemId(nextOpen ? item.id : null);
    });

    return (
        <div className="flex items-center py-1.5">
            <ItemCollectionsCombobox
                items={[item]}
                onOpenChange={handlePickerOpenChange}
                open={isPickerOpen}
                triggerAriaLabel={
                    showSmartCollectionsIndicator
                        ? "Smart Collections just organized this"
                        : undefined
                }
            >
                {showSmartCollectionsIndicator ? (
                    <ItemCardSmartCollectionsIndicator />
                ) : null}
            </ItemCollectionsCombobox>
            <ItemCardTitleMenu />
        </div>
    );
}

export function ItemCardSkeleton({
    data,
    index,
}: {
    data: ItemPeekPlaceholder;
    index: number;
}) {
    const opacity = Math.max(0.25, 1 - index * 0.03);

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

interface ItemPreviewImageProps {
    children?: React.ReactNode;
    src: string | null;
}

function ItemPreviewImage({
    children,
    src,
}: ItemPreviewImageProps): React.ReactElement {
    const { displayDimensions, handleError, handleLoad, imgRef, isRenderable } =
        useItemPreviewDimensions(src);

    const aspectRatio = `${displayDimensions.w} / ${displayDimensions.h}`;

    return (
        <div
            className="relative w-full break-inside-avoid"
            style={{ aspectRatio }}
        >
            {isRenderable ? (
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: resource load/error lifecycle is not user interaction; upstream jsx-a11y exempts img onError/onLoad
                <img
                    alt=""
                    className="drag-none size-full object-cover"
                    decoding="async"
                    draggable="false"
                    height={displayDimensions.h}
                    // Remount on src change so aborted prior loads cannot
                    // fire stale error/load events against the new URL.
                    key={src}
                    loading="eager"
                    onError={handleError}
                    onLoad={handleLoad}
                    ref={imgRef}
                    src={src ?? undefined}
                    style={{ cursor: "pointer" }}
                    width={displayDimensions.w}
                />
            ) : (
                <Placeholder className="-z-1 size-full" />
            )}
            {children}
        </div>
    );
}

interface ItemCardToolbarProps {
    isFavorite: boolean;
    isRevealed: boolean;
    isSoundEnabled: boolean;
    isVideoLoading: boolean;
    itemId: string;
    onOpen: () => void;
    onToggleFavorite: () => void;
    onToggleSound: (event: React.MouseEvent) => void;
    shouldLoadVideo: boolean;
}

function ItemCardToolbar({
    isFavorite,
    isRevealed,
    isSoundEnabled,
    isVideoLoading,
    itemId,
    onOpen,
    onToggleFavorite,
    onToggleSound,
    shouldLoadVideo,
}: ItemCardToolbarProps): React.ReactElement {
    const { isLastVisited } = useLastVisited();
    const shouldReduceMotion = useReducedMotion();

    const shouldShowVisitedStatus = isLastVisited(itemId);
    const shouldShowFavoriteControl = isFavorite || isRevealed;
    const isPinned = isFavorite || shouldShowVisitedStatus;

    const slotTransition: Transition = {
        duration: shouldReduceMotion ? 0 : TOOLBAR_SLOT_DURATION_SECONDS,
        ease: "easeOut",
    };

    const handleCardKeyDown = useStableCallback(
        (event: React.KeyboardEvent) => {
            if (event.key === "Enter") {
                event.stopPropagation();
            }
        }
    );

    const handleFavoriteClick = useStableCallback((event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onToggleFavorite();
    });

    const handleOpenClick = useStableCallback((event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onOpen();
    });

    const SoundIcon = isSoundEnabled ? Volume2Icon : VolumeXIcon;

    return (
        <Toolbar
            aria-label="Preview actions"
            className={cn(
                "squircle absolute right-2 bottom-2 z-10 w-auto justify-end gap-px overflow-hidden rounded-lg bg-black/55 p-0.5 text-white shadow-lg transition-opacity",
                !isPinned &&
                    "opacity-0 focus-within:opacity-100 group-hover/preview:opacity-100"
            )}
        >
            <AnimatePresence initial={false}>
                {shouldShowVisitedStatus ? (
                    <ItemCardToolbarSlot
                        key="visited"
                        transition={slotTransition}
                    >
                        <span className="whitespace-nowrap px-1 font-medium text-[11px]">
                            <T>Last visited</T>
                        </span>
                    </ItemCardToolbarSlot>
                ) : null}
                {isVideoLoading ? (
                    <ItemCardToolbarSlot
                        key="loading"
                        transition={slotTransition}
                    >
                        <Spinner
                            aria-hidden
                            className="ml-1 size-3.5"
                            focusable="false"
                        />
                    </ItemCardToolbarSlot>
                ) : null}
                {!isVideoLoading && shouldLoadVideo ? (
                    <ItemCardToolbarSlot
                        key="sound"
                        transition={slotTransition}
                    >
                        <ToolbarButton
                            aria-label={
                                isSoundEnabled
                                    ? "Mute video preview"
                                    : "Enable video preview sound"
                            }
                            aria-pressed={isSoundEnabled}
                            className="size-5 rounded-lg text-white transition-none hover:bg-white/15 focus-visible:ring-white/70"
                            onClick={onToggleSound}
                            onKeyDown={handleCardKeyDown}
                        >
                            <SoundIcon
                                aria-hidden
                                className="size-3.5"
                                focusable="false"
                            />
                        </ToolbarButton>
                    </ItemCardToolbarSlot>
                ) : null}
                {shouldShowFavoriteControl ? (
                    <ItemCardToolbarSlot
                        key="favorite"
                        transition={slotTransition}
                    >
                        <ToolbarButton
                            aria-label={
                                isFavorite
                                    ? "Remove from Favorites"
                                    : "Add to Favorites"
                            }
                            aria-pressed={isFavorite}
                            className="size-5 rounded-lg text-white transition-none hover:bg-white/15 focus-visible:ring-white/70"
                            onClick={handleFavoriteClick}
                            onKeyDown={handleCardKeyDown}
                        >
                            <Star
                                aria-hidden
                                className={cn(
                                    "size-3.5",
                                    isFavorite && "fill-current"
                                )}
                                focusable="false"
                            />
                        </ToolbarButton>
                    </ItemCardToolbarSlot>
                ) : null}
            </AnimatePresence>
            <ToolbarButton
                aria-label="Open"
                className="size-5 rounded-lg text-white transition-none hover:bg-white/15 focus-visible:ring-white/70"
                onClick={handleOpenClick}
                onKeyDown={handleCardKeyDown}
            >
                <ArrowUpRight
                    aria-hidden
                    className="size-3.5"
                    focusable="false"
                />
            </ToolbarButton>
        </Toolbar>
    );
}

interface ItemCardToolbarSlotProps extends React.PropsWithChildren {
    transition: Transition;
}

function ItemCardToolbarSlot({
    children,
    transition,
}: ItemCardToolbarSlotProps): React.ReactElement {
    return (
        <motion.span
            animate={{ opacity: 1, width: "auto" }}
            className="flex items-center overflow-hidden"
            exit={{ opacity: 0, width: 0 }}
            initial={{ opacity: 0, width: 0 }}
            transition={transition}
        >
            {children}
        </motion.span>
    );
}

function ItemCardSmartCollectionsIndicator() {
    return (
        <svg
            aria-hidden="true"
            className="size-4"
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
                className="animate-smart-collections-indicator"
                d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9"
                fill="none"
                pathLength={1}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.25}
            />
        </svg>
    );
}

interface ItemCardColorSwatchProps {
    name: string;
    value: string;
}

function ItemCardColorSwatch({ name, value }: ItemCardColorSwatchProps) {
    const { copyToClipboard, isCopied } = useCopyToClipboard();

    const handleCopy = useStableCallback(() => copyToClipboard(value));

    return (
        <button
            aria-label={`Copy ${name}`}
            className="relative flex size-4.5 cursor-pointer items-center justify-center rounded-full"
            onClick={handleCopy}
            style={{ backgroundColor: value }}
            title={name}
            type="button"
        >
            {isCopied ? (
                <>
                    <Check className="size-3 text-black invert" />
                    <span className="absolute -bottom-4 text-nowrap rounded-xl bg-background text-[11px] text-success-foreground">
                        Copied!
                    </span>
                </>
            ) : null}
        </button>
    );
}

function ItemCardColorPalette({ src }: { src: string }) {
    // src must serve same-origin image bytes (proxy delivery): a redirect
    // URL taints the canvas on cross-origin upstreams and yields no colors.
    const { data } = useSWR(src, getImageColors, {
        keepPreviousData: true,
    });

    if (!data?.length) {
        return null;
    }

    return (
        <AvatarGroup className="justify-end -space-x-1">
            {data.map(({ hex, name }) => (
                <ItemCardColorSwatch key={name} name={name} value={hex} />
            ))}
        </AvatarGroup>
    );
}

function ItemCardDetails() {
    const { displayTitle, isNote, item } = useItemCardDataContext();

    const addedLabel = formatItemDate(item.scrapedAt ?? item.createdAt);
    const createdLabel = formatItemDate(item.createdAt);
    const shouldShowFullTitle = !isNote && displayTitle !== item.url;
    const paletteSrc = itemPreviewImageProxyUrl(item);

    return (
        <Collapsible className="group/collapsible">
            <CollapsibleTrigger
                render={
                    <Button
                        className="max-w-60 justify-between rounded-xl"
                        variant="ghost"
                    />
                }
            >
                <span className="block min-w-0 truncate text-xs">
                    {displayTitle}
                </span>
                <ChevronDown className="ml-auto inline-block size-4 -rotate-90 transition-transform group-data-open/collapsible:rotate-0" />
            </CollapsibleTrigger>
            <CollapsiblePanel className="px-2.5 text-[11px] text-muted-foreground">
                {shouldShowFullTitle ? (
                    <p className="wrap-break-words max-w-52 whitespace-normal py-0.5 text-foreground">
                        {displayTitle}
                    </p>
                ) : null}
                {isNote ? null : (
                    <span className="inline-block min-w-0 max-w-52 truncate py-0.5 text-muted-foreground underline">
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
                {paletteSrc ? (
                    <div className="flex items-center justify-between gap-3 py-0.5 pb-3">
                        <span>Palette</span>
                        <ItemCardColorPalette src={paletteSrc} />
                    </div>
                ) : null}
            </CollapsiblePanel>
        </Collapsible>
    );
}

function ItemCardActions({ surface }: { surface: ItemCardActionVariant }) {
    const data = useItemCardDataContext();

    const Separator = surface === "menu" ? MenuSeparator : ContextMenuSeparator;

    return (
        <>
            {ITEM_CARD_ACTIONS.filter(
                (action) => action.isAvailable?.(data) ?? true
            ).map((action) => (
                <React.Fragment key={action.id}>
                    {action.separatorBefore ? <Separator /> : null}
                    <action.Component surface={surface} />
                </React.Fragment>
            ))}
        </>
    );
}

function ItemCardCommentComposer() {
    const { item } = useItemCardDataContext();
    const { isOverlayOpen } = useItemCardSurfaceContext();

    return <CommentComposer isOpen={isOverlayOpen} itemId={item.id} />;
}

function ItemCardPopupContent({ surface }: { surface: ItemCardActionVariant }) {
    const Separator = surface === "menu" ? MenuSeparator : ContextMenuSeparator;

    return (
        <>
            <ItemCardDetails />
            <ItemCardCommentComposer />
            <Separator />
            <ItemCardActions surface={surface} />
        </>
    );
}

function ItemCardActionItem({
    surface,
    ...props
}: React.ComponentProps<typeof MenuItem> & {
    surface: ItemCardActionVariant;
}) {
    return surface === "menu" ? (
        <MenuItem {...props} />
    ) : (
        <ContextMenuItem {...props} />
    );
}

function ItemCardTitleMenu() {
    const { displayTitle } = useItemCardDataContext();
    const { isMenuOpen, onMenuOpenChange } = useItemCardSurfaceContext();

    return (
        <Menu modal={false} onOpenChange={onMenuOpenChange} open={isMenuOpen}>
            <MenuTrigger
                render={
                    <Button
                        className="w-full min-w-0 flex-1 justify-start overflow-clip text-nowrap px-0 text-left text-xs!"
                        size="xs"
                        title={displayTitle}
                        type="button"
                        variant="ghost"
                    />
                }
            >
                <Ticker className="pt-px">{displayTitle}</Ticker>
            </MenuTrigger>
            <MenuPopup>
                <ItemCardPopupContent surface="menu" />
            </MenuPopup>
        </Menu>
    );
}

function ItemCardFavoriteAction({
    surface,
}: {
    surface: ItemCardActionVariant;
}) {
    const { item } = useItemCardDataContext();
    const { favoriteItemIdSet, onItemFavoriteToggle } =
        useItemCardEnvironmentContext();

    const isFavorite = favoriteItemIdSet.has(item.id);

    const handleToggle = useStableCallback(() => onItemFavoriteToggle(item));

    return (
        <ItemCardActionItem onClick={handleToggle} surface={surface}>
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
        </ItemCardActionItem>
    );
}

function ItemCardNoteAction({ surface }: { surface: ItemCardActionVariant }) {
    const { item } = useItemCardDataContext();
    const { onOpenNote } = useItemCardEnvironmentContext();

    const handleOpenNote = useStableCallback(() => onOpenNote(item));

    return (
        <ItemCardActionItem onClick={handleOpenNote} surface={surface}>
            <FilePenLineIcon className="size-4.5 text-muted-foreground" />
            Edit note
        </ItemCardActionItem>
    );
}

function ItemCardQuickLookAction({
    surface,
}: {
    surface: ItemCardActionVariant;
}) {
    const { displayTitle, item } = useItemCardDataContext();

    const handleOpen = useStableCallback(() => {
        openSide({
            title: displayTitle,
            url: item.url,
        });
    });

    return (
        <ItemCardActionItem onClick={handleOpen} surface={surface}>
            <EyeIcon className="size-4.5 text-muted-foreground" />
            Quick look
            <Kbd className="ml-auto">
                <AltKbd />E
            </Kbd>
        </ItemCardActionItem>
    );
}

function ItemCardZoomAction({ surface }: { surface: ItemCardActionVariant }) {
    const { onZoomIn } = useItemCardZoomContext();

    return (
        <ItemCardActionItem onClick={onZoomIn} surface={surface}>
            <ZoomIn className="size-4.5 text-muted-foreground" />
            Zoom in
        </ItemCardActionItem>
    );
}

function ItemCardOpenLinkAction({
    surface,
}: {
    surface: ItemCardActionVariant;
}) {
    const { SourceIcon, handleOpenInNewTab } = useItemCardLinkActions();

    return (
        <ItemCardActionItem
            className="cursor-alias"
            onClick={handleOpenInNewTab}
            surface={surface}
        >
            {SourceIcon ? (
                <SourceIcon className="size-4 text-muted-foreground" />
            ) : (
                <ExternalLinkIcon className="size-4.5 text-muted-foreground" />
            )}
            Open in New Tab
            <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
        </ItemCardActionItem>
    );
}

function ItemCardCopyLinkAction({
    surface,
}: {
    surface: ItemCardActionVariant;
}) {
    const { handleCopyLink } = useItemCardLinkActions();

    return (
        <ItemCardActionItem onClick={handleCopyLink} surface={surface}>
            <LinkIcon className="size-4.5 text-muted-foreground" />
            Copy link URL
        </ItemCardActionItem>
    );
}

function ItemCardDownloadAction({
    surface,
}: {
    surface: ItemCardActionVariant;
}) {
    const { isDownloading, onDownload } = useItemCardDownloadContext();

    return (
        <ItemCardActionItem
            disabled={isDownloading}
            onClick={onDownload}
            surface={surface}
        >
            <DownloadIcon className="size-4.5 text-muted-foreground" />
            {isDownloading ? "Downloading…" : "Download"}
        </ItemCardActionItem>
    );
}

function ItemCardFindSimilarAction({
    surface,
}: {
    surface: ItemCardActionVariant;
}) {
    const { item } = useItemCardDataContext();
    const { onFindSimilar } = useItemCardEnvironmentContext();

    const handleFindSimilar = useStableCallback(() => onFindSimilar(item));

    return (
        <ItemCardActionItem onClick={handleFindSimilar} surface={surface}>
            <SearchIcon className="size-4.5 text-muted-foreground" />
            Find similar
        </ItemCardActionItem>
    );
}

const ITEM_WAYBACK_SNAPSHOT_OFFSETS: {
    daysOffset: number | null;
    label: string;
}[] = [
    { daysOffset: -30, label: "1 month ago" },
    { daysOffset: -90, label: "3 months ago" },
    { daysOffset: -180, label: "6 months ago" },
    { daysOffset: -365, label: "1 year ago" },
    { daysOffset: null, label: "View all snapshots" },
];

function ItemCardWaybackAction({
    surface,
}: {
    surface: ItemCardActionVariant;
}) {
    const triggerContent = (
        <>
            <History className="size-4.5 text-muted-foreground" />
            Previous versions
        </>
    );
    const items = ITEM_WAYBACK_SNAPSHOT_OFFSETS.map((snapshot) => (
        <ItemCardWaybackSnapshotItem
            daysOffset={snapshot.daysOffset}
            key={snapshot.label}
            label={snapshot.label}
            surface={surface}
        />
    ));

    if (surface === "menu") {
        return (
            <MenuSub>
                <MenuSubTrigger>{triggerContent}</MenuSubTrigger>
                <MenuSubPopup>
                    <MenuGroup>
                        <MenuGroupLabel>Wayback Machine</MenuGroupLabel>
                        {items}
                    </MenuGroup>
                </MenuSubPopup>
            </MenuSub>
        );
    }
    return (
        <ContextMenuSub>
            <ContextMenuSubTrigger>{triggerContent}</ContextMenuSubTrigger>
            <ContextMenuSubPopup>
                <ContextMenuGroup>
                    <ContextMenuGroupLabel>
                        Wayback Machine
                    </ContextMenuGroupLabel>
                    {items}
                </ContextMenuGroup>
            </ContextMenuSubPopup>
        </ContextMenuSub>
    );
}

function ItemCardWaybackSnapshotItem({
    daysOffset,
    label,
    surface,
}: {
    daysOffset: number | null;
    label: string;
    surface: ItemCardActionVariant;
}) {
    const { item } = useItemCardDataContext();

    const handleSnapshot = useStableCallback(() => {
        if (daysOffset === null) {
            openExternalUrl(`https://web.archive.org/web/*/${item.url}`);
            return;
        }
        openExternalUrl(
            `https://web.archive.org/web/${formatWaybackTimestamp(daysOffset)}/${item.url}`
        );
    });

    return (
        <ItemCardActionItem onClick={handleSnapshot} surface={surface}>
            <History className="size-4 text-muted-foreground" />
            {label}
        </ItemCardActionItem>
    );
}

function ItemCardDeleteAction({ surface }: { surface: ItemCardActionVariant }) {
    const { item } = useItemCardDataContext();
    const { onDelete, pendingDeleteItemId } = useItemCardEnvironmentContext();

    const isDeletePending = pendingDeleteItemId === item.id;

    const handleDelete = useStableCallback(() => onDelete(item));

    return (
        <ItemCardActionItem
            disabled={isDeletePending}
            onClick={handleDelete}
            surface={surface}
        >
            {isDeletePending ? <T>Deleting…</T> : <T>Delete</T>}
            <Kbd className="ml-auto">
                <CmdKbd />⌫
            </Kbd>
        </ItemCardActionItem>
    );
}
