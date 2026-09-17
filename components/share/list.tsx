"use client";

import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useMergedRefs } from "@base-ui/utils/useMergedRefs";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { T } from "gt-next";
import * as React from "react";
import { MasonryItem, MasonryRoot } from "@/components/ui/masonry";
import { Placeholder } from "@/components/ui/placeholder";
import { Skeleton } from "@/components/ui/skeleton";
import { Ticker } from "@/components/ui/ticker";
import {
    createDimensionsCache,
    type Dimensions,
    type DimensionsCache,
    resolveDisplayDimensions,
} from "@/lib/common/dimension";

const SHARE_SKELETON_PLACEHOLDERS = [
    { aspect: "aspect-[3/4]", id: "share-skel-0" },
    { aspect: "aspect-[4/5]", id: "share-skel-1" },
    { aspect: "aspect-square", id: "share-skel-2" },
    { aspect: "aspect-[5/6]", id: "share-skel-3" },
    { aspect: "aspect-[3/4]", id: "share-skel-4" },
    { aspect: "aspect-square", id: "share-skel-5" },
    { aspect: "aspect-[4/5]", id: "share-skel-6" },
    { aspect: "aspect-[3/4]", id: "share-skel-7" },
    { aspect: "aspect-[5/6]", id: "share-skel-8" },
    { aspect: "aspect-[4/5]", id: "share-skel-9" },
    { aspect: "aspect-square", id: "share-skel-10" },
    { aspect: "aspect-[3/4]", id: "share-skel-11" },
    { aspect: "aspect-[5/6]", id: "share-skel-12" },
    { aspect: "aspect-[4/5]", id: "share-skel-13" },
] as const;

const SHARE_SKELETON_BREAKPOINTS = [
    {
        className: "flex gap-4 sm:hidden",
        columns: buildShareSkeletonColumns(2),
        key: "cols-2",
    },
    {
        className: "hidden gap-4 sm:flex md:hidden",
        columns: buildShareSkeletonColumns(3),
        key: "cols-3",
    },
    {
        className: "hidden gap-4 md:flex lg:hidden",
        columns: buildShareSkeletonColumns(4),
        key: "cols-4",
    },
    {
        className: "hidden gap-4 lg:flex xl:hidden",
        columns: buildShareSkeletonColumns(5),
        key: "cols-5",
    },
    {
        className: "hidden gap-4 xl:flex 2xl:hidden",
        columns: buildShareSkeletonColumns(6),
        key: "cols-6",
    },
    {
        className: "hidden gap-4 2xl:flex",
        columns: buildShareSkeletonColumns(7),
        key: "cols-7",
    },
] as const;

type ShareSkeletonPlaceholder = (typeof SHARE_SKELETON_PLACEHOLDERS)[number];

export interface PublicShareGridItem {
    href: string | null;
    id: string;
    kind: "bookmark" | "note";
    noteExcerpt: string | null;
    previewImageUrl: string | null;
    title: string;
}

function buildShareSkeletonColumns(
    columnCount: number
): ShareSkeletonPlaceholder[][] {
    const columns: ShareSkeletonPlaceholder[][] = Array.from(
        { length: columnCount },
        () => []
    );
    for (const [index, placeholder] of SHARE_SKELETON_PLACEHOLDERS.entries()) {
        columns[index % columnCount]?.push(placeholder);
    }
    return columns;
}

export function PublicShareGrid({
    items,
}: {
    items: PublicShareGridItem[];
}): React.ReactElement {
    const [dimensionsCache] = React.useState(createDimensionsCache);

    if (items.length === 0) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/70 border-dashed px-6 py-14 text-center">
                    <p className="max-w-md text-balance text-muted-foreground text-sm">
                        <T>This collection is empty.</T>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <MasonryRoot gap={16} items={items} maxColumnCount={7}>
            {(item) => (
                <MasonryItem key={item.id}>
                    <PublicShareGridCard
                        data={item}
                        dimensionsCache={dimensionsCache}
                    />
                </MasonryItem>
            )}
        </MasonryRoot>
    );
}

export function PublicShareGridSkeleton(): React.ReactElement {
    return (
        <div
            aria-busy="true"
            aria-label="Loading shared collection"
            className="flex flex-col gap-6"
            role="status"
        >
            <div className="flex flex-col items-center gap-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-24" />
            </div>
            {SHARE_SKELETON_BREAKPOINTS.map((breakpoint) => (
                <div className={breakpoint.className} key={breakpoint.key}>
                    <ShareSkeletonColumnStack columns={breakpoint.columns} />
                </div>
            ))}
        </div>
    );
}

interface PublicShareGridCardProps {
    data: PublicShareGridItem;
    dimensionsCache: DimensionsCache;
}

function PublicShareGridCard({
    data,
    dimensionsCache,
}: PublicShareGridCardProps): React.ReactElement {
    const isNote = data.kind === "note";
    const noteExcerpt = data.noteExcerpt ?? "Untitled note";
    const displayTitle = data.title;

    const preview = isNote ? (
        <div className="relative flex h-auto min-h-56 w-full flex-col justify-between bg-linear-to-br from-note-surface-from via-background to-note-surface-to p-3">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_45%)]" />
            <div className="relative flex flex-1 flex-col gap-2 pt-1.5">
                <p className="whitespace-pre-wrap text-[11px] text-foreground leading-relaxed opacity-90">
                    {noteExcerpt}
                </p>
            </div>
        </div>
    ) : (
        <PreviewMedia
            dimensionsCache={dimensionsCache}
            src={data.previewImageUrl}
        />
    );

    const titleElement = isNote ? null : (
        <div className="flex items-center py-1.5 pr-1">
            <span
                className="block w-full min-w-0 truncate text-left text-[11px] text-foreground"
                title={displayTitle}
            >
                <Ticker>{displayTitle}</Ticker>
            </span>
        </div>
    );

    const media = (
        <div className="squircle overflow-clip rounded-xl">{preview}</div>
    );

    return (
        <div className="group relative flex shrink-0 flex-col before:absolute before:-inset-x-2 before:-top-2 before:bottom-0 before:-z-10 before:rounded-xl before:bg-muted/50 before:opacity-0 before:transition-transform hover:before:opacity-100 active:before:scale-x-[0.99] active:before:scale-y-[0.97] active:before:opacity-80!">
            {data.href ? (
                <a
                    className="flex flex-col focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    href={data.href}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                >
                    {media}
                    {titleElement}
                </a>
            ) : (
                <div className="flex flex-col">
                    {media}
                    {titleElement}
                </div>
            )}
        </div>
    );
}

interface PreviewMediaProps extends Omit<React.ComponentProps<"img">, "src"> {
    dimensionsCache: DimensionsCache;
    src: string | null;
}

function PreviewMedia({
    className,
    dimensionsCache,
    src,
    ref,
    ...props
}: PreviewMediaProps): React.ReactElement {
    const imgRef = React.useRef<HTMLImageElement | null>(null);
    const mergedRef = useMergedRefs(ref, imgRef);

    const [didFail, setDidFail] = React.useState(false);
    const [dimensions, setDimensions] = React.useState<Dimensions | null>(() =>
        dimensionsCache.readCachedDimensions(src)
    );
    const [prevSrc, setPrevSrc] = React.useState(src);

    if (!Object.is(src, prevSrc)) {
        setPrevSrc(src);
        setDidFail(false);
        setDimensions(dimensionsCache.readCachedDimensions(src));
    }

    const canRenderImage = !!src && !didFail;
    const displayDimensions = resolveDisplayDimensions(dimensions);

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

    const handleError = useStableCallback(
        (event: React.SyntheticEvent<HTMLImageElement>) => {
            if (!src || event.currentTarget.getAttribute("src") !== src) {
                return;
            }
            setDimensions(dimensionsCache.pinDefaultDimensionsIfMissing(src));
            setDidFail(true);
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

    return (
        <div
            className="relative w-full break-inside-avoid"
            style={{
                aspectRatio: `${displayDimensions.w} / ${displayDimensions.h}`,
            }}
        >
            {canRenderImage ? (
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: resource load/error lifecycle is not user interaction; upstream jsx-a11y exempts img onError/onLoad
                <img
                    {...props}
                    alt=""
                    className={cn("size-full object-cover", className)}
                    decoding="async"
                    draggable="false"
                    fetchPriority="auto"
                    height={displayDimensions.h}
                    key={src}
                    loading="lazy"
                    onError={handleError}
                    onLoad={handleLoad}
                    ref={mergedRef}
                    src={src ?? undefined}
                    width={displayDimensions.w}
                />
            ) : (
                <Placeholder className="size-full" />
            )}
        </div>
    );
}

function ShareSkeletonColumnStack({
    columns,
}: {
    columns: readonly ShareSkeletonPlaceholder[][];
}): React.ReactElement {
    return (
        <>
            {columns.map((column) => (
                <div
                    className="flex min-w-0 flex-1 flex-col gap-4"
                    key={column[0]?.id ?? "share-skel-col"}
                >
                    {column.map((placeholder) => (
                        <div className="bg-card/40" key={placeholder.id}>
                            <Skeleton
                                className={cn(
                                    "squircle w-full rounded-xl",
                                    placeholder.aspect
                                )}
                            />
                            <Skeleton className="mt-2 h-3 w-[92%]" />
                        </div>
                    ))}
                </div>
            ))}
        </>
    );
}
