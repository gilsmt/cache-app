"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import type { FileUIPart, SourceDocumentUIPart } from "ai";
import { cn } from "cn";
import {
    FileTextIcon,
    GlobeIcon,
    ImageIcon,
    Music2Icon,
    PaperclipIcon,
    VideoIcon,
    XIcon,
} from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    PreviewCard,
    PreviewCardPopup,
    PreviewCardTrigger,
} from "@/components/ui/preview-card";

const MEDIA_CATEGORY_ICON_BY_CATEGORY: Record<
    AttachmentMediaCategory,
    typeof ImageIcon
> = {
    audio: Music2Icon,
    document: FileTextIcon,
    image: ImageIcon,
    source: GlobeIcon,
    unknown: PaperclipIcon,
    video: VideoIcon,
};

export type AttachmentData =
    | (FileUIPart & { id: string })
    | (SourceDocumentUIPart & { id: string });

type AttachmentMediaCategory =
    | "image"
    | "video"
    | "audio"
    | "document"
    | "source"
    | "unknown";

interface AttachmentItemContext {
    data: AttachmentData;
    mediaCategory: AttachmentMediaCategory;
    onRemove?: () => void;
}

const AttachmentItemContext = React.createContext<AttachmentItemContext | null>(
    null
);

function useAttachmentItemContext() {
    const context = React.use(AttachmentItemContext);
    if (!context) {
        throw new Error(
            "Attachment components must be used within <Attachment>"
        );
    }
    return context;
}

export function getMediaCategory(
    data: AttachmentData
): AttachmentMediaCategory {
    if (data.type === "source-document") {
        return "source";
    }

    const mediaType = data.mediaType ?? "";

    if (mediaType.startsWith("image/")) {
        return "image";
    }
    if (mediaType.startsWith("video/")) {
        return "video";
    }
    if (mediaType.startsWith("audio/")) {
        return "audio";
    }
    if (mediaType.startsWith("application/") || mediaType.startsWith("text/")) {
        return "document";
    }

    return "unknown";
}

export function getAttachmentLabel(data: AttachmentData): string {
    if (data.type === "source-document") {
        return data.title || data.filename || "Source";
    }

    const category = getMediaCategory(data);
    return data.filename || (category === "image" ? "Image" : "Attachment");
}

function renderAttachmentImage(url: string, filename: string | undefined) {
    return (
        <img
            alt={filename || "Image"}
            className="size-full rounded object-cover"
            decoding="async"
            height={20}
            loading="lazy"
            referrerPolicy="no-referrer"
            src={url}
            width={20}
        />
    );
}

function renderAttachmentIcon(Icon: typeof ImageIcon) {
    return <Icon className="size-3 text-muted-foreground" />;
}

function renderAttachmentPreviewContent(
    data: AttachmentData,
    mediaCategory: AttachmentMediaCategory,
    fallbackIcon: React.ReactNode | undefined
) {
    if (mediaCategory === "image" && data.type === "file" && data.url) {
        return renderAttachmentImage(data.url, data.filename);
    }

    if (mediaCategory === "video" && data.type === "file" && data.url) {
        return (
            <video
                className="size-full object-cover"
                muted
                preload="metadata"
                src={data.url}
            />
        );
    }

    if (fallbackIcon !== undefined) {
        return fallbackIcon;
    }

    return renderAttachmentIcon(MEDIA_CATEGORY_ICON_BY_CATEGORY[mediaCategory]);
}

export const AttachmentPreviewCard: typeof PreviewCard = PreviewCard;

export const AttachmentPreviewCardTrigger: typeof PreviewCardTrigger =
    PreviewCardTrigger;

export function Attachments({
    className,
    ...props
}: React.ComponentProps<"ul">) {
    return (
        <ul
            {...props}
            className={cn("flex flex-wrap items-start gap-2", className)}
            data-slot="attachments"
        />
    );
}

interface AttachmentProps extends React.ComponentProps<"div"> {
    data: AttachmentData;
    onRemove?: () => void;
}

export function Attachment({
    data,
    onRemove,
    className,
    ...props
}: AttachmentProps) {
    const mediaCategory = getMediaCategory(data);
    const contextValue = { data, mediaCategory, onRemove };

    return (
        <AttachmentItemContext value={contextValue}>
            <div
                {...props}
                className={cn(
                    "group relative flex h-8 cursor-pointer select-none items-center gap-1",
                    "rounded-md border border-border px-1.5",
                    "font-medium text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                    className
                )}
                data-slot="attachment"
            />
        </AttachmentItemContext>
    );
}

interface AttachmentPreviewProps extends React.ComponentProps<"div"> {
    fallbackIcon?: React.ReactNode;
}

export function AttachmentPreview({
    fallbackIcon,
    className,
    ...props
}: AttachmentPreviewProps) {
    const { data, mediaCategory } = useAttachmentItemContext();

    return (
        <div
            {...props}
            className={cn(
                "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded bg-background",
                className
            )}
            data-slot="attachment-preview"
        >
            {renderAttachmentPreviewContent(data, mediaCategory, fallbackIcon)}
        </div>
    );
}

interface AttachmentInfoProps extends React.ComponentProps<"div"> {
    shouldShowMediaType?: boolean;
}

export function AttachmentInfo({
    shouldShowMediaType = false,
    className,
    ...props
}: AttachmentInfoProps) {
    const { data } = useAttachmentItemContext();

    const label = getAttachmentLabel(data);

    return (
        <div
            {...props}
            className={cn("min-w-0 flex-1", className)}
            data-slot="attachment-info"
        >
            <span className="block truncate">{label}</span>
            {shouldShowMediaType && data.mediaType ? (
                <span className="block truncate text-muted-foreground text-xs">
                    {data.mediaType}
                </span>
            ) : null}
        </div>
    );
}

interface AttachmentRemoveProps extends React.ComponentProps<typeof Button> {
    label?: string;
}

export function AttachmentRemove({
    label = "Remove",
    size = "icon-xs",
    children,
    ...props
}: AttachmentRemoveProps) {
    const { onRemove } = useAttachmentItemContext();

    const handleClick = useStableCallback((event: React.MouseEvent) => {
        event.stopPropagation();
        onRemove?.();
    });

    if (!onRemove) {
        return null;
    }

    return (
        <Button
            {...props}
            aria-label={label}
            onClick={handleClick}
            size={size}
            variant="ghost"
        >
            {children ?? <XIcon />}
        </Button>
    );
}

export function AttachmentPreviewCardPopup({
    align = "start",
    className,
    ...props
}: React.ComponentProps<typeof PreviewCardPopup>) {
    return (
        <PreviewCardPopup
            {...props}
            align={align}
            className={cn("w-auto p-2", className)}
        />
    );
}
