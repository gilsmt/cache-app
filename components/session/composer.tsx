"use client";

import type {
    AutocompleteRootChangeEventDetails,
    BaseUIEvent,
} from "@base-ui/react";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import type { FileUIPart } from "ai";
import { cn } from "cn";
import { useGT } from "gt-next";
import {
    ArrowUp,
    Check,
    CopyIcon,
    Paperclip,
    Square,
    Volume2,
    XIcon,
} from "lucide-react";
import * as React from "react";
import { useCopyToClipboard } from "@/components/hooks/use-copy-to-clipboard";
import { useSpeechSynthesis } from "@/components/hooks/use-speech-synthesis";
import {
    Attachment,
    AttachmentInfo,
    AttachmentPreview,
    AttachmentRemove,
    Attachments,
    getAttachmentLabel,
    getMediaCategory,
} from "@/components/ui/attachments";
import {
    Autocomplete,
    AutocompleteInput,
    AutocompleteInputGroup,
} from "@/components/ui/autocomplete";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import {
    Popover,
    PopoverPopup,
    PopoverTitle,
    PopoverTrigger,
} from "@/components/ui/popover";
import { blobToDataURL } from "@/lib/common/blob";
import type { FileAttachment } from "@/lib/common/file";
import { createLogger } from "@/lib/common/logs/console/logger";
import { AI_INPUT_MAX_LENGTH } from "@/lib/session/ai/constants";
import {
    THREAD_ATTACHMENT_ACCEPT,
    THREAD_ATTACHMENT_MAX_COUNT,
    THREAD_ATTACHMENT_MAX_SIZE_BYTES,
} from "@/lib/threads/attachments";

const log = createLogger("Composer");
const ATTACHMENT_MEDIA_TYPES = new Set(THREAD_ATTACHMENT_ACCEPT.split(","));

const MARKDOWN_CODE_FENCE_PATTERN = /```[\s\S]*?(?:```|$)/gu;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\([^)]*\)/gu;
const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\([^)]*\)/gu;
const MARKDOWN_INLINE_CODE_PATTERN = /`([^`]*)`/gu;
const MARKDOWN_BARE_URL_PATTERN = /https?:\/\/\S+/gu;
const MARKDOWN_HTML_TAG_PATTERN = /<[^>]*>/gu;
const MARKDOWN_HEADING_PATTERN = /^#{1,6}\s+/gmu;
const MARKDOWN_QUOTE_MARKER_PATTERN = /^>[ \t]?/gmu;
const MARKDOWN_LIST_MARKER_PATTERN = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gmu;
const MARKDOWN_TABLE_ROW_PATTERN = /^[ \t]*\|?[ \t:|-]+\|?[ \t]*$/gmu;
const MARKDOWN_TABLE_EDGE_PIPE_PATTERN = /^[ \t]*\||\|[ \t]*$/gmu;
const MARKDOWN_TABLE_PIPE_PATTERN = /\|/gu;
const MARKDOWN_EMPHASIS_PATTERN = /(\*\*|__|\*|~~)(.+?)\1/gu;
const WHITESPACE_COLLAPSE_PATTERN = /\s+/gu;

export interface ComposerAttachment extends FileAttachment {
    id: string;
}

interface DraftAttachment extends FileUIPart {
    id: string;
    sizeBytes: number;
}

interface ComposerContext {
    addAttachments: (files: FileList) => Promise<void>;
    allowAttachments: boolean;
    attachmentError: string | null;
    attachments: DraftAttachment[];
    input: string;
    isBusy: boolean;
    isPreparingFiles: boolean;
    removeAttachment: (id: string) => void;
    setInput: (value: string) => void;
    stop: () => void;
    submit: () => void;
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

function toSpeakableText(markdown: string): string {
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
    allowAttachments?: boolean;
    children: React.ReactNode;
    isBusy: boolean;
    onStop: () => void;
    onSubmit: (text: string, files: FileUIPart[]) => void;
    onValueChange?: (value: string) => void;
    value?: string;
}

export function Composer({
    allowAttachments = false,
    children,
    isBusy,
    onStop,
    onSubmit,
    onValueChange,
    value,
}: ComposerProps) {
    const gt = useGT();
    const [internalValue, setInternalValue] = React.useState("");
    const [attachments, setAttachments] = React.useState<DraftAttachment[]>([]);
    const [attachmentError, setAttachmentError] = React.useState<string | null>(
        null
    );
    const [isPreparingFiles, setIsPreparingFiles] = React.useState(false);
    const isPreparingFilesRef = React.useRef(false);

    const input = value ?? internalValue;

    const setInput = useStableCallback((next: string) => {
        onValueChange?.(next);
        if (value === undefined) {
            setInternalValue(next);
        }
    });

    const addAttachments = useStableCallback(async (files: FileList) => {
        if (
            !allowAttachments ||
            isBusy ||
            isPreparingFilesRef.current ||
            files.length === 0
        ) {
            return;
        }
        setAttachmentError(null);
        if (attachments.length + files.length > THREAD_ATTACHMENT_MAX_COUNT) {
            setAttachmentError(gt("Attach up to 5 files."));
            return;
        }
        let sizeBytes = 0;
        for (const attachment of attachments) {
            sizeBytes += attachment.sizeBytes;
        }
        for (const file of files) {
            if (
                !ATTACHMENT_MEDIA_TYPES.has(file.type) ||
                file.name.length > 255
            ) {
                setAttachmentError(
                    gt(
                        "Choose a PNG, JPEG, WebP, GIF, PDF, or plain text file with a name under 256 characters."
                    )
                );
                return;
            }
            sizeBytes += file.size;
        }
        if (sizeBytes > THREAD_ATTACHMENT_MAX_SIZE_BYTES) {
            setAttachmentError(gt("Files must total 3 MiB or less."));
            return;
        }
        isPreparingFilesRef.current = true;
        setIsPreparingFiles(true);
        try {
            const next = await Promise.all(
                Array.from(
                    files,
                    async (file): Promise<DraftAttachment> => ({
                        filename: file.name,
                        id: crypto.randomUUID(),
                        mediaType: file.type,
                        sizeBytes: file.size,
                        type: "file",
                        url: await blobToDataURL(file),
                    })
                )
            );
            setAttachments((current) => [...current, ...next]);
        } catch (error) {
            log.error("Failed to read attachments", { error });
            setAttachmentError(
                gt("Could not read these files. Try attaching them again.")
            );
        } finally {
            isPreparingFilesRef.current = false;
            setIsPreparingFiles(false);
        }
    });

    const removeAttachment = useStableCallback((id: string) => {
        setAttachments((current) =>
            current.filter((attachment) => attachment.id !== id)
        );
        setAttachmentError(null);
    });

    const submit = useStableCallback(() => {
        const text = input.trim();
        if (
            (!text && attachments.length === 0) ||
            isBusy ||
            isPreparingFilesRef.current
        ) {
            return;
        }
        onSubmit(
            text,
            attachments.map((attachment) => ({
                filename: attachment.filename,
                mediaType: attachment.mediaType,
                type: attachment.type,
                url: attachment.url,
            }))
        );
        setInput("");
        setAttachments([]);
        setAttachmentError(null);
    });

    const handleSubmit = useStableCallback(
        (event: React.SubmitEvent<HTMLFormElement>) => {
            event.preventDefault();
            submit();
        }
    );

    const contextValue = {
        addAttachments,
        allowAttachments,
        attachmentError,
        attachments,
        input,
        isBusy,
        isPreparingFiles,
        removeAttachment,
        setInput,
        stop: onStop,
        submit,
    };

    return (
        <ComposerContext value={contextValue}>
            <form className="contents" onSubmit={handleSubmit}>
                {children}
            </form>
        </ComposerContext>
    );
}

interface ComposerInputProps
    extends Omit<
        React.ComponentProps<typeof AutocompleteInput>,
        "className" | "render" | "value"
    > {
    children?: React.ReactNode;
    className?: string;
    filteredItems?: React.ComponentProps<typeof Autocomplete>["filteredItems"];
    items?: React.ComponentProps<typeof Autocomplete>["items"];
    onOpenChange?: React.ComponentProps<typeof Autocomplete>["onOpenChange"];
    onValueChange?: React.ComponentProps<typeof Autocomplete>["onValueChange"];
    open?: React.ComponentProps<typeof Autocomplete>["open"];
    openOnInputClick?: React.ComponentProps<
        typeof Autocomplete
    >["openOnInputClick"];
    render: React.ReactElement;
}

export function ComposerInput({
    children,
    className,
    filteredItems,
    items = [],
    maxLength = AI_INPUT_MAX_LENGTH,
    onKeyDown,
    onPaste,
    onOpenChange,
    onValueChange,
    open,
    openOnInputClick,
    ...props
}: ComposerInputProps) {
    const { addAttachments, allowAttachments, input, setInput } =
        useComposerContext();

    const handlePaste = useStableCallback(
        (event: BaseUIEvent<React.ClipboardEvent<HTMLInputElement>>) => {
            onPaste?.(event);
            if (
                event.defaultPrevented ||
                !allowAttachments ||
                event.clipboardData.files.length === 0 ||
                event.clipboardData.getData("text/plain").length > 0
            ) {
                return;
            }
            event.preventDefault();
            addAttachments(event.clipboardData.files);
        }
    );

    const handleKeyDown = useStableCallback(
        (event: BaseUIEvent<React.KeyboardEvent<HTMLInputElement>>) => {
            onKeyDown?.(event);
            if (
                event.currentTarget.tagName === "TEXTAREA" &&
                (event.key === "Home" || event.key === "End")
            ) {
                // Autocomplete moves to the value's edges. Keep native textarea
                // line navigation, selection, and platform-specific modifiers.
                event.preventBaseUIHandler();
            }
        }
    );

    const handleValueChange = useStableCallback(
        (next: string, eventDetails: AutocompleteRootChangeEventDetails) => {
            onValueChange?.(next, eventDetails);
            if (eventDetails.isCanceled) {
                return;
            }
            setInput(next);
        }
    );

    return (
        <Autocomplete
            filteredItems={filteredItems}
            items={items}
            onOpenChange={onOpenChange}
            onValueChange={handleValueChange}
            open={open}
            openOnInputClick={openOnInputClick}
            value={input}
        >
            <AutocompleteInputGroup
                className={cn(
                    "squircle bg-background dark:bg-muted rounded-3xl pt-1.5 pb-2.5 shadow-xs/10",
                    className
                )}
            >
                <AutocompleteInput
                    {...props}
                    className="bg-transparent shadow-none"
                    maxLength={maxLength}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                />
                {children}
                <div
                    aria-hidden
                    className="squircle ring-foreground/10 pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-inset"
                />
            </AutocompleteInputGroup>
        </Autocomplete>
    );
}

export function ComposerSubmitButton() {
    const gt = useGT();
    const { attachments, input, isBusy, isPreparingFiles, stop } =
        useComposerContext();

    return (
        <div className="flex items-center justify-end px-2.5 pt-1">
            {isBusy ? (
                <Button
                    aria-label={gt("Stop generating")}
                    className="rounded-full"
                    onClick={stop}
                    size="icon-sm"
                    type="button"
                >
                    <Square aria-hidden className="size-4 fill-current" />
                </Button>
            ) : (
                <Button
                    aria-label={gt("Send message")}
                    className="rounded-full"
                    disabled={
                        isPreparingFiles ||
                        (!input.trim() && attachments.length === 0)
                    }
                    size="icon-sm"
                    type="submit"
                >
                    <ArrowUp aria-hidden className="size-4.5" />
                </Button>
            )}
        </div>
    );
}

export function ComposerAttachButton() {
    const gt = useGT();
    const { addAttachments, allowAttachments, isBusy, isPreparingFiles } =
        useComposerContext();
    const inputRef = React.useRef<HTMLInputElement>(null);
    const handleOpen = useStableCallback(() => inputRef.current?.click());

    const handleChange = useStableCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            const files = event.currentTarget.files;
            if (files) {
                addAttachments(files);
            }
            event.currentTarget.value = "";
        }
    );

    if (!allowAttachments) {
        return null;
    }

    return (
        <>
            <input
                accept={THREAD_ATTACHMENT_ACCEPT}
                aria-label={gt("Attach files")}
                className="hidden"
                multiple
                onChange={handleChange}
                ref={inputRef}
                type="file"
            />
            <Button
                aria-label={gt("Attach files")}
                className="rounded-full"
                disabled={isBusy || isPreparingFiles}
                isLoading={isPreparingFiles}
                onClick={handleOpen}
                size="icon-sm"
                type="button"
                variant="ghost"
            >
                <Paperclip aria-hidden />
            </Button>
        </>
    );
}

export function ComposerAttachments() {
    const { attachmentError, attachments, removeAttachment } =
        useComposerContext();

    return (
        <>
            {attachments.length > 0 ? (
                <Attachments className="px-3 pt-1 pb-2">
                    {attachments.map((attachment) => (
                        <li key={attachment.id}>
                            <ComposerAttachmentChip
                                attachment={attachment}
                                onRemove={removeAttachment}
                            />
                        </li>
                    ))}
                </Attachments>
            ) : null}
            <ErrorMessage className="px-3 pb-1">{attachmentError}</ErrorMessage>
        </>
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
        <span className="border-border/60 bg-background/90 text-foreground inline-flex max-w-[min(100%,12rem)] items-center gap-0.5 rounded-xl border py-0.5 ps-2 pe-0.5 text-xs font-medium shadow-xs/5">
            <span className="max-w-full min-w-0 truncate">{label}</span>
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
    attachment: FileUIPart & { id: string };
    onRemove?: (id: string) => void;
}

export function ComposerAttachmentChip({
    attachment,
    onRemove,
}: ComposerAttachmentChipProps) {
    const gt = useGT();
    const label = getAttachmentLabel(attachment);
    const mediaCategory = getMediaCategory(attachment);

    const handleRemove = useStableCallback(() => onRemove?.(attachment.id));

    return (
        <Popover>
            <Attachment
                className="border-border/60 bg-background/90 max-w-[min(100%,12rem)] py-0.5 ps-1 pe-0.5 text-xs shadow-xs/5"
                data={attachment}
                onRemove={onRemove ? handleRemove : undefined}
            >
                <PopoverTrigger
                    className="focus-visible:ring-ring flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded outline-none focus-visible:ring-2"
                    type="button"
                >
                    <AttachmentPreview className="size-4 bg-transparent" />
                    <AttachmentInfo />
                </PopoverTrigger>
                <AttachmentRemove
                    label={gt("Remove attachment")}
                    size="icon-xs"
                    type="button"
                >
                    <XIcon className="size-3.5" />
                </AttachmentRemove>
            </Attachment>
            <PopoverPopup align="start" className="max-w-80 p-2">
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
                        <PopoverTitle className="font-semibold">
                            {label}
                        </PopoverTitle>
                        {attachment.mediaType ? (
                            <p className="text-muted-foreground font-mono text-xs">
                                {attachment.mediaType}
                            </p>
                        ) : null}
                    </div>
                </div>
            </PopoverPopup>
        </Popover>
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
                <Check className="text-success size-3.5" />
            ) : (
                <CopyIcon className="text-muted-foreground size-3.5" />
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
        : gt("Read aloud response");

    if (!isSupported) {
        return null;
    }

    return (
        <Button
            aria-pressed={isSpeaking}
            disabled={speakable.length === 0}
            onClick={handleToggle}
            size="icon-xs"
            title={label}
            type="button"
            variant="ghost"
        >
            {isSpeaking ? (
                <Square className="text-foreground size-3.5 fill-current" />
            ) : (
                <Volume2 className="text-muted-foreground size-3.5" />
            )}
        </Button>
    );
}
