"use client";

import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import { cn } from "cn";
import { T } from "gt-next";
import { ArrowUpRight, Star, Volume2Icon, VolumeXIcon } from "lucide-react";
import * as React from "react";
import { Controlled as ControlledZoom } from "react-medium-image-zoom";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { Placeholder } from "@/components/ui/placeholder";
import { Spinner } from "@/components/ui/spinner";
import { useLastVisited } from "@/hooks/use-last-visited";
import {
    getLibraryItemTitle,
    itemPreviewImageUrl,
    itemPreviewVideoUrl,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { ITEM_KIND_NOTE } from "@/lib/common/constants";
import {
    type Dimensions,
    resolveDisplayDimensions,
} from "@/lib/common/dimension";
import { getOwnerDocument, getOwnerWindow } from "@/lib/common/dom";
import { createLogger } from "@/lib/common/logs/console/logger";
import { useDimensionCacheContext } from "./dimension-cache";

const FAVORITE_REVEAL_TIMEOUT_MS = 2000;

const log = createLogger("session:preview");

interface PreviewImageProps
    extends Omit<React.ComponentProps<"div">, "children"> {
    children?: React.ReactNode;
    src: string | null;
}

export function PreviewImage({
    children,
    className,
    src,
    style,
    ...rest
}: PreviewImageProps): React.ReactElement {
    const imgRef = React.useRef<HTMLImageElement | null>(null);

    const [hasFailed, setHasFailed] = React.useState(false);
    const [prevSrc, setPrevSrc] = React.useState(src);

    const dimensionsCache = useDimensionCacheContext();
    const [dimensions, setDimensions] = React.useState<Dimensions | null>(() =>
        dimensionsCache.readCached(src)
    );

    if (!Object.is(src, prevSrc)) {
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
                current?.w === w && current.h === h ? current : next
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

    const canRenderImage = !!src && !hasFailed;
    const displayDimensions = resolveDisplayDimensions(dimensions);

    return (
        <div
            {...rest}
            className={cn("relative w-full break-inside-avoid", className)}
            style={{
                ...style,
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

interface NoteContentPreviewProps {
    contentHtml: string | null;
}

export function NoteContentPreview({
    contentHtml,
}: NoteContentPreviewProps): React.ReactElement {
    return (
        <div className="mask-b-from-[calc(100%-var(--fade-size))] size-full max-h-60 select-none p-4 [--fade-size:2rem]">
            <Streamdown className="text-[11px] text-foreground" mode="static">
                {contentHtml ?? "Tap to start writing in this note"}
            </Streamdown>
        </div>
    );
}

interface NoteExcerptPreviewProps {
    excerpt: string;
}

export function NoteExcerptPreview({
    excerpt,
}: NoteExcerptPreviewProps): React.ReactElement {
    return (
        <div className="relative flex h-auto min-h-56 w-full flex-col justify-between bg-linear-to-br from-note-surface-from via-background to-note-surface-to p-3">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_45%)]" />
            <div className="relative flex flex-1 flex-col gap-2 pt-1.5">
                <p className="whitespace-pre-wrap text-[11px] text-foreground leading-relaxed opacity-90">
                    {excerpt}
                </p>
            </div>
        </div>
    );
}

interface MediaPreviewProps {
    src: string | null;
    videoSrc?: string | null;
}

export function MediaPreview({
    src,
    videoSrc,
}: MediaPreviewProps): React.ReactElement {
    const videoRef = React.useRef<HTMLVideoElement | null>(null);

    const [isHovered, setIsHovered] = React.useState(false);
    const [isSoundEnabled, setIsSoundEnabled] = React.useState(true);

    const [hasVideoFailed, setHasVideoFailed] = React.useState(false);
    const [hasVideoStarted, setHasVideoStarted] = React.useState(false);
    const [prevVideoSrc, setPrevVideoSrc] = React.useState(videoSrc);

    if (!Object.is(videoSrc, prevVideoSrc)) {
        setPrevVideoSrc(videoSrc);
        setHasVideoStarted(false);
        setHasVideoFailed(false);
    }

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

    return (
        <PreviewImage
            onPointerDown={handlePointerDown}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={handlePointerLeave}
            src={src}
        >
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
        </PreviewImage>
    );
}

interface MediaCardPreviewProps
    extends Omit<
        React.ComponentProps<"div">,
        "children" | "onClick" | "onKeyDown" | "onMouseEnter" | "onMouseLeave"
    > {
    isFavorite: boolean;
    isZoomed: boolean;
    item: LibraryItemWithCollections;
    onOpen: () => void;
    onToggleFavorite: () => void;
    onZoomChange: (nextZoomed: boolean) => void;
}

export function MediaCardPreview({
    isFavorite,
    isZoomed,
    item,
    onOpen,
    onToggleFavorite,
    onZoomChange,
    ...props
}: MediaCardPreviewProps): React.ReactElement {
    const { isLastVisited } = useLastVisited();

    const isNote = item.kind === ITEM_KIND_NOTE;
    const hasNoteContent = (item.noteContentText ?? "").trim().length > 0;
    const previewImageUrl = itemPreviewImageUrl(item);
    const previewVideoUrl = itemPreviewVideoUrl(item);

    const [isFavoriteRevealed, setIsFavoriteRevealed] = React.useState(false);
    const favoriteRevealTimeout = useTimeout();

    const handleFavoriteRevealStart = useStableCallback(() => {
        if (isNote) {
            return;
        }
        favoriteRevealTimeout.start(FAVORITE_REVEAL_TIMEOUT_MS, () => {
            setIsFavoriteRevealed(true);
        });
    });

    const handleFavoriteRevealEnd = useStableCallback(() => {
        favoriteRevealTimeout.clear();
        setIsFavoriteRevealed(false);
    });

    const handleOpenClick = useStableCallback(
        (event: React.MouseEvent<HTMLElement>) => {
            event.preventDefault();
            onOpen();
        }
    );

    const handleOpenKeyDown = useStableCallback(
        (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === "Enter") {
                onOpen();
            }
        }
    );

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
                "squircle relative flex flex-col overflow-clip rounded-xl focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                { "bg-muted/90": isNote }
            )}
            onClick={handleOpenClick}
            onKeyDown={handleOpenKeyDown}
            onMouseEnter={handleFavoriteRevealStart}
            onMouseLeave={handleFavoriteRevealEnd}
            role="link"
            tabIndex={0}
        >
            {isNote ? (
                <NoteContentPreview
                    contentHtml={
                        hasNoteContent && item.noteContentHtml
                            ? item.noteContentHtml
                            : null
                    }
                />
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
                    <MediaCardFavoriteButton
                        isFavorite={isFavorite}
                        isRevealed={isFavoriteRevealed}
                        onToggle={onToggleFavorite}
                    />
                </>
            )}
            <div
                aria-hidden
                className="squircle pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/5 ring-inset dark:ring-white/5"
            />
        </div>
    );
}

interface MediaCardFavoriteButtonProps {
    isFavorite: boolean;
    isRevealed: boolean;
    onToggle: () => void;
}

function MediaCardFavoriteButton({
    isFavorite,
    isRevealed,
    onToggle,
}: MediaCardFavoriteButtonProps) {
    const handleClick = useStableCallback((event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
    });

    const handleKeyDown = useStableCallback((event: React.KeyboardEvent) => {
        if (event.key === "Enter") {
            event.stopPropagation();
        }
    });

    return (
        <Button
            aria-label={
                isFavorite ? "Remove from Favorites" : "Add to Favorites"
            }
            aria-pressed={isFavorite}
            className={cn(
                "pointer-events-none absolute top-2 right-2 rounded-xl bg-black/50 text-white opacity-0 transition-opacity ease-out hover:bg-black/60 focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-ring/70",
                { "pointer-events-auto opacity-100": isRevealed }
            )}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            size="icon-sm"
            variant="ghost"
        >
            <Star
                aria-hidden
                className={cn("size-4", isFavorite && "fill-current")}
                focusable="false"
            />
        </Button>
    );
}
