"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T } from "gt-next";
import { Bookmark, ChevronDown, FileText, FolderOpen } from "lucide-react";
import * as React from "react";
import { useItemsStateContext } from "@/components/session/items";
import {
    PreviewCard,
    PreviewCardDescription,
    PreviewCardPopup,
    PreviewCardTitle,
    PreviewCardTrigger,
} from "@/components/ui/preview-card";
import {
    getLibraryItemPrimaryText,
    itemPreviewImageUrl,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { ITEM_KIND_NOTE } from "@/lib/common/constants";
import type { AgentViewPage } from "@/lib/session/tool/composer";

const VIEW_ATTACHMENT_PREVIEW_ITEM_LIMIT = 4;
const VIEW_ATTACHMENT_TRIGGER_PREVIEW_LIMIT = 3;

function getResolvedViewItems(
    items: LibraryItemWithCollections[],
    view: AgentViewPage
): LibraryItemWithCollections[] {
    const itemsById = new Map(items.map((item) => [item.id, item] as const));
    const previewItems: LibraryItemWithCollections[] = [];

    for (const id of view.itemIds) {
        const item = itemsById.get(id);
        if (!item) {
            continue;
        }

        previewItems.push(item);
    }

    return previewItems;
}

interface AssistantViewAttachmentProps {
    view: AgentViewPage;
}

export function AssistantViewAttachment({
    view,
}: AssistantViewAttachmentProps) {
    const { items } = useItemsStateContext();
    const resolvedItems = getResolvedViewItems(items, view);
    const previewItems = resolvedItems.slice(
        0,
        VIEW_ATTACHMENT_PREVIEW_ITEM_LIMIT
    );
    const hasUnloadedItems = resolvedItems.length < view.itemIds.length;

    return (
        <PreviewCard>
            <PreviewCardTrigger
                closeDelay={160}
                delay={350}
                render={
                    <button
                        className="border-border/70 bg-background hover:bg-muted/50 focus-visible:ring-ring flex max-w-full min-w-0 items-center gap-2 rounded-xl border px-2 py-1.5 text-left shadow-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                        type="button"
                    />
                }
            >
                <AssistantViewAttachmentThumbnails items={previewItems} />
                <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">
                        {view.title}
                    </span>
                    <span className="text-muted-foreground block text-[11px]">
                        {view.itemIds.length}
                        {view.truncated ? "+" : ""}{" "}
                        {view.itemIds.length === 1 ? (
                            <T>match</T>
                        ) : (
                            <T>matches</T>
                        )}
                    </span>
                </span>
                <ChevronDown
                    aria-hidden
                    className="text-muted-foreground size-3.5 shrink-0"
                    focusable="false"
                />
            </PreviewCardTrigger>
            <PreviewCardPopup
                align="start"
                className="w-80 p-3"
                positionMethod="fixed"
                side="top"
            >
                <div className="space-y-3">
                    <div className="space-y-1">
                        <PreviewCardTitle className="truncate">
                            {view.title}
                        </PreviewCardTitle>
                        <PreviewCardDescription className="line-clamp-3">
                            {view.explanation}
                        </PreviewCardDescription>
                    </div>
                    {previewItems.length > 0 ? (
                        <>
                            <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto">
                                {previewItems.map((item) => (
                                    <AssistantViewItemPreview
                                        item={item}
                                        key={item.id}
                                    />
                                ))}
                            </div>
                            {hasUnloadedItems ? (
                                <p className="text-muted-foreground text-xs">
                                    <T>
                                        Some matching items are outside the
                                        loaded preview.
                                    </T>
                                </p>
                            ) : null}
                        </>
                    ) : (
                        <p className="text-muted-foreground text-xs">
                            {view.itemIds.length === 0 ? (
                                <T>No matches in this view.</T>
                            ) : (
                                <T>
                                    No matching items are available in the
                                    loaded preview.
                                </T>
                            )}
                        </p>
                    )}
                </div>
            </PreviewCardPopup>
        </PreviewCard>
    );
}

interface AssistantViewAttachmentThumbnailsProps {
    items: LibraryItemWithCollections[];
}

function AssistantViewAttachmentThumbnails({
    items,
}: AssistantViewAttachmentThumbnailsProps) {
    if (items.length === 0) {
        return (
            <span
                aria-hidden="true"
                className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md"
            >
                <FolderOpen className="size-4" focusable="false" />
            </span>
        );
    }

    return (
        <span aria-hidden="true" className="flex shrink-0 -space-x-2 ps-1">
            {items
                .slice(0, VIEW_ATTACHMENT_TRIGGER_PREVIEW_LIMIT)
                .map((item) => (
                    <AssistantViewItemThumbnail
                        className="border-background size-9 rounded-md border-2 shadow-xs"
                        item={item}
                        key={item.id}
                    />
                ))}
        </span>
    );
}

interface AssistantViewItemPreviewProps {
    item: LibraryItemWithCollections;
}

function AssistantViewItemPreview({ item }: AssistantViewItemPreviewProps) {
    return (
        <div className="bg-background min-w-0 overflow-hidden rounded-lg border">
            <AssistantViewItemThumbnail
                className="aspect-[4/3] w-full"
                item={item}
            />
            <p className="line-clamp-2 px-2 py-1.5 text-xs font-medium">
                {getLibraryItemPrimaryText(item)}
            </p>
        </div>
    );
}

interface AssistantViewItemThumbnailProps {
    className: string;
    item: LibraryItemWithCollections;
}

function AssistantViewItemThumbnail({
    className,
    item,
}: AssistantViewItemThumbnailProps) {
    const imageUrl = itemPreviewImageUrl(item);
    const [failedImageUrl, setFailedImageUrl] = React.useState<string | null>(
        null
    );
    const handleError = useStableCallback(
        (event: React.SyntheticEvent<HTMLImageElement>) => {
            setFailedImageUrl(event.currentTarget.getAttribute("src"));
        }
    );

    if (!imageUrl || failedImageUrl === imageUrl) {
        const Icon = item.kind === ITEM_KIND_NOTE ? FileText : Bookmark;

        return (
            <span
                aria-hidden="true"
                className={`bg-muted text-muted-foreground flex items-center justify-center ${className}`}
            >
                <Icon className="size-4" focusable="false" />
            </span>
        );
    }

    return (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Image load errors switch to the fallback preview tile.
        <img
            alt=""
            className={`block object-cover ${className}`}
            decoding="async"
            height={120}
            key={imageUrl}
            loading="lazy"
            onError={handleError}
            referrerPolicy="no-referrer"
            src={imageUrl}
            width={160}
        />
    );
}
