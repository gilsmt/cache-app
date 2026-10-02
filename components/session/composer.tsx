"use client";

import type {
    AutocompleteRootChangeEventDetails,
    BaseUIEvent,
} from "@base-ui/react";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { useGT } from "gt-next";
import { ArrowUp, Check, CopyIcon, Square, Volume2, XIcon } from "lucide-react";
import * as React from "react";
import { useCopyToClipboard } from "@/components/hooks/use-copy-to-clipboard";
import { useSpeechSynthesis } from "@/components/hooks/use-speech-synthesis";
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
import { Button } from "@/components/ui/button";
import { Command, CommandInput } from "@/components/ui/command";
import type { FileAttachment } from "@/lib/common/file";

const MARKDOWN_CODE_FENCE_PATTERN = /```[\s\S]*?(?:```|$)/g;
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
const MARKDOWN_EMPHASIS_PATTERN = /(\*\*|__|\*|~~)(.+?)\1/g;
const WHITESPACE_COLLAPSE_PATTERN = /\s+/g;

interface ComposerContext {
    input: string;
    isBusy: boolean;
    setInput: (value: string) => void;
    stop: () => void;
    submit: () => void;
}

export interface ComposerAttachment extends FileAttachment {
    id: string;
}

const ComposerContext = React.createContext<ComposerContext | null>(null);

export function useComposerContext(): ComposerContext {
    const context = React.use(ComposerContext);
    if (!context) {
        throw new Error(
            "Composer sub-components must be used within Composer."
        );
    }
    return context;
}

interface SubmitKeyEvent {
    altKey: boolean;
    ctrlKey: boolean;
    key: string;
    metaKey: boolean;
    nativeEvent: { isComposing: boolean };
    shiftKey: boolean;
}

export function isSubmitKey(event: SubmitKeyEvent): boolean {
    return (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.nativeEvent.isComposing
    );
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

    // Repeat until stable for nested runs such as ***bold italic***. Each
    // pass removes at least one marker, so the text shrinks to a fixpoint.
    let previous = "";
    while (previous !== text) {
        previous = text;
        text = text.replace(MARKDOWN_EMPHASIS_PATTERN, "$2");
    }

    return text.replace(WHITESPACE_COLLAPSE_PATTERN, " ").trim();
}

interface ComposerProps {
    children: React.ReactNode;
    isBusy: boolean;
    onStop: () => void;
    onSubmit: (text: string) => void;
    onValueChange?: (value: string) => void;
    value?: string;
}

export function Composer({
    children,
    isBusy,
    onStop,
    onSubmit,
    onValueChange,
    value,
}: ComposerProps) {
    const [internalValue, setInternalValue] = React.useState("");

    const input = value ?? internalValue;

    const setInput = useStableCallback((next: string) => {
        onValueChange?.(next);
        if (value === undefined) {
            setInternalValue(next);
        }
    });

    const submit = useStableCallback(() => {
        const text = input.trim();
        if (!text || isBusy) {
            return;
        }
        onSubmit(text);
        setInput("");
    });

    const handleFormSubmit = useStableCallback(
        (event: React.SubmitEvent<HTMLFormElement>) => {
            event.preventDefault();
            submit();
        }
    );

    const contextValue = { input, isBusy, setInput, stop: onStop, submit };

    return (
        <ComposerContext value={contextValue}>
            <form className="contents" onSubmit={handleFormSubmit}>
                {children}
            </form>
        </ComposerContext>
    );
}

const EMPTY_COMPOSER_ITEMS: readonly never[] = [];

interface ComposerInputProps
    extends Omit<
        React.ComponentProps<typeof CommandInput>,
        "className" | "render" | "value"
    > {
    children?: React.ReactNode;
    className?: string;
    filteredItems?: React.ComponentProps<typeof Command>["filteredItems"];
    items?: React.ComponentProps<typeof Command>["items"];
    onOpenChange?: React.ComponentProps<typeof Command>["onOpenChange"];
    onValueChange?: React.ComponentProps<typeof Command>["onValueChange"];
    open?: React.ComponentProps<typeof Command>["open"];
    openOnInputClick?: React.ComponentProps<typeof Command>["openOnInputClick"];
    render: React.ReactElement;
    submitOnEnter?: boolean;
}

export function ComposerInput({
    children,
    className,
    filteredItems,
    items = EMPTY_COMPOSER_ITEMS,
    onKeyDown,
    onOpenChange,
    onValueChange,
    open,
    openOnInputClick,
    render,
    submitOnEnter = false,
    ...props
}: ComposerInputProps) {
    const { input, setInput, submit } = useComposerContext();

    const handleValueChange = useStableCallback(
        (next: string, eventDetails: AutocompleteRootChangeEventDetails) => {
            onValueChange?.(next, eventDetails);
            if (eventDetails.isCanceled) {
                return;
            }
            setInput(next);
        }
    );

    const handleInputKeyDown = useStableCallback(
        (event: BaseUIEvent<React.KeyboardEvent<HTMLInputElement>>) => {
            onKeyDown?.(event);
            if (event.defaultPrevented || !submitOnEnter) {
                return;
            }
            if (!isSubmitKey(event)) {
                return;
            }
            event.preventDefault();
            submit();
        }
    );

    return (
        <div
            className={cn(
                "squircle relative overflow-clip rounded-3xl bg-popover py-2.5 shadow-xs/10 dark:bg-muted",
                className
            )}
        >
            <Command
                filteredItems={filteredItems}
                items={items}
                onOpenChange={onOpenChange}
                onValueChange={handleValueChange}
                open={open}
                openOnInputClick={openOnInputClick}
                value={input}
            >
                <CommandInput
                    {...props}
                    className="px-2"
                    onKeyDown={handleInputKeyDown}
                    render={render}
                />
                {children}
            </Command>
            <div
                aria-hidden
                className="squircle pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/10 ring-inset dark:ring-white/5"
            />
        </div>
    );
}

export function ComposerSubmitButton() {
    const gt = useGT();
    const { input, isBusy, stop } = useComposerContext();

    return (
        <div className="flex items-center justify-end px-2.5 pt-1">
            {isBusy ? (
                <Button
                    aria-label={gt("Stop generating")}
                    className="rounded-full"
                    onClick={stop}
                    size="icon"
                    type="button"
                >
                    <Square aria-hidden className="size-4.5" />
                </Button>
            ) : (
                <Button
                    aria-label={gt("Send message")}
                    className="rounded-full"
                    disabled={!input.trim()}
                    size="icon"
                    type="submit"
                >
                    <ArrowUp aria-hidden className="size-4.5" />
                </Button>
            )}
        </div>
    );
}

interface ComposerChipProps {
    label: string;
    onRemove: () => void;
}

export function ComposerChip({ label, onRemove }: ComposerChipProps) {
    const handleRemove = useStableCallback((event: React.MouseEvent) => {
        event.stopPropagation();
        onRemove();
    });

    return (
        <span className="inline-flex max-w-[min(100%,12rem)] items-center gap-0.5 rounded-xl border border-border/60 bg-background/90 py-0.5 ps-2 pe-0.5 font-medium text-foreground text-xs shadow-xs/5">
            <span className="min-w-0 max-w-full truncate">{label}</span>
            <Button
                aria-label={`Remove ${label}`}
                onClick={handleRemove}
                size="icon-xs"
                type="button"
                variant="ghost"
            >
                <XIcon className="size-3.5" />
            </Button>
        </span>
    );
}

interface ComposerAttachmentChipProps {
    attachment: ComposerAttachment;
    onRemove: (id: string) => void;
}

export function ComposerAttachmentChip({
    attachment,
    onRemove,
}: ComposerAttachmentChipProps) {
    const label = getAttachmentLabel(attachment);
    const mediaCategory = getMediaCategory(attachment);

    const handleRemove = useStableCallback(() => onRemove(attachment.id));

    return (
        <Attachments>
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
                    <AttachmentRemove size="icon-xs">
                        <XIcon className="size-3.5" />
                    </AttachmentRemove>
                </AttachmentPreviewCardTrigger>
                <AttachmentPreviewCardPopup className="max-w-80">
                    <div className="space-y-3">
                        {mediaCategory === "image" && attachment.url ? (
                            <div className="flex max-h-80 w-72 items-center justify-center overflow-clip rounded-md border">
                                <img
                                    alt=""
                                    className="max-h-full max-w-full object-contain"
                                    decoding="async"
                                    draggable="false"
                                    height={320}
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

interface CopyResponseButtonProps {
    value: string;
}

export function CopyResponseButton({ value }: CopyResponseButtonProps) {
    const gt = useGT();
    const { copyToClipboard, isCopied } = useCopyToClipboard();

    const label = isCopied ? gt("Copied") : gt("Copy response");

    const handleCopy = useStableCallback(() => copyToClipboard(value));

    return (
        <Button
            aria-label={label}
            onClick={handleCopy}
            size="icon-xs"
            title={label}
            type="button"
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

interface ReadAloudResponseButtonProps {
    value: string;
}

export function ReadAloudResponseButton({
    value,
}: ReadAloudResponseButtonProps) {
    const gt = useGT();
    const { isSpeaking, isSupported, stop, toggle } = useSpeechSynthesis();

    const speakable = toSpeakableText(value);
    const previousSpeakableRef = React.useRef(speakable);

    React.useEffect(() => {
        if (previousSpeakableRef.current === speakable) {
            return;
        }
        previousSpeakableRef.current = speakable;
        if (isSpeaking) {
            stop();
        }
    }, [isSpeaking, speakable, stop]);

    const handleToggle = useStableCallback(() => toggle(speakable));

    const label = isSpeaking
        ? gt("Stop reading response")
        : gt("Read aloud response ");

    if (!isSupported) {
        return null;
    }

    return (
        <Button
            aria-label={label}
            aria-pressed={isSpeaking}
            disabled={speakable.length === 0}
            onClick={handleToggle}
            size="icon-xs"
            title={label}
            type="button"
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
