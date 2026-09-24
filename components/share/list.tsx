"use client";

import { cn } from "cn";
import { T } from "gt-next";
import type * as React from "react";
import { DimensionCacheProvider } from "@/components/session/dimension-cache";
import { MediaPreview, NoteContentPreview } from "@/components/session/item";
import { MasonryItem, MasonryRoot } from "@/components/ui/masonry";
import { Skeleton } from "@/components/ui/skeleton";
import { Ticker } from "@/components/ui/ticker";

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

type ShareSkeletonPlaceholder = (typeof SHARE_SKELETON_PLACEHOLDERS)[number];

export interface PublicShareGridItem {
    href: string | null;
    id: string;
    kind: "bookmark" | "note";
    noteExcerpt: string | null;
    previewImageUrl: string | null;
    title: string;
}

export function PublicShareGrid({
    items,
}: {
    items: PublicShareGridItem[];
}): React.ReactElement {
    if (items.length === 0) {
        return (
            <div className="flex min-h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/70 border-dashed bg-card/30 px-6 py-14 text-center">
                    <p className="max-w-md text-balance text-muted-foreground text-sm leading-snug">
                        <T>This collection is empty.</T>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <DimensionCacheProvider>
            <div className="contain-layout contain-paint contain-style [overflow-clip-margin:0.5rem]">
                <MasonryRoot gap={16} items={items} maxColumnCount={7}>
                    {(item) => (
                        <MasonryItem key={item.id}>
                            <PublicShareGridCard data={item} />
                        </MasonryItem>
                    )}
                </MasonryRoot>
            </div>
        </DimensionCacheProvider>
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
            <MasonryRoot
                gap={16}
                items={SHARE_SKELETON_PLACEHOLDERS}
                maxColumnCount={7}
            >
                {(placeholder, index) => (
                    <MasonryItem key={placeholder.id}>
                        <ShareSkeletonCell data={placeholder} index={index} />
                    </MasonryItem>
                )}
            </MasonryRoot>
        </div>
    );
}

interface PublicShareGridCardProps {
    data: PublicShareGridItem;
}

function PublicShareGridCard({
    data,
}: PublicShareGridCardProps): React.ReactElement {
    const isNote = data.kind === "note";
    const trimmedExcerpt = data.noteExcerpt?.trim() ?? "";
    const noteContent = trimmedExcerpt.length > 0 ? trimmedExcerpt : data.title;

    const media = (
        <div
            className={cn(
                "squircle relative flex flex-col overflow-clip rounded-xl",
                isNote && "bg-muted/90"
            )}
        >
            {isNote ? (
                <NoteContentPreview contentHtml={noteContent} />
            ) : (
                <MediaPreview src={data.previewImageUrl} />
            )}
            <div
                aria-hidden
                className="squircle pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/5 ring-inset dark:ring-white/5"
            />
        </div>
    );

    const titleElement = (
        <div className="flex items-center py-1.5">
            <span
                className="block w-full min-w-0 truncate text-left text-foreground text-xs"
                title={data.title}
            >
                <Ticker className="pt-px">{data.title}</Ticker>
            </span>
        </div>
    );

    return (
        <div className="group relative flex shrink-0 flex-col ease-out before:absolute before:-inset-x-2 before:-top-2 before:bottom-0 before:-z-10 before:rounded-xl before:bg-muted/50 before:opacity-0 before:transition-transform before:ease-out hover:before:opacity-100 active:before:scale-x-[0.99] active:before:scale-y-[0.98] active:before:opacity-80!">
            {data.href ? (
                <a
                    className="flex flex-col focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

interface ShareSkeletonCellProps {
    data: ShareSkeletonPlaceholder;
    index: number;
}

function ShareSkeletonCell({
    data,
    index,
}: ShareSkeletonCellProps): React.ReactElement {
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
