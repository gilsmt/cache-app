"use client";

import { Tabs } from "@base-ui/react/tabs";
import {
    contains,
    activeElement as getActiveElement,
    getTarget,
} from "@base-ui/utils/shadowDom";
import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useMergedRefs } from "@base-ui/utils/useMergedRefs";
import { useRefWithInit } from "@base-ui/utils/useRefWithInit";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import {
    AriaLiveRegionExtension,
    FocusManagerExtension,
    HistoryAnnounceExtension,
    RovingTabIndexExtension,
} from "@lexical/a11y";
import {
    configExtension,
    defineExtension,
    type InitialEditorStateType,
} from "@lexical/extension";
import { HistoryExtension } from "@lexical/history";
import { $generateNodesFromDOM } from "@lexical/html";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalExtensionComposer } from "@lexical/react/LexicalExtensionComposer";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { useLexicalFocusManagerRef } from "@lexical/react/useLexicalFocusManagerRef";
import { useLexicalIsTextContentEmpty } from "@lexical/react/useLexicalIsTextContentEmpty";
import { useLexicalRovingTabIndexRef } from "@lexical/react/useLexicalRovingTabIndexRef";
import {
    $createHeadingNode,
    $isHeadingNode,
    RichTextExtension,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { Calligraph } from "calligraph";
import { cn } from "cn";
import { T, useGT, Var } from "gt-next";
import {
    $createParagraphNode,
    $getRoot,
    $getSelection,
    $isRangeSelection,
    $isRootNode,
    COMMAND_PRIORITY_LOW,
    type EditorState,
    FORMAT_TEXT_COMMAND,
    type LexicalEditor,
    mergeRegister,
    PASTE_COMMAND,
    type PasteCommandType,
    type RangeSelection,
    SELECTION_CHANGE_COMMAND,
    type SerializedEditorState,
} from "lexical";
import {
    AlertCircleIcon,
    BoldIcon,
    CheckIcon,
    ChevronDownIcon,
    Copy,
    DownloadIcon,
    ExternalLinkIcon,
    FileTextIcon,
    Globe,
    ItalicIcon,
    type LucideIcon,
    MessageCircleIcon,
    PanelRight,
    PlusIcon,
    RotateCcwIcon,
    SquarePen,
    StrikethroughIcon,
    UnderlineIcon,
    XIcon,
} from "lucide-react";
import * as React from "react";
import {
    type ComponentType,
    createContext,
    type ReactNode,
    type SVGProps,
    use,
    useDeferredValue,
    useEffect,
    useRef,
    useState,
    useTransition,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import * as z from "zod";
import {
    type OembedResolution,
    useOembed,
} from "@/components/hooks/queries/use-oembed";
import { type SaveStatus, useAutosave } from "@/components/hooks/use-autosave";
import { useCopyToClipboard } from "@/components/hooks/use-copy-to-clipboard";
import { useLastVisited } from "@/components/hooks/use-last-visited";
import { useItemsStateContext } from "@/components/session/items";
import { Button } from "@/components/ui/button";
import {
    ClaudeIcon,
    CursorIcon,
    GoogleDocsIcon,
    NotionIcon,
    OpenAIIcon,
    V0Icon,
} from "@/components/ui/icons";
import {
    Menu,
    MenuGroup,
    MenuGroupLabel,
    MenuItem,
    MenuPopup,
    MenuSeparator,
    MenuTrigger,
} from "@/components/ui/menu";
import { Placeholder } from "@/components/ui/placeholder";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/auth/client";
import {
    type LibraryItemWithCollections,
    truncateLabel,
} from "@/lib/collections/utils";
import { ITEM_KIND_BOOKMARK } from "@/lib/common/constants";
import { getOwnerDocument, getOwnerWindow } from "@/lib/common/dom";
import { saveFile } from "@/lib/common/file";
import { getSystemControlKey } from "@/lib/common/keyboard";
import { createLogger } from "@/lib/common/logs/console/logger";
import { clamp } from "@/lib/common/number";
import { hasOembedSupport, type Oembed } from "@/lib/common/oembed";
import { isStorageQuotaExceededError } from "@/lib/common/storage";
import { slugify } from "@/lib/common/string";
import {
    isHttpUrl,
    openExternalUrl,
    parseDisplayUrl,
    parseStandaloneUrl,
    parseValidUrl,
} from "@/lib/common/url";
import {
    convertNoteHtmlToMarkdown,
    extractNoteText,
    isNoteSerializedEditorState,
    NOTE_EMPTY_HTML,
    normalizeNoteHtml,
    serializeNoteEditorStateToHtml,
} from "@/lib/integrations/notes/utils";
import { sendNoteToNotion } from "@/lib/integrations/notion/actions";

const ACTIVE_INDEX_STORAGE_KEY = "cache:side:active-index";
const ITEMS_STORAGE_KEY = "cache:side:items";
const OPEN_STORAGE_KEY = "cache:side:open";
const PREVIEW_LOADING_TIMEOUT_MS = 8000;
const QUEUE_LIMIT = 12;
const SIDE_RECENT_ITEMS_LIMIT = 3;

// Restored tabs come from localStorage, so every field is validated at this
// one boundary and bad entries are dropped instead of failing the whole list.
const STORED_SIDE_ENTRY_SCHEMA = z.union([
    z.object({ title: z.string().nullable().catch(null), url: z.string() }),
    z.object({
        id: z.string(),
        note: z.object({
            id: z.string(),
            noteContentHtml: z.string().nullable().catch(null),
            // `z.unknown()` accepts a missing key, so the default keeps the
            // restored note identical to one that was serialized from null.
            noteContentState: z.unknown().default(null),
            noteContentText: z.string().nullable().catch(null),
        }),
        type: z.literal("note"),
    }),
]);

const OEMBED_IFRAME_SANDBOX =
    "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation";
const OEMBED_DIRECT_IFRAME_SANDBOX = `${OEMBED_IFRAME_SANDBOX} allow-same-origin allow-forms allow-modals allow-downloads`;
const OEMBED_IFRAME_ALLOW =
    "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share";
const OEMBED_SRCDOC_CSP =
    "default-src 'none'; img-src https: data:; font-src https: data:; style-src 'unsafe-inline' https:; script-src 'unsafe-inline' https:; connect-src https:; media-src https: data: blob:; frame-src https:; object-src 'none'; form-action 'none';";

const YOUTUBE_IFRAME_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
]);

const INITIAL_FORMAT_STATE: FormatState = {
    blockType: "paragraph",
    bold: false,
    italic: false,
    strikethrough: false,
    underline: false,
};

const NOTE_EDITOR_THEME = {
    heading: {
        h1: "mb-3 mt-0 text-[2rem] font-semibold leading-tight tracking-tight",
        h2: "mb-3 mt-6 text-[1.5rem] font-semibold leading-tight tracking-tight",
        h3: "mb-2 mt-5 text-[1.2rem] font-semibold leading-tight tracking-tight",
    },
    paragraph: "my-0 min-h-[1.75rem] leading-7",
    text: {
        bold: "font-semibold",
        highlight: "rounded-sm bg-amber-200/90 px-0.5",
        italic: "italic",
        strikethrough: "line-through",
        underline: "underline",
    },
};

const NOTE_EDITOR_NAMESPACE = "cache-library-note";
const NOTE_READING_WORDS_PER_MINUTE = 250;
const NOTE_WORD_SEPARATOR = /\s+/;

const NOTE_HISTORY_ANNOUNCE_UNDONE = "Undone";
const NOTE_HISTORY_ANNOUNCE_REDONE = "Redone";

const NOTE_NON_EMPTY_BLOCK_TAG_REGEX =
    /<(h[1-3]|p)>(?!(?:\s|<br\s*\/?>)*<\/\1>)[\s\S]*?<\/\1>/gi;

const NOTE_BLOCK_OPTIONS = [
    {
        ariaLabel: (gt: Translate) => gt("Paragraph"),
        label: (gt: Translate) => gt("Text"),
        value: "paragraph",
    },
    {
        ariaLabel: (gt: Translate) => gt("Heading 1"),
        label: (gt: Translate) => gt("H1"),
        value: "h1",
    },
    {
        ariaLabel: (gt: Translate) => gt("Heading 2"),
        label: (gt: Translate) => gt("H2"),
        value: "h2",
    },
    {
        ariaLabel: (gt: Translate) => gt("Heading 3"),
        label: (gt: Translate) => gt("H3"),
        value: "h3",
    },
] satisfies ReadonlyArray<{
    ariaLabel: (gt: Translate) => string;
    label: (gt: Translate) => string;
    value: NoteBlockType;
}>;

const NOTE_TEXT_FORMAT_OPTIONS = [
    {
        ariaLabel: (gt: Translate) => gt("Bold"),
        format: "bold",
        icon: BoldIcon,
    },
    {
        ariaLabel: (gt: Translate) => gt("Italic"),
        format: "italic",
        icon: ItalicIcon,
    },
    {
        ariaLabel: (gt: Translate) => gt("Underline"),
        format: "underline",
        icon: UnderlineIcon,
    },
    {
        ariaLabel: (gt: Translate) => gt("Strikethrough"),
        format: "strikethrough",
        icon: StrikethroughIcon,
    },
] satisfies ReadonlyArray<{
    ariaLabel: (gt: Translate) => string;
    format: NoteInlineFormat;
    icon: LucideIcon;
}>;

const EXPORT_CONTENT_PROVIDERS: readonly ExportContentProvider[] = [
    {
        createUrl: (plainText) =>
            `https://chatgpt.com/?${new URLSearchParams({ hints: "search", prompt: plainText })}`,
        getTitle: (gt) => gt("Open in ChatGPT"),
        icon: OpenAIIcon,
        id: "chatgpt",
    },
    {
        createUrl: (plainText) =>
            `https://claude.ai/new?${new URLSearchParams({ q: plainText })}`,
        getTitle: (gt) => gt("Open in Claude"),
        icon: ClaudeIcon,
        id: "claude",
    },
    {
        createUrl: (plainText) =>
            `https://cursor.com/link/prompt?${new URLSearchParams({ text: plainText })}`,
        getTitle: (gt) => gt("Open in Cursor"),
        icon: CursorIcon,
        id: "cursor",
    },
    {
        createUrl: (plainText) =>
            `codex://new?${new URLSearchParams({ prompt: plainText })}`,
        getTitle: (gt) => gt("Open in Codex"),
        icon: OpenAIIcon,
        id: "codex",
    },
    {
        createUrl: (plainText) =>
            `https://t3.chat/new?${new URLSearchParams({ q: plainText })}`,
        getTitle: (gt) => gt("Open in T3 Chat"),
        icon: MessageCircleIcon,
        id: "t3-chat",
    },
    {
        createUrl: (plainText) =>
            `https://v0.app?${new URLSearchParams({ q: plainText })}`,
        getTitle: (gt) => gt("Open in v0"),
        icon: V0Icon,
        id: "v0",
    },
    {
        createUrl: () => "https://docs.new",
        getTitle: (gt) => gt("Open in Google Docs"),
        icon: GoogleDocsIcon,
        id: "google-docs",
    },
];

type IframeStatus = "pending" | "loaded" | "blocked";

type OembedStatus = "blocked" | "loaded" | "loading" | "oembed";

type Translate = ReturnType<typeof useGT>;

interface SideUrlInput {
    title?: string | null;
    url: string;
}

interface SideNote {
    id: string;
    noteContentHtml: string | null;
    noteContentState: unknown;
    noteContentText: string | null;
}

interface SideUrlEntry {
    id: string;
    title: string | null;
    type: "url";
    url: string;
}

interface SideNoteEntry {
    id: string;
    note: SideNote | null;
    type: "note";
}

type SideEntry = SideNoteEntry | SideUrlEntry;

export interface NoteDraft {
    contentHtml: string;
    contentState: SerializedEditorState | null;
}

type NoteSaveHandler = (
    draft: NoteDraft,
    noteId: string | null
) => Promise<LibraryItemWithCollections | null>;

interface SideQueueState {
    activeIndex: number;
    items: SideEntry[];
}

interface SideStorageKeys {
    activeIndex: string;
    items: string;
}

interface SideContext {
    onSaveNote: NoteSaveHandler;
    onUrlPaste: (url: string) => Promise<void> | void;
}

interface FormatState {
    blockType: NoteBlockType;
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
}

interface NoteTextMetrics {
    characterCount: number;
    paragraphCount: number;
    plainText: string;
    readMinuteCount: number;
    wordCount: number;
}

interface NoteContext {
    contentEditableRef: React.RefObject<HTMLDivElement | null>;
    contentHtml: string;
    editorKey: number;
    initialDraft: NoteDraft;
    isDirty: boolean;
    onDraftChange: (draft: NoteDraft) => void;
    onUrlPaste: (url: string) => Promise<void> | void;
    saveStatus: SaveStatus;
    shouldCreateBookmarkFromUrlPaste: () => boolean;
    textMetrics: NoteTextMetrics;
}

interface ExportContentProvider {
    createUrl: (plainText: string) => string;
    getTitle: (gt: Translate) => string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    id: string;
}

type NoteBlockType = "h1" | "h2" | "h3" | "paragraph";

type NoteInlineFormat = Exclude<keyof FormatState, "blockType">;

const log = createLogger("library:side");

const NOTE_EDITOR_EXTENSION = defineExtension({
    dependencies: [
        RichTextExtension,
        HistoryExtension,
        configExtension(AriaLiveRegionExtension, {
            owner: null,
            politeness: "polite",
        }),
        configExtension(HistoryAnnounceExtension, {
            redone: NOTE_HISTORY_ANNOUNCE_REDONE,
            undone: NOTE_HISTORY_ANNOUNCE_UNDONE,
        }),
        RovingTabIndexExtension,
        FocusManagerExtension,
    ],
    name: NOTE_EDITOR_NAMESPACE,
    namespace: NOTE_EDITOR_NAMESPACE,
    onError(error: Error) {
        log.error("Unexpected note editor error", error);
    },
    theme: NOTE_EDITOR_THEME,
});

const SideContext = createContext<SideContext | null>(null);

function useSideContext(): SideContext {
    const context = use(SideContext);
    if (!context) {
        throw new Error("Side components must be used inside <SideRoot>.");
    }
    return context;
}

const NoteContext = createContext<NoteContext | null>(null);

function useNoteContext(): NoteContext {
    const context = use(NoteContext);
    if (!context) {
        throw new Error(
            "Side note components must be rendered inside a note tab."
        );
    }
    return context;
}

function useSideStatus(url: string | null) {
    const oembedUrl = url !== null && hasOembedSupport(url) ? url : null;
    const { data, error, mutate } = useOembed(oembedUrl);

    const timeout = useTimeout();
    const statusCacheRef = useRefWithInit(
        () => new Map<string, IframeStatus>()
    ).current;
    const [iframeStatus, setIframeStatus] = React.useState<IframeStatus>(() =>
        url ? (statusCacheRef.get(url) ?? "pending") : "pending"
    );
    const [attempt, setAttempt] = useState(0);

    const oembed = data?.resolution === "found" ? data.oembed : null;
    const status = parseOembedStatus(url, data, iframeStatus);

    const markAsBlocked = useStableCallback(() => {
        setIframeStatus((current) =>
            current === "pending" ? "blocked" : current
        );
    });

    const markAsLoaded = useStableCallback(() => {
        setIframeStatus((current) =>
            current === "pending" ? "loaded" : current
        );
    });

    const retry = useStableCallback(() => {
        if (url) {
            statusCacheRef.delete(url);
        }
        setIframeStatus("pending");
        setAttempt((current) => current + 1);
        mutate();
    });

    useIsoLayoutEffect(() => {
        setIframeStatus(
            url ? (statusCacheRef.get(url) ?? "pending") : "pending"
        );
        setAttempt(0);
    }, [url]);

    React.useEffect(() => {
        if (url && (iframeStatus === "loaded" || iframeStatus === "blocked")) {
            statusCacheRef.set(url, iframeStatus);
        }
    }, [url, iframeStatus, statusCacheRef]);

    // An oEmbed hit stops the iframe, so the timeout only guards the direct
    // iframe path. It restarts on `url` so a newly opened tab gets the full
    // deadline even when the previous tab is still "loading".
    React.useEffect(() => {
        if (url === null || status !== "loading") {
            timeout.clear();
            return;
        }
        timeout.start(PREVIEW_LOADING_TIMEOUT_MS, markAsBlocked);
        return () => {
            timeout.clear();
        };
    }, [markAsBlocked, status, timeout, url]);

    React.useEffect(() => {
        if (status !== "blocked" || url === null || !isHttpUrl(url)) {
            return;
        }
        log.warn("Side preview did not load; showing fallback.", {
            cause: error ? "oembed-request" : "iframe-load",
            host: parseDisplayUrl(url),
        });
    }, [error, status, url]);

    return { attempt, markAsBlocked, markAsLoaded, oembed, retry, status };
}

function parseOembedStatus(
    url: string | null,
    data: OembedResolution | undefined,
    iframeStatus: IframeStatus
): OembedStatus {
    if (!isHttpUrl(url)) {
        return "blocked";
    }

    if (data?.resolution === "found") {
        return "oembed";
    }

    if (iframeStatus === "blocked") {
        return "blocked";
    }

    if (iframeStatus === "loaded") {
        return "loaded";
    }

    return "loading";
}

function addSideQueueEntry(
    items: SideEntry[],
    entry: SideEntry
): SideQueueState {
    const existingIndex = items.findIndex((item) =>
        areSideEntriesSameTab(item, entry)
    );
    const existingEntry = items[existingIndex];

    if (existingEntry) {
        if (areSideEntriesEqual(existingEntry, entry)) {
            return { activeIndex: existingIndex, items };
        }
        const nextEntry =
            existingEntry.type === "note" && entry.type === "note"
                ? { ...entry, id: existingEntry.id }
                : entry;

        return {
            activeIndex: existingIndex,
            items: items.map((item, i) =>
                i === existingIndex ? nextEntry : item
            ),
        };
    }

    const nextItems = [...items, entry].slice(-QUEUE_LIMIT);

    return { activeIndex: nextItems.length - 1, items: nextItems };
}

function areSideEntriesSameTab(left: SideEntry, right: SideEntry): boolean {
    if (left.type !== right.type) {
        return false;
    }
    if (left.type === "note" && right.type === "note") {
        // A saved note keeps its draft tab id so the mounted editor survives
        // the save. Compare note ids to still find that tab by the note it
        // now points at; `left.id` alone would open a duplicate tab.
        if (left.note !== null && right.note !== null) {
            return left.note.id === right.note.id;
        }
        return left.id === right.id;
    }
    return left.id === right.id;
}

function areSideEntriesEqual(left: SideEntry, right: SideEntry): boolean {
    if (left.type !== right.type || left.id !== right.id) {
        return false;
    }
    if (left.type === "url" && right.type === "url") {
        return left.title === right.title && left.url === right.url;
    }
    if (left.type === "note" && right.type === "note") {
        return areSideNotesEqual(left.note, right.note);
    }
    return false;
}

function areSideNotesEqual(
    left: SideNote | null,
    right: SideNote | null
): boolean {
    if (left === null || right === null) {
        return left === right;
    }

    return (
        left.id === right.id &&
        left.noteContentHtml === right.noteContentHtml &&
        left.noteContentText === right.noteContentText &&
        JSON.stringify(left.noteContentState) ===
            JSON.stringify(right.noteContentState)
    );
}

function createSideUrlEntry(input: SideUrlInput): SideUrlEntry {
    return {
        id: `url:${input.url}`,
        title: input.title ?? null,
        type: "url",
        url: input.url,
    };
}

function useRecentSideItems(): LibraryItemWithCollections[] {
    const { items } = useItemsStateContext();
    const { lastVisitedItemIds } = useLastVisited();
    const itemsById = new Map(items.map((item) => [item.id, item]));

    return lastVisitedItemIds
        .map((itemId) => itemsById.get(itemId))
        .filter(
            (item): item is LibraryItemWithCollections =>
                item?.kind === ITEM_KIND_BOOKMARK
        )
        .slice(0, SIDE_RECENT_ITEMS_LIMIT);
}

function getRecentItemCaption(item: LibraryItemWithCollections): string | null {
    return item.caption?.trim() || null;
}

function createSideNoteEntry(note: SideNote | null): SideNoteEntry {
    return {
        id: note?.id ?? `new-note:${crypto.randomUUID()}`,
        note,
        type: "note",
    };
}

function deserializeSideItems(value: string): SideEntry[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        log.warn("Failed to restore side tabs from storage.");
        return [];
    }

    if (!Array.isArray(parsed)) {
        return [];
    }

    return parsed.flatMap((rawItem): SideEntry[] => {
        const item = STORED_SIDE_ENTRY_SCHEMA.safeParse(rawItem);
        if (!item.success) {
            return [];
        }

        if ("url" in item.data) {
            return [createSideUrlEntry(item.data)];
        }

        return [{ ...item.data, type: "note" }];
    });
}

function isSideEntryPersisted(entry: SideEntry): boolean {
    return entry.type === "url" || entry.note !== null;
}

function getPersistedActiveIndex(
    items: SideEntry[],
    activeIndex: number
): number {
    const safeIndex = clampActiveIndex(activeIndex, items.length);
    const serializedPosition = items
        .slice(0, safeIndex)
        .filter(isSideEntryPersisted).length;
    const serializedLength = items.filter(isSideEntryPersisted).length;
    return clampActiveIndex(serializedPosition, serializedLength);
}

function serializeSideItems(items: SideEntry[]): string {
    return JSON.stringify(items.filter(isSideEntryPersisted));
}

function getSideStorageKeys(userId: string): SideStorageKeys {
    const scopedKey = (baseKey: string) =>
        `${baseKey}:user:${encodeURIComponent(userId)}`;

    return {
        activeIndex: scopedKey(ACTIVE_INDEX_STORAGE_KEY),
        items: scopedKey(ITEMS_STORAGE_KEY),
    };
}

function readSideItemsFromKey(storageKey: string): SideEntry[] {
    try {
        const raw = localStorage.getItem(storageKey);
        return raw === null ? [] : deserializeSideItems(raw);
    } catch (error) {
        log.warn("Failed to read side tabs from storage.", error);
        return [];
    }
}

function readSideActiveIndexFromKey(storageKey: string): number {
    try {
        const parsed: unknown = JSON.parse(
            localStorage.getItem(storageKey) ?? "null"
        );
        return typeof parsed === "number" && !Number.isNaN(parsed) ? parsed : 0;
    } catch (error) {
        log.warn("Failed to read side tab index from storage.", error);
        return 0;
    }
}

function writeSideStorageValue(storageKey: string, value: string): void {
    try {
        localStorage.setItem(storageKey, value);
    } catch (error) {
        log.warn(
            isStorageQuotaExceededError(error)
                ? "Side tabs exceeded local storage quota; keeping the current tabs in memory."
                : "Failed to persist side tabs; keeping the current tabs in memory.",
            error
        );
    }
}

function writeSideItemsForUser(storageKey: string, items: SideEntry[]): void {
    writeSideStorageValue(storageKey, serializeSideItems(items));
}

function writeSideActiveIndexForUser(storageKey: string, index: number): void {
    writeSideStorageValue(storageKey, JSON.stringify(index));
}

function getSideEntryTitle(entry: SideEntry): string | null {
    if (entry.type === "url") {
        return entry.title;
    }

    const firstLine = entry.note?.noteContentText
        ?.split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0);

    return firstLine ?? null;
}

function getSideTabId(entry: SideEntry): string {
    return `side-tab-${entry.type}-${encodeURIComponent(entry.id)}`;
}

function getOembedIframeSrc(oembed: Oembed): string | null {
    const doc = new DOMParser().parseFromString(oembed.html, "text/html");
    const src = doc.querySelector("iframe")?.getAttribute("src");
    const url = src ? parseValidUrl(src) : null;
    return url && isAllowedOembedIframeUrl(url, oembed.provider)
        ? url.href
        : null;
}

function isAllowedOembedIframeUrl(url: URL, provider: string): boolean {
    if (url.protocol !== "https:") {
        return false;
    }
    const hostname = url.hostname.toLowerCase();
    const isPath = (p: string) => url.pathname.startsWith(p);

    switch (provider) {
        case "youtube":
            return YOUTUBE_IFRAME_HOSTS.has(hostname) && isPath("/embed/");
        case "vimeo":
            return hostname === "player.vimeo.com" && isPath("/video/");
        case "spotify":
            return hostname === "open.spotify.com" && isPath("/embed/");
        case "soundcloud":
            return hostname === "w.soundcloud.com";
        case "codepen":
            return hostname === "codepen.io";
        case "codesandbox":
            return hostname === "codesandbox.io";
        case "figma":
            return hostname === "www.figma.com" && url.pathname === "/embed";
        default:
            return false;
    }
}

function buildOembedSrcDocument(html: string): string {
    return `<!doctype html>
<html>
<head>
<base target="_blank">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${OEMBED_SRCDOC_CSP}">
<style>
html,
body {
    align-items: center;
    background: transparent;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    margin: 0;
    min-height: 100%;
    height: 100%;
    width: 100%;
    padding: 0;
}
*,
*::before,
*::after {
    box-sizing: inherit;
}
iframe {
    border: 0;
    max-height: calc(100vh - 24px);
    max-width: 100%;
}
blockquote {
    max-width: 100%;
    height: 100%;
}
</style>
</head>
<body>${html}</body>
</html>`;
}

function clampActiveIndex(index: number, itemsLength: number): number {
    if (itemsLength === 0) {
        return 0;
    }
    return clamp(index, 0, itemsLength - 1);
}

// No explicit type arguments: stan-js constrains the custom actions type to
// `Record<string, (...args: never[]) => void>`, which an inferred object type
// satisfies and a declared interface does not.
const {
    actions: sideStoreActions,
    getState: getSideStoreState,
    useStore: useSideStore,
} = createStore(
    {
        activeIndex: 0,
        isOpen: storage(false, {
            storageKey: OPEN_STORAGE_KEY,
        }),
        items: [] as SideEntry[],
    },
    ({ actions, getState }) => ({
        openWithEntry(entry: SideEntry) {
            const { items } = getState();
            const queue = addSideQueueEntry(items, entry);

            actions.setItems(queue.items);
            actions.setActiveIndex(queue.activeIndex);
            actions.setIsOpen(true);
        },
        removeQueueItem(index: number) {
            const { activeIndex, items } = getState();
            if (index < 0 || index >= items.length) {
                return;
            }
            const nextItems = items.filter((_, i) => i !== index);
            actions.setItems(nextItems);
            // Removing a tab before the active one shifts the active tab
            // left; removing the active tab hands the slot to its follower.
            actions.setActiveIndex(
                clampActiveIndex(
                    activeIndex - (index < activeIndex ? 1 : 0),
                    nextItems.length
                )
            );
        },
        selectQueueIndex(index: number) {
            const { items } = getState();
            if (index < 0 || index >= items.length) {
                return;
            }
            actions.setActiveIndex(index);
        },
        updateNoteEntry(id: string, note: SideNote) {
            const { items } = getState();
            const index = items.findIndex(
                (item) => item.type === "note" && item.id === id
            );
            if (index === -1) {
                return;
            }

            const currentEntry = items[index];
            if (currentEntry?.type !== "note") {
                return;
            }

            const nextEntry: SideNoteEntry = { ...currentEntry, note };
            if (areSideEntriesEqual(currentEntry, nextEntry)) {
                return;
            }

            actions.setItems(
                items.map((item, itemIndex) =>
                    itemIndex === index ? nextEntry : item
                )
            );
        },
    })
);

function useSideUserScopeSync(): void {
    const { data: session, isPending } = useSession();
    const userId = session?.user?.id ?? null;
    const { activeIndex, items } = useSideStore();
    const hydratedUserIdRef = useRef<string | null | undefined>(undefined);

    // Persist after hydration. This effect runs before the hydration effect
    // below so a user switch never writes the previous user's tabs into the
    // next user's storage slot on the switching commit.
    useEffect(() => {
        if (isPending || userId === null) {
            return;
        }
        if (hydratedUserIdRef.current !== userId) {
            return;
        }
        const storageKeys = getSideStorageKeys(userId);
        writeSideItemsForUser(storageKeys.items, items);
        writeSideActiveIndexForUser(
            storageKeys.activeIndex,
            getPersistedActiveIndex(items, activeIndex)
        );
    }, [isPending, userId, items, activeIndex]);

    useEffect(() => {
        if (isPending) {
            return;
        }
        if (hydratedUserIdRef.current === userId) {
            return;
        }
        const previousUserId = hydratedUserIdRef.current;
        hydratedUserIdRef.current = userId;

        if (userId === null) {
            sideStoreActions.setItems([]);
            sideStoreActions.setActiveIndex(0);
            return;
        }

        const storageKeys = getSideStorageKeys(userId);
        const persistedItems = readSideItemsFromKey(storageKeys.items);
        const persistedIndex = clampActiveIndex(
            readSideActiveIndexFromKey(storageKeys.activeIndex),
            persistedItems.length
        );

        // A previous null means the user was logged out, so merge any
        // in-memory tabs like a first hydration. Only a previous user id
        // is a true account switch that must discard in-memory tabs.
        if (previousUserId !== undefined && previousUserId !== null) {
            sideStoreActions.setItems(persistedItems);
            sideStoreActions.setActiveIndex(persistedIndex);
            return;
        }

        const current = getSideStoreState();
        if (current.items.length === 0) {
            sideStoreActions.setItems(persistedItems);
            sideStoreActions.setActiveIndex(persistedIndex);
            return;
        }

        if (persistedItems.length === 0) {
            writeSideItemsForUser(storageKeys.items, current.items);
            writeSideActiveIndexForUser(
                storageKeys.activeIndex,
                getPersistedActiveIndex(current.items, current.activeIndex)
            );
            return;
        }

        let mergedItems = persistedItems;
        let mergedIndex = persistedIndex;
        for (const entry of current.items) {
            const queue = addSideQueueEntry(mergedItems, entry);
            mergedItems = queue.items;
            mergedIndex = queue.activeIndex;
        }
        sideStoreActions.setItems(mergedItems);
        sideStoreActions.setActiveIndex(mergedIndex);
    }, [isPending, userId]);

    useEffect(() => {
        if (isPending || userId === null) {
            return;
        }
        const storageKeys = getSideStorageKeys(userId);
        const handleStorage = (event: StorageEvent) => {
            if (
                event.key !== storageKeys.items &&
                event.key !== storageKeys.activeIndex
            ) {
                return;
            }
            if (hydratedUserIdRef.current !== userId) {
                return;
            }
            const current = getSideStoreState();
            const nextPersistedItems = readSideItemsFromKey(storageKeys.items);
            const persistedIndex = clampActiveIndex(
                readSideActiveIndexFromKey(storageKeys.activeIndex),
                nextPersistedItems.length
            );
            // Persisted tabs never include unsaved new-note drafts, so keep
            // this tab's in-memory drafts appended instead of dropping them.
            const unsavedEntries = current.items.filter(
                (item) => !isSideEntryPersisted(item)
            );
            const nextItems = [...nextPersistedItems, ...unsavedEntries];
            const activeEntry = current.items[current.activeIndex] ?? null;
            let nextIndex = persistedIndex;
            if (activeEntry && !isSideEntryPersisted(activeEntry)) {
                const unsavedIndex = nextItems.findIndex(
                    (item) => item.id === activeEntry.id
                );
                if (unsavedIndex !== -1) {
                    nextIndex = unsavedIndex;
                }
            }
            const haveItemsChanged =
                current.items.length !== nextItems.length ||
                current.items.some((item, itemIndex) => {
                    const nextItem = nextItems[itemIndex];
                    return !(nextItem && areSideEntriesEqual(item, nextItem));
                });
            if (!haveItemsChanged && current.activeIndex === nextIndex) {
                return;
            }
            sideStoreActions.setItems(nextItems);
            sideStoreActions.setActiveIndex(nextIndex);
        };
        window.addEventListener("storage", handleStorage);
        return () => {
            window.removeEventListener("storage", handleStorage);
        };
    }, [isPending, userId]);
}

export function openSide(input: SideUrlInput) {
    sideStoreActions.openWithEntry(createSideUrlEntry(input));
}

export function openSideNote(note: LibraryItemWithCollections | null) {
    sideStoreActions.openWithEntry(
        createSideNoteEntry(note ? toSideNote(note) : null)
    );
}

interface SideRootProps extends React.PropsWithChildren {
    onSaveNote: NoteSaveHandler;
    onUrlPaste: (url: string) => Promise<void> | void;
}

export function SideRoot({ children, onSaveNote, onUrlPaste }: SideRootProps) {
    const contextValue: SideContext = { onSaveNote, onUrlPaste };

    return <SideContext value={contextValue}>{children}</SideContext>;
}

export function SideContent() {
    const gt = useGT();
    const {
        activeIndex,
        isOpen,
        items,
        removeQueueItem,
        selectQueueIndex,
        setIsOpen,
    } = useSideStore();

    useSideUserScopeSync();

    const safeActiveIndex = clampActiveIndex(activeIndex, items.length);
    const activeEntry = items[safeActiveIndex] ?? null;
    const asideRef = useRef<HTMLElement | null>(null);
    const invokerRef = useRef<HTMLElement | null>(null);
    const prevIsOpenRef = useRef(isOpen);
    const noteCloseHandlersRef = useRefWithInit(
        () => new Map<string, () => void | Promise<void>>()
    ).current;

    const registerNoteCloseHandler = useStableCallback(
        (id: string, close: () => void | Promise<void>) => {
            noteCloseHandlersRef.set(id, close);
            return () => {
                if (noteCloseHandlersRef.get(id) === close) {
                    noteCloseHandlersRef.delete(id);
                }
            };
        }
    );

    // react-hotkeys-hook pins the handler it captured on the first render, so
    // it must stay stable. It also matches modifiers exactly and already skips
    // form tags and contenteditable targets, so this only has to toggle.
    const handleToggleShortcut = useStableCallback(() => {
        setIsOpen((prev) => !prev);
    });

    useHotkeys("mod+j, mod+i, mod+alt+b", handleToggleShortcut, {
        description: gt("Open or close preview"),
        preventDefault: true,
    });

    const handleAsideKeyDown = useStableCallback(
        (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
                setIsOpen(false);
            }
        }
    );

    useEffect(() => {
        if (isOpen) {
            return;
        }
        const aside = asideRef.current;
        const doc = getOwnerDocument(aside);
        const ownerWindow = getOwnerWindow(aside);
        const trackInvoker = (target: EventTarget | null) => {
            if (
                target instanceof ownerWindow.HTMLElement &&
                !contains(aside, target)
            ) {
                invokerRef.current = target;
            }
        };
        trackInvoker(getActiveElement(doc));
        const handleFocusIn = (event: FocusEvent) => {
            trackInvoker(getTarget(event));
        };
        doc.addEventListener("focusin", handleFocusIn);
        return () => {
            doc.removeEventListener("focusin", handleFocusIn);
        };
    }, [isOpen]);

    useEffect(() => {
        const prevIsOpen = prevIsOpenRef.current;
        prevIsOpenRef.current = isOpen;
        if (prevIsOpen === isOpen) {
            return;
        }
        const aside = asideRef.current;
        if (!aside) {
            return;
        }
        const doc = getOwnerDocument(aside);
        if (isOpen) {
            // Notes move focus to the editor in SideNotePanel. Only move
            // focus here for URL tabs so Escape on the aside stays reachable
            // and mobile screen readers enter the fixed panel.
            if (activeEntry?.type === "url") {
                const tab = doc.getElementById(getSideTabId(activeEntry));
                if (tab) {
                    tab.focus({ preventScroll: true });
                } else {
                    aside
                        .querySelector<HTMLElement>(
                            '[role="tabpanel"][tabindex="0"]'
                        )
                        ?.focus({ preventScroll: true });
                }
            }
            return;
        }
        const invoker = invokerRef.current;
        invokerRef.current = null;
        const activeElement = getActiveElement(doc);
        if (contains(aside, activeElement)) {
            if (
                invoker?.isConnected &&
                invoker !== doc.body &&
                invoker !== doc.documentElement
            ) {
                invoker.focus({ preventScroll: true });
            } else {
                doc.querySelector<HTMLElement>(
                    '[data-slot="side-toggle"]'
                )?.focus({ preventScroll: true });
            }
        }
    }, [isOpen, activeEntry]);

    const handleRemoveItem = useStableCallback(
        (item: SideEntry, index: number) => {
            if (item.type === "note") {
                const closeNote = noteCloseHandlersRef.get(item.id);
                if (closeNote) {
                    Promise.resolve(closeNote()).catch((error: unknown) => {
                        log.error("Failed to close note tab", {
                            error,
                            tabId: item.id,
                        });
                    });
                }
                return;
            }
            removeQueueItem(index);
        }
    );

    const handleCloseNote = useStableCallback((id: string) => {
        const index = items.findIndex(
            (item) => item.type === "note" && item.id === id
        );
        if (index !== -1) {
            removeQueueItem(index);
        }
    });

    const handleTabValueChange = useStableCallback((value: unknown) => {
        if (typeof value !== "string") {
            return;
        }
        const index = items.findIndex((item) => getSideTabId(item) === value);
        if (index !== -1) {
            selectQueueIndex(index);
        }
    });

    return (
        <>
            <SideToggle />
            <aside
                aria-hidden={!isOpen}
                aria-label={gt("Preview")}
                className={cn(
                    "group/side relative z-50 flex min-h-0 shrink-0 flex-col overflow-hidden border-s bg-background transition-[width,transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                    "fixed inset-y-0 right-0 w-[calc(100%-3rem)] max-w-lg data-[state=collapsed]:translate-x-full",
                    "lg:w-1/2 lg:max-w-full",
                    "lg:sticky lg:top-0 lg:right-auto lg:h-dvh lg:max-h-dvh lg:translate-x-0 lg:data-[state=collapsed]:w-0 lg:data-[state=collapsed]:border-transparent lg:data-[state=collapsed]:opacity-0"
                )}
                data-side="right"
                data-slot="side"
                data-state={isOpen ? "expanded" : "collapsed"}
                inert={!isOpen}
                onKeyDown={handleAsideKeyDown}
                ref={asideRef}
            >
                <Tabs.Root
                    className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
                    onValueChange={handleTabValueChange}
                    value={
                        isOpen && activeEntry ? getSideTabId(activeEntry) : null
                    }
                >
                    <div
                        className={cn(
                            "flex min-w-0 shrink-0 flex-col gap-2 p-2 pr-10",
                            { "p-0": !activeEntry }
                        )}
                    >
                        <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-1">
                            <SideList>
                                {items.map((item, index) => (
                                    <SideListItem
                                        index={index}
                                        isActive={index === safeActiveIndex}
                                        item={item}
                                        key={item.id}
                                        onRemove={handleRemoveItem}
                                    />
                                ))}
                            </SideList>
                            {activeEntry?.type === "url" ? (
                                <SideCopyLinkButton
                                    key={activeEntry.url}
                                    url={activeEntry.url}
                                />
                            ) : null}
                            {activeEntry ? <SideNewTabMenu /> : null}
                        </div>
                    </div>
                    <SidePanel
                        activeEntry={activeEntry}
                        isOpen={isOpen}
                        items={items}
                        onCloseNote={handleCloseNote}
                        onRegisterNoteClose={registerNoteCloseHandler}
                    />
                </Tabs.Root>
            </aside>
        </>
    );
}

interface SidePanelProps {
    activeEntry: SideEntry | null;
    isOpen: boolean;
    items: SideEntry[];
    onCloseNote: (id: string) => void;
    onRegisterNoteClose: (
        id: string,
        close: () => void | Promise<void>
    ) => () => void;
}

function SidePanel({
    activeEntry,
    isOpen,
    items,
    onCloseNote,
    onRegisterNoteClose,
}: SidePanelProps) {
    const visibleActiveEntry = isOpen ? activeEntry : null;
    const { attempt, markAsBlocked, markAsLoaded, oembed, retry, status } =
        useSideStatus(
            visibleActiveEntry?.type === "url" ? visibleActiveEntry.url : null
        );

    const isLoading = status === "loading";

    return (
        <>
            {/* Keep every note session mounted so tab switches preserve editor history. */}
            {items.map((item) => {
                if (item.type === "note") {
                    return (
                        <SideNotePanel
                            entry={item}
                            isActive={
                                isOpen &&
                                activeEntry?.type === "note" &&
                                activeEntry.id === item.id
                            }
                            key={item.id}
                            onClose={onCloseNote}
                            onRegisterClose={onRegisterNoteClose}
                        />
                    );
                }

                const activeUrl =
                    visibleActiveEntry?.type === "url" &&
                    visibleActiveEntry.id === item.id
                        ? visibleActiveEntry
                        : null;

                return (
                    <Tabs.Panel
                        aria-busy={activeUrl !== null && isLoading}
                        className="relative min-h-0 min-w-0 flex-1"
                        keepMounted
                        key={item.id}
                        value={getSideTabId(item)}
                    >
                        {activeUrl ? (
                            <SideUrlPanel
                                attempt={attempt}
                                entry={activeUrl}
                                markAsBlocked={markAsBlocked}
                                markAsLoaded={markAsLoaded}
                                oembed={oembed}
                                onRetry={retry}
                                status={status}
                            />
                        ) : null}
                    </Tabs.Panel>
                );
            })}
            {visibleActiveEntry === null && isOpen ? <SidePanelEmpty /> : null}
        </>
    );
}

interface SideUrlPanelProps {
    attempt: number;
    entry: SideUrlEntry;
    markAsBlocked: () => void;
    markAsLoaded: () => void;
    oembed: Oembed | null;
    onRetry: () => void;
    status: OembedStatus;
}

function SideUrlPanel({
    attempt,
    entry,
    markAsBlocked,
    markAsLoaded,
    oembed,
    onRetry,
    status,
}: SideUrlPanelProps) {
    const gt = useGT();

    const isLoading = status === "loading";
    const isBlocked = status === "blocked";
    const isOembed = status === "oembed";

    return (
        <>
            {isLoading ? <SideLoading /> : null}
            {isBlocked ? (
                <SideBlocked onRetry={onRetry} url={entry.url} />
            ) : null}
            {isOembed && oembed ? <SideOembedPreview oembed={oembed} /> : null}
            {isBlocked || isOembed ? null : (
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: resource load/error lifecycle is not user interaction; upstream jsx-a11y exempts iframe onError/onLoad
                <iframe
                    allow={OEMBED_IFRAME_ALLOW}
                    allowFullScreen
                    className="size-full border-0 bg-background"
                    key={`${entry.url}:${attempt}`}
                    loading="lazy"
                    onError={markAsBlocked}
                    onLoad={markAsLoaded}
                    referrerPolicy="strict-origin-when-cross-origin"
                    sandbox={OEMBED_IFRAME_SANDBOX}
                    src={entry.url}
                    title={gt("Preview of {title}", {
                        title: entry.title ?? gt("Preview"),
                    })}
                />
            )}
        </>
    );
}

function SidePanelEmpty() {
    const recentItems = useRecentSideItems();

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
                <Placeholder className="bg-background">
                    <Globe
                        aria-hidden
                        className="z-20 size-5.5 text-muted-foreground"
                        focusable="false"
                    />
                </Placeholder>
            </div>
            {recentItems.length > 0 ? (
                <section className="shrink-0 border-t p-4">
                    <h2 className="font-medium text-foreground text-sm">
                        <T>Recents</T>
                    </h2>
                    <ul className="mt-2 flex list-none flex-col gap-1">
                        {recentItems.map((item) => (
                            <SideRecentItem item={item} key={item.id} />
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}

interface SideRecentItemProps {
    item: LibraryItemWithCollections;
}

function SideRecentItem({ item }: SideRecentItemProps) {
    const gt = useGT();
    const caption = getRecentItemCaption(item);
    const title = caption ?? item.url;
    const label = caption ?? parseDisplayUrl(item.url);

    const handleOpen = useStableCallback(() => {
        openSide({
            title,
            url: item.url,
        });
    });

    return (
        <li className="list-none">
            <Button
                aria-label={gt("Open {title} in Side", { title })}
                className="w-full justify-start text-left"
                onClick={handleOpen}
                size="sm"
                title={item.url}
                variant="ghost"
            >
                <Globe aria-hidden className="size-3.5" focusable="false" />
                <span className="min-w-0 truncate">{label}</span>
            </Button>
        </li>
    );
}

interface SideOembedPreviewProps {
    oembed: Oembed;
}

function SideOembedPreview({ oembed }: SideOembedPreviewProps) {
    const gt = useGT();
    const src = getOembedIframeSrc(oembed);
    const [hasDirectError, setHasDirectError] = useState(false);

    useIsoLayoutEffect(() => {
        setHasDirectError(false);
    }, [oembed.html, oembed.provider]);

    const handleDirectError = useStableCallback(() => {
        log.warn("Side direct embed failed; falling back to widget document.", {
            provider: oembed.provider,
        });
        setHasDirectError(true);
    });

    const directSrc = hasDirectError ? null : src;

    return (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: resource load/error lifecycle is not user interaction; upstream jsx-a11y exempts iframe onError/onLoad
        <iframe
            allow={directSrc ? OEMBED_IFRAME_ALLOW : undefined}
            allowFullScreen={!!directSrc}
            className="size-full border-0 bg-background"
            key={directSrc ?? oembed.html}
            loading="lazy"
            onError={directSrc ? handleDirectError : undefined}
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox={
                directSrc ? OEMBED_DIRECT_IFRAME_SANDBOX : OEMBED_IFRAME_SANDBOX
            }
            src={directSrc ?? undefined}
            srcDoc={directSrc ? undefined : buildOembedSrcDocument(oembed.html)}
            title={
                oembed.title ??
                gt("{provider} preview", { provider: oembed.provider })
            }
        />
    );
}

interface SideListProps {
    children: ReactNode;
}

function SideList({ children }: SideListProps) {
    const gt = useGT();

    return (
        <ScrollArea className="h-fit min-w-0 flex-1" shouldScrollFade>
            <Tabs.List
                activateOnFocus
                aria-label={gt("Open side tabs")}
                className="flex min-w-full items-center gap-1"
            >
                {children}
            </Tabs.List>
        </ScrollArea>
    );
}

interface SideListItemProps {
    index: number;
    isActive: boolean;
    item: SideEntry;
    onRemove: (item: SideEntry, index: number) => void;
}

function SideListItem({ index, isActive, item, onRemove }: SideListItemProps) {
    const gt = useGT();

    const entryTitle = getSideEntryTitle(item);
    let title: string;
    if (entryTitle !== null) {
        title = truncateLabel(entryTitle);
    } else if (item.type === "note") {
        title = item.note ? gt("Untitled note") : gt("New note");
    } else {
        title = gt("Preview");
    }
    const closeLabel = gt("Close {title}", { title });

    const handleRemove = useStableCallback(() => {
        onRemove(item, index);
    });

    // The tab list moves focus on arrow keys. Keep the close button from
    // handing the caret to another tab when it has focus.
    const handleRemoveKeyDown = useStableCallback(
        (event: React.KeyboardEvent<HTMLButtonElement>) => {
            if (
                event.key === "ArrowLeft" ||
                event.key === "ArrowRight" ||
                event.key === "ArrowUp" ||
                event.key === "ArrowDown" ||
                event.key === "Home" ||
                event.key === "End"
            ) {
                event.stopPropagation();
            }
        }
    );

    return (
        <div
            className={cn(
                "relative flex min-w-24 max-w-48 flex-1 basis-0 items-center rounded-lg",
                isActive ? "bg-secondary" : "hover:bg-accent"
            )}
        >
            <Tabs.Tab
                id={getSideTabId(item)}
                render={
                    <Button
                        className="min-w-0 flex-1 justify-start overflow-hidden px-2"
                        size="sm"
                        title={title}
                        variant="ghost"
                    />
                }
                value={getSideTabId(item)}
            >
                {item.type === "note" ? null : (
                    <Globe aria-hidden className="size-3.5" focusable="false" />
                )}
                <Calligraph className="min-w-0 flex-1 truncate text-left font-medium">
                    {title}
                </Calligraph>
            </Tabs.Tab>
            <Button
                aria-label={closeLabel}
                className="shrink-0"
                onClick={handleRemove}
                onKeyDown={handleRemoveKeyDown}
                size="icon-sm"
                title={closeLabel}
                variant="ghost"
            >
                <XIcon className="size-3.5 shrink-0" />
            </Button>
        </div>
    );
}

interface SideCopyLinkButtonProps {
    url: string;
}

function SideCopyLinkButton({ url }: SideCopyLinkButtonProps) {
    const gt = useGT();
    const { copyToClipboard, isCopied } = useCopyToClipboard();

    const handleCopy = useStableCallback(() => copyToClipboard(url));

    const label = isCopied ? gt("Link copied") : gt("Copy link");

    return (
        <Button
            aria-label={label}
            onClick={handleCopy}
            size="icon-sm"
            title={label}
            variant="ghost"
        >
            {isCopied ? (
                <CheckIcon aria-hidden className="size-4" focusable="false" />
            ) : (
                <Copy aria-hidden className="size-3.5" focusable="false" />
            )}
        </Button>
    );
}

function SideNewTabMenu() {
    const gt = useGT();
    const recentItems = useRecentSideItems();
    const triggerLabel = gt("Open recent tabs");
    const handleCreateNote = useStableCallback(() => openSideNote(null));

    return (
        <Menu>
            <MenuTrigger
                render={
                    <Button
                        aria-label={triggerLabel}
                        size="icon-sm"
                        title={triggerLabel}
                        variant="ghost"
                    />
                }
            >
                <PlusIcon aria-hidden className="size-4.5" focusable="false" />
            </MenuTrigger>
            <MenuPopup align="end" className="w-72">
                <MenuItem onClick={handleCreateNote}>
                    <SquarePen
                        aria-hidden
                        className="size-4 text-muted-foreground"
                        focusable="false"
                    />
                    <T>Add new</T>
                </MenuItem>
                <MenuSeparator />
                <MenuGroup>
                    <MenuGroupLabel>
                        <T>Recents</T>
                    </MenuGroupLabel>
                    {recentItems.length > 0 ? (
                        recentItems.map((item) => (
                            <SideNewTabMenuItem item={item} key={item.id} />
                        ))
                    ) : (
                        <MenuItem disabled>
                            <span className="flex-1 text-muted-foreground">
                                <T>No recent tabs</T>
                            </span>
                        </MenuItem>
                    )}
                </MenuGroup>
            </MenuPopup>
        </Menu>
    );
}

interface SideNewTabMenuItemProps {
    item: LibraryItemWithCollections;
}

function SideNewTabMenuItem({ item }: SideNewTabMenuItemProps) {
    const gt = useGT();
    const caption = getRecentItemCaption(item);
    const title = caption ?? item.url;
    const label = caption ?? parseDisplayUrl(item.url);

    const handleOpen = useStableCallback(() => {
        openSide({
            title,
            url: item.url,
        });
    });

    return (
        <MenuItem onClick={handleOpen} title={item.url}>
            <Globe
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
                focusable="false"
            />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="sr-only">
                {gt("Open {title} in Side", { title })}
            </span>
        </MenuItem>
    );
}

function SideLoading() {
    return (
        <div
            aria-live="polite"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-center"
            role="status"
        >
            <Spinner className="size-5 text-muted-foreground" />
            <div className="space-y-1">
                <p className="font-medium text-foreground text-sm">
                    <T>Loading preview…</T>
                </p>
                <p className="max-w-sm text-balance text-muted-foreground text-sm">
                    <T>Opening the page.</T>
                </p>
            </div>
        </div>
    );
}

interface SideBlockedProps {
    onRetry: () => void;
    url: string;
}

function SideBlocked({ onRetry, url }: SideBlockedProps) {
    return (
        <div
            aria-live="polite"
            className="flex size-full flex-col items-center justify-center gap-4 px-6 text-center"
            role="alert"
        >
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircleIcon className="size-5" />
            </div>
            <div className="space-y-2">
                <p className="font-medium text-base text-foreground">
                    <T>Preview unavailable</T>
                </p>
                <p className="max-w-md text-balance text-muted-foreground text-sm">
                    <T>This site can't be previewed.</T>
                </p>
            </div>
            <div className="flex items-center gap-2">
                <Button onClick={onRetry} size="sm" variant="outline">
                    <RotateCcwIcon className="size-4" />
                    <T>Try again</T>
                </Button>
                <Button
                    nativeButton={false}
                    render={
                        <a
                            href={url}
                            rel="noopener noreferrer"
                            target="_blank"
                        />
                    }
                    size="sm"
                >
                    <ExternalLinkIcon className="size-4" />
                    <T>Open in new tab</T>
                </Button>
            </div>
        </div>
    );
}

function SideToggle() {
    const gt = useGT();
    const { isOpen, setIsOpen } = useSideStore();

    const handleClick = useStableCallback(() => {
        setIsOpen((prev) => !prev);
    });

    const toggleLabel = isOpen ? gt("Close preview") : gt("Open preview");
    const controlKey = getSystemControlKey();
    const toggleShortcut = `${controlKey}J / ${controlKey}I`;
    const toggleTitle = isOpen
        ? gt("Close preview ({shortcut})", { shortcut: toggleShortcut })
        : gt("Open preview ({shortcut})", { shortcut: toggleShortcut });

    return (
        <Button
            aria-label={toggleLabel}
            className={cn("fixed top-2 right-0.5 z-60 lg:right-2", {
                "text-muted-foreground": !isOpen,
            })}
            data-slot="side-toggle"
            onClick={handleClick}
            size="icon-sm"
            title={toggleTitle}
            variant={isOpen ? "secondary" : "ghost"}
        >
            <PanelRight aria-hidden className="size-4" focusable="false" />
        </Button>
    );
}

interface SideNotePanelProps {
    entry: SideNoteEntry;
    isActive: boolean;
    onClose: (id: string) => void;
    onRegisterClose: (
        id: string,
        close: () => void | Promise<void>
    ) => () => void;
}

function SideNotePanel({
    entry,
    isActive,
    onClose,
    onRegisterClose,
}: SideNotePanelProps) {
    const { onSaveNote, onUrlPaste } = useSideContext();

    const handleClose = useStableCallback(() => {
        onClose(entry.id);
    });

    const handleSave = useStableCallback(
        async (draft: NoteDraft, noteId: string | null) => {
            const savedNote = await onSaveNote(draft, noteId);
            if (savedNote) {
                const nextNote = toSideNote(savedNote);
                if (!areSideNotesEqual(entry.note, nextNote)) {
                    sideStoreActions.updateNoteEntry(entry.id, nextNote);
                }
            }
            return savedNote;
        }
    );

    return (
        <Tabs.Panel
            className="relative flex min-h-0 min-w-0 flex-1 flex-col"
            keepMounted
            value={getSideTabId(entry)}
        >
            <NoteRoot
                isActive={isActive}
                note={entry.note}
                onClose={handleClose}
                onRegisterClose={onRegisterClose}
                onSave={handleSave}
                onUrlPaste={onUrlPaste}
                tabId={entry.id}
            >
                <ScrollArea className="min-h-0 min-w-0 flex-1">
                    <div className="w-full min-w-0 p-4 pt-0">
                        <NoteEditor />
                        <NoteFooter />
                    </div>
                </ScrollArea>
            </NoteRoot>
        </Tabs.Panel>
    );
}

function toSideNote(note: LibraryItemWithCollections): SideNote {
    return {
        id: note.id,
        noteContentHtml: note.noteContentHtml,
        noteContentState: note.noteContentState,
        noteContentText: note.noteContentText,
    };
}

function normalizeDraft(draft: NoteDraft): NoteDraft {
    return {
        contentHtml: normalizeNoteHtml(draft.contentHtml),
        contentState: draft.contentState,
    };
}

function noteDraftFromEditorState(
    contentState: SerializedEditorState
): NoteDraft {
    return normalizeDraft({
        contentHtml: serializeNoteEditorStateToHtml(contentState),
        contentState,
    });
}

function noteDraftFromItem(note: SideNote | null): NoteDraft {
    const contentState = isNoteSerializedEditorState(note?.noteContentState)
        ? note.noteContentState
        : null;

    if (contentState) {
        return noteDraftFromEditorState(contentState);
    }

    return normalizeDraft({
        contentHtml: note?.noteContentHtml ?? NOTE_EMPTY_HTML,
        contentState: null,
    });
}

function getNoteTextMetrics(contentHtml: string): NoteTextMetrics {
    const plainText = extractNoteText(contentHtml);
    const matchedBlocks = contentHtml.match(NOTE_NON_EMPTY_BLOCK_TAG_REGEX);
    const wordCount =
        plainText.length === 0
            ? 0
            : plainText.split(NOTE_WORD_SEPARATOR).filter(Boolean).length;
    const paragraphCount =
        plainText.length === 0 ? 0 : Math.max(1, matchedBlocks?.length ?? 0);

    return {
        characterCount: plainText.length,
        paragraphCount,
        plainText,
        readMinuteCount: Math.ceil(wordCount / NOTE_READING_WORDS_PER_MINUTE),
        wordCount,
    };
}

function haveDraftsChanged(left: NoteDraft, right: NoteDraft): boolean {
    return (
        normalizeNoteHtml(left.contentHtml) !==
        normalizeNoteHtml(right.contentHtml)
    );
}

function isDraftEmpty(draft: NoteDraft): boolean {
    return extractNoteText(draft.contentHtml).length === 0;
}

function shouldCloseWithoutSaving(
    currentDraft: NoteDraft,
    initialDraft: NoteDraft,
    hasPersistedNote: boolean
): boolean {
    if (!haveDraftsChanged(currentDraft, initialDraft)) {
        return true;
    }
    return !hasPersistedNote && isDraftEmpty(currentDraft);
}

function getNotionNoteTitle(plainText: string): string {
    for (const line of plainText.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length > 0) {
            return trimmed;
        }
    }
    return "";
}

async function downloadMarkdownFile(
    contentHtml: string,
    plainText: string,
    description: string
) {
    const markdown = convertNoteHtmlToMarkdown(contentHtml);
    const blob = new Blob([markdown], { type: "text/markdown" });
    await saveFile(blob, {
        description,
        extension: "md",
        name: slugify(getNotionNoteTitle(plainText)) || "note",
    });
}

function areFormatStatesEqual(left: FormatState, right: FormatState): boolean {
    return (
        left.blockType === right.blockType &&
        left.bold === right.bold &&
        left.italic === right.italic &&
        left.strikethrough === right.strikethrough &&
        left.underline === right.underline
    );
}

function getSelectionBlockType(selection: RangeSelection): NoteBlockType {
    const anchorNode = selection.anchor.getNode();
    const topLevelNode = $isRootNode(anchorNode)
        ? anchorNode
        : anchorNode.getTopLevelElement();

    if (!(topLevelNode && $isHeadingNode(topLevelNode))) {
        return "paragraph";
    }

    const headingTag = topLevelNode.getTag();
    if (headingTag === "h1" || headingTag === "h2" || headingTag === "h3") {
        return headingTag;
    }
    return "paragraph";
}

function getInitialEditorState(
    initialDraft: NoteDraft
): InitialEditorStateType {
    if (initialDraft.contentState) {
        return JSON.stringify(initialDraft.contentState);
    }

    if (normalizeNoteHtml(initialDraft.contentHtml) === NOTE_EMPTY_HTML) {
        return null;
    }

    return (editor: LexicalEditor) => {
        const dom = new DOMParser().parseFromString(
            initialDraft.contentHtml,
            "text/html"
        );
        const nodes = $generateNodesFromDOM(editor, dom);
        const root = $getRoot();

        root.clear();
        root.append(...nodes);

        if (root.getChildrenSize() === 0) {
            root.append($createParagraphNode());
        }
    };
}

function createNoteSessionExtension(initialDraft: NoteDraft) {
    return defineExtension({
        $initialEditorState: getInitialEditorState(initialDraft),
        dependencies: [NOTE_EDITOR_EXTENSION],
        name: `${NOTE_EDITOR_NAMESPACE}-session`,
        namespace: NOTE_EDITOR_NAMESPACE,
    });
}

interface NoteRootProps {
    children: ReactNode;
    isActive: boolean;
    note: SideNote | null;
    onClose: () => void | Promise<void>;
    onRegisterClose: (
        id: string,
        close: () => void | Promise<void>
    ) => () => void;
    onSave: NoteSaveHandler;
    onUrlPaste: (url: string) => Promise<void> | void;
    tabId: string;
}

function NoteRoot({
    children,
    isActive,
    note,
    onClose,
    onRegisterClose,
    onSave,
    onUrlPaste,
    tabId,
}: NoteRootProps) {
    const [initialDraft, setInitialDraft] = useState<NoteDraft>(() =>
        noteDraftFromItem(note)
    );
    const [draft, setDraft] = useState<NoteDraft>(initialDraft);
    const [editorKey, setEditorKey] = useState(0);
    const isClosingRef = useRef(false);
    const contentEditableRef = useRef<HTMLDivElement | null>(null);

    const initialDraftRef = useRef<NoteDraft>(draft);
    const latestDraftRef = useRef<NoteDraft>(draft);

    const noteId = note?.id ?? null;
    const savedNoteIdRef = useRef<string | null>(noteId);

    const [prevNote, setPrevNote] = useState(note);
    if (!Object.is(note, prevNote)) {
        setPrevNote(note);
        const nextDraft = noteDraftFromItem(note);
        const shouldPreserveLocalDraft =
            noteId !== null &&
            noteId === savedNoteIdRef.current &&
            haveDraftsChanged(
                latestDraftRef.current,
                initialDraftRef.current
            ) &&
            haveDraftsChanged(nextDraft, latestDraftRef.current);

        setInitialDraft(nextDraft);

        if (
            !shouldPreserveLocalDraft &&
            haveDraftsChanged(nextDraft, latestDraftRef.current)
        ) {
            setDraft(nextDraft);
            setEditorKey((key) => key + 1);
        }
    }

    useIsoLayoutEffect(() => {
        savedNoteIdRef.current = noteId;
        initialDraftRef.current = initialDraft;
        latestDraftRef.current = draft;
    }, [noteId, initialDraft, draft]);

    const handleDraftChange = useStableCallback((nextDraft: NoteDraft) => {
        const normalizedDraft = normalizeDraft(nextDraft);
        if (!haveDraftsChanged(normalizedDraft, latestDraftRef.current)) {
            return;
        }
        latestDraftRef.current = normalizedDraft;
        setDraft(normalizedDraft);
    });

    const handleUrlPaste = useStableCallback(async (url: string) => {
        await onUrlPaste(url);
        await onClose();
    });

    const shouldCreateBookmarkFromUrlPaste = useStableCallback(
        () => !savedNoteIdRef.current && isDraftEmpty(latestDraftRef.current)
    );

    const saveLatestDraft = useStableCallback(async () => {
        const draftToSave = latestDraftRef.current;
        if (
            shouldCloseWithoutSaving(
                draftToSave,
                initialDraftRef.current,
                savedNoteIdRef.current !== null
            )
        ) {
            return true;
        }

        const savedNote = await onSave(draftToSave, savedNoteIdRef.current);
        if (!savedNote) {
            return false;
        }

        savedNoteIdRef.current = savedNote.id;
        initialDraftRef.current = draftToSave;
        setInitialDraft(draftToSave);

        return draftToSave.contentHtml;
    });

    const { isDirty, saveImmediately, saveStatus } = useAutosave({
        content: draft.contentHtml,
        onSave: saveLatestDraft,
        savedContent: initialDraft.contentHtml,
    });

    const handleSaveShortcut = useStableCallback((event: KeyboardEvent) => {
        if (
            event.defaultPrevented ||
            !(event.metaKey || event.ctrlKey) ||
            event.key.toLowerCase() !== "s"
        ) {
            return;
        }

        event.preventDefault();
        saveImmediately().catch((error: unknown) => {
            log.error("Unexpected note shortcut save failure", error);
        });
    });

    // The keydown listener lives on the owner document of the editor, so a
    // tab that stays mounted still saves while its editor holds focus.
    useEffect(() => {
        if (!isActive) {
            return;
        }

        const ownerDocument = getOwnerDocument(contentEditableRef.current);
        ownerDocument.addEventListener("keydown", handleSaveShortcut);
        return () => {
            ownerDocument.removeEventListener("keydown", handleSaveShortcut);
        };
    }, [handleSaveShortcut, isActive]);

    // Activating a tab must land the caret in the editor, so the notes panel
    // is the only one that does not move focus to the tab itself.
    useIsoLayoutEffect(() => {
        if (isActive) {
            contentEditableRef.current?.focus({ preventScroll: true });
        }
    }, [isActive]);

    const handleClose = useStableCallback(async () => {
        if (isClosingRef.current) {
            return;
        }

        const currentDraft = latestDraftRef.current;
        const shouldSkipSave = shouldCloseWithoutSaving(
            currentDraft,
            initialDraftRef.current,
            savedNoteIdRef.current !== null
        );

        if (shouldSkipSave) {
            await onClose();
            return;
        }

        isClosingRef.current = true;
        try {
            const isSaved = await saveImmediately();
            if (isSaved) {
                await onClose();
            }
        } finally {
            isClosingRef.current = false;
        }
    });

    // The tab's close button removes this panel, so the registered handler
    // must flush the draft first: only this component owns the save state.
    useIsoLayoutEffect(
        () => onRegisterClose(tabId, handleClose),
        [handleClose, onRegisterClose, tabId]
    );

    const handleCloseShortcut = useStableCallback((event: KeyboardEvent) => {
        if (
            event.defaultPrevented ||
            event.isComposing ||
            !(event.metaKey || event.ctrlKey) ||
            event.key !== "Enter"
        ) {
            return;
        }

        event.preventDefault();
        // Capture the key before it reaches the editor: Lexical binds Enter
        // with any modifiers to split the block, which would insert a
        // paragraph before the tab closes.
        event.stopPropagation();
        handleClose().catch((error: unknown) => {
            log.error("Unexpected note shortcut close failure", error);
        });
    });

    // The keydown listener lives on the owner document of the editor, so the
    // shortcut works from anywhere in an active note tab.
    useEffect(() => {
        if (!isActive) {
            return;
        }

        const ownerDocument = getOwnerDocument(contentEditableRef.current);
        ownerDocument.addEventListener("keydown", handleCloseShortcut, true);
        return () => {
            ownerDocument.removeEventListener(
                "keydown",
                handleCloseShortcut,
                true
            );
        };
    }, [handleCloseShortcut, isActive]);

    const deferredContentHtml = useDeferredValue(draft.contentHtml);
    const textMetrics = getNoteTextMetrics(deferredContentHtml);

    return (
        <NoteContext
            value={{
                contentEditableRef,
                contentHtml: draft.contentHtml,
                editorKey,
                initialDraft,
                isDirty,
                onDraftChange: handleDraftChange,
                onUrlPaste: handleUrlPaste,
                saveStatus,
                shouldCreateBookmarkFromUrlPaste,
                textMetrics,
            }}
        >
            {children}
        </NoteContext>
    );
}

function NoteToolbarControls() {
    const gt = useGT();
    const { contentHtml, textMetrics } = useNoteContext();
    const { plainText } = textMetrics;
    const { copyToClipboard, isCopied } = useCopyToClipboard();

    const [isSendingToNotion, startSendToNotion] = useTransition();
    const [notionStatus, setNotionStatus] = useState<{
        message: string;
        tone: "error" | "success";
    } | null>(null);

    const hasPlainText = plainText.length > 0;

    const handleCopyNote = useStableCallback(() => {
        if (!hasPlainText) {
            return;
        }
        copyToClipboard(plainText);
    });

    const handleExportMarkdown = useStableCallback(() => {
        downloadMarkdownFile(contentHtml, plainText, gt("Markdown file")).catch(
            (error: unknown) => {
                log.error("Unexpected Markdown export failure", error);
            }
        );
    });

    const handleSendToNotion = useStableCallback(() => {
        if (!hasPlainText || isSendingToNotion) {
            return;
        }

        setNotionStatus(null);
        startSendToNotion(async () => {
            const result = await sendNoteToNotion({
                contentHtml,
                title: getNotionNoteTitle(plainText),
            });

            if (result.status === "SUCCESS") {
                setNotionStatus({
                    message: gt("Sent to Notion."),
                    tone: "success",
                });
                openExternalUrl(result.pageUrl);
                return;
            }

            setNotionStatus({
                message: result.message,
                tone: "error",
            });
        });
    });

    return (
        <div className="ms-auto inline-flex items-center justify-end gap-px">
            <NoteSaveStatus />
            <Button
                aria-label={gt("Copy note")}
                disabled={!hasPlainText}
                onClick={handleCopyNote}
                size="icon-sm"
                variant="ghost"
            >
                {isCopied ? (
                    <CheckIcon
                        aria-hidden
                        className="size-3.5"
                        focusable="false"
                    />
                ) : (
                    <Copy aria-hidden className="size-3.5" focusable="false" />
                )}
            </Button>
            <Menu>
                <MenuTrigger
                    render={
                        <Button
                            disabled={!hasPlainText}
                            size="sm"
                            variant="ghost"
                        />
                    }
                >
                    <T>Open in</T>
                    <ChevronDownIcon className="size-3.5 opacity-50" />
                </MenuTrigger>
                <MenuPopup align="start" className="w-60">
                    {EXPORT_CONTENT_PROVIDERS.map((provider) => (
                        <ExportProviderMenuItem
                            hasPlainText={hasPlainText}
                            key={provider.id}
                            plainText={plainText}
                            provider={provider}
                        />
                    ))}
                    <MenuItem
                        disabled={!hasPlainText || isSendingToNotion}
                        onClick={handleSendToNotion}
                    >
                        <NotionIcon className="size-4 text-muted-foreground" />
                        <Calligraph className="flex-1">
                            {isSendingToNotion
                                ? gt("Sending to Notion…")
                                : gt("Send to Notion")}
                        </Calligraph>
                        <ExternalLinkIcon className="size-4 text-muted-foreground" />
                    </MenuItem>
                    {notionStatus ? (
                        <p
                            aria-live={
                                notionStatus.tone === "error"
                                    ? "assertive"
                                    : "polite"
                            }
                            className={cn(
                                "px-2 py-1 text-xs leading-tight",
                                notionStatus.tone === "error"
                                    ? "text-destructive"
                                    : "text-muted-foreground"
                            )}
                            role={
                                notionStatus.tone === "error"
                                    ? "alert"
                                    : "status"
                            }
                        >
                            {notionStatus.message}
                        </p>
                    ) : null}
                    <MenuSeparator />
                    <MenuItem
                        disabled={!hasPlainText}
                        onClick={handleExportMarkdown}
                    >
                        <FileTextIcon className="size-4 text-muted-foreground" />
                        <span className="flex-1">
                            <T>Export to Markdown</T>
                        </span>
                        <DownloadIcon className="size-4 text-muted-foreground" />
                    </MenuItem>
                </MenuPopup>
            </Menu>
        </div>
    );
}

function NoteEditor() {
    const {
        contentEditableRef,
        editorKey,
        initialDraft,
        onDraftChange,
        onUrlPaste,
        shouldCreateBookmarkFromUrlPaste,
    } = useNoteContext();

    const [cachedKey, setCachedKey] = useState(editorKey);
    const [extension, setExtension] = useState(() =>
        createNoteSessionExtension(initialDraft)
    );
    if (cachedKey !== editorKey) {
        setCachedKey(editorKey);
        setExtension(createNoteSessionExtension(initialDraft));
    }

    return (
        <LexicalExtensionComposer contentEditable={null} extension={extension}>
            <ContentPlugin
                contentEditableRef={contentEditableRef}
                onDraftChange={onDraftChange}
                onUrlPaste={onUrlPaste}
                shouldCreateBookmarkFromUrlPaste={
                    shouldCreateBookmarkFromUrlPaste
                }
            />
        </LexicalExtensionComposer>
    );
}

function NoteFooter() {
    const { textMetrics } = useNoteContext();

    const shouldShowReadTime = textMetrics.readMinuteCount >= 2;
    const closeShortcut = `${getSystemControlKey()}+Enter`;

    return (
        <div className="mt-3 flex items-center justify-end gap-4 border-border/60 border-t pt-3 text-muted-foreground text-xs">
            <T>
                <span className="mr-auto">
                    <Var>{closeShortcut}</Var> to close
                </span>
            </T>
            {shouldShowReadTime ? (
                <T>
                    <span>
                        <Var>{textMetrics.readMinuteCount}</Var> minute read
                    </span>
                </T>
            ) : null}
            <T>
                <span>
                    <Var>{textMetrics.wordCount}</Var> words
                </span>
            </T>
            <T>
                <span>
                    <Var>{textMetrics.paragraphCount}</Var> paragraphs
                </span>
            </T>
            <T>
                <span>
                    <Var>{textMetrics.characterCount}</Var> characters
                </span>
            </T>
        </div>
    );
}

function NoteSaveStatus() {
    const gt = useGT();
    const { isDirty, saveStatus } = useNoteContext();

    let message = "";
    let isError = false;

    if (saveStatus === "saving") {
        message = gt("Saving…");
    } else if (saveStatus === "error") {
        message = gt("Not saved");
        isError = true;
    } else if (saveStatus === "saved") {
        message = gt("Saved");
    } else if (isDirty) {
        message = gt("Unsaved");
    }

    if (!message) {
        return null;
    }

    return (
        <Button
            nativeButton={false}
            render={
                <span
                    aria-live="polite"
                    className={cn(
                        isError ? "text-destructive" : "text-muted-foreground"
                    )}
                />
            }
            size="xs"
            variant="ghost"
        >
            <Calligraph>{message}</Calligraph>
        </Button>
    );
}

interface ExportProviderMenuItemProps {
    hasPlainText: boolean;
    plainText: string;
    provider: ExportContentProvider;
}

function ExportProviderMenuItem({
    hasPlainText,
    plainText,
    provider,
}: ExportProviderMenuItemProps) {
    const gt = useGT();

    const ProviderIcon = provider.icon;
    const title = provider.getTitle(gt);
    const href = provider.createUrl(plainText);

    return (
        <MenuItem
            disabled={!hasPlainText}
            render={<a href={href} rel="noopener noreferrer" target="_blank" />}
        >
            <ProviderIcon className="size-4 text-muted-foreground" />
            <span className="flex-1">{title}</span>
            <ExternalLinkIcon className="size-4 text-muted-foreground" />
        </MenuItem>
    );
}

function FormattingToolbarControls() {
    const gt = useGT();
    const [editor] = useLexicalComposerContext();
    const [formats, setFormats] = useState<FormatState>(INITIAL_FORMAT_STATE);

    const rovingTabIndexRef = useLexicalRovingTabIndexRef();
    const focusManagerRef = useLexicalFocusManagerRef();
    const mergedRef = useMergedRefs(rovingTabIndexRef, focusManagerRef);

    const commitFormats = useStableCallback((nextFormats: FormatState) => {
        setFormats((current) =>
            areFormatStatesEqual(current, nextFormats) ? current : nextFormats
        );
    });

    const syncToolbarSelection = useStableCallback(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
            commitFormats(INITIAL_FORMAT_STATE);
            return;
        }

        commitFormats({
            blockType: getSelectionBlockType(selection),
            bold: selection.hasFormat("bold"),
            italic: selection.hasFormat("italic"),
            strikethrough: selection.hasFormat("strikethrough"),
            underline: selection.hasFormat("underline"),
        });
    });

    const updateToolbarState = useStableCallback(() => {
        editor.getEditorState().read(syncToolbarSelection);
    });

    useEffect(() => {
        updateToolbarState();

        return mergeRegister(
            editor.registerUpdateListener(({ editorState }) => {
                editorState.read(syncToolbarSelection);
            }),
            // SELECTION_CHANGE_COMMAND runs before reconciliation in the
            // pending update, so read the pending selection directly.
            // Reading through getEditorState() here would return the last
            // committed selection instead.
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    syncToolbarSelection();
                    return false;
                },
                COMMAND_PRIORITY_LOW
            )
        );
    }, [editor, syncToolbarSelection, updateToolbarState]);

    return (
        <div
            aria-label={gt("Text formatting")}
            aria-orientation="horizontal"
            className="flex min-w-0 flex-wrap items-center justify-start gap-3"
            ref={mergedRef}
            role="toolbar"
        >
            {NOTE_BLOCK_OPTIONS.map((option) => (
                <NoteBlockTypeButton
                    isActive={formats.blockType === option.value}
                    key={option.value}
                    option={option}
                />
            ))}
            {NOTE_TEXT_FORMAT_OPTIONS.map((option) => (
                <NoteInlineFormatButton
                    isActive={formats[option.format]}
                    key={option.format}
                    option={option}
                />
            ))}
        </div>
    );
}

interface NoteBlockTypeButtonProps {
    isActive: boolean;
    option: (typeof NOTE_BLOCK_OPTIONS)[number];
}

function NoteBlockTypeButton({ isActive, option }: NoteBlockTypeButtonProps) {
    const gt = useGT();
    const [editor] = useLexicalComposerContext();

    // Mousedown keeps the editor selection alive; a click would collapse it
    // before the block type command runs.
    const handleMouseDown = useStableCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            editor.update(() => {
                const selection = $getSelection();
                if (!$isRangeSelection(selection)) {
                    return;
                }

                if (option.value === "paragraph") {
                    $setBlocksType(selection, () => $createParagraphNode());
                    return;
                }

                $setBlocksType(selection, () =>
                    $createHeadingNode(option.value)
                );
            });
        }
    );

    return (
        <Button
            aria-label={option.ariaLabel(gt)}
            onMouseDown={handleMouseDown}
            size="xs"
            variant={isActive ? "secondary" : "ghost"}
        >
            {option.label(gt)}
        </Button>
    );
}

interface NoteInlineFormatButtonProps {
    isActive: boolean;
    option: (typeof NOTE_TEXT_FORMAT_OPTIONS)[number];
}

function NoteInlineFormatButton({
    isActive,
    option,
}: NoteInlineFormatButtonProps) {
    const gt = useGT();
    const [editor] = useLexicalComposerContext();
    const Icon = option.icon;

    // Mousedown keeps the editor selection alive; a click would collapse it
    // before the format command runs.
    const handleMouseDown = useStableCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            editor.dispatchCommand(FORMAT_TEXT_COMMAND, option.format);
        }
    );

    return (
        <Button
            aria-label={option.ariaLabel(gt)}
            className={cn(isActive && "bg-accent")}
            onMouseDown={handleMouseDown}
            size="icon-xs"
            variant="ghost"
        >
            <Icon className="size-4" />
        </Button>
    );
}

interface ContentPluginProps {
    contentEditableRef: React.RefObject<HTMLDivElement | null>;
    onDraftChange: (draft: NoteDraft) => void;
    onUrlPaste: (url: string) => Promise<void> | void;
    shouldCreateBookmarkFromUrlPaste: () => boolean;
}

function ContentPlugin({
    contentEditableRef,
    onDraftChange,
    onUrlPaste,
    shouldCreateBookmarkFromUrlPaste,
}: ContentPluginProps) {
    const [editor] = useLexicalComposerContext();

    const handlePaste = useStableCallback((event: PasteCommandType) => {
        if (!shouldCreateBookmarkFromUrlPaste()) {
            return false;
        }

        if (!("clipboardData" in event && event.clipboardData)) {
            return false;
        }

        const pastedText = event.clipboardData.getData("text/plain");
        const parsedUrl = parseStandaloneUrl(pastedText);
        if (!parsedUrl) {
            return false;
        }

        event.preventDefault();
        const pasteResult = onUrlPaste(parsedUrl.href);
        pasteResult?.catch((error: unknown) => {
            log.error("Unexpected note URL paste failure", error);
        });
        return true;
    });

    const handleChange = useStableCallback((editorState: EditorState) => {
        onDraftChange(noteDraftFromEditorState(editorState.toJSON()));
    });

    useEffect(
        () =>
            editor.registerCommand(
                PASTE_COMMAND,
                handlePaste,
                COMMAND_PRIORITY_LOW
            ),
        [editor, handlePaste]
    );

    return (
        <>
            <div className="mt-2 mb-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <FormattingToolbarControls />
                <NoteToolbarControls />
            </div>
            <div className="relative min-h-96 w-full min-w-0 flex-1">
                <ContentEditable
                    className={cn(
                        "prose prose-stone wrap-anywhere h-full min-h-96 w-full min-w-0 max-w-full overflow-y-auto whitespace-pre-wrap text-[15px] leading-7 outline-none",
                        "prose-p:my-0 prose-p:min-h-[1.75rem]",
                        "prose-mark:rounded-sm prose-mark:bg-amber-200/90 prose-mark:px-0.5",
                        "prose-strong:font-semibold prose-em:italic prose-u:underline prose-s:line-through"
                    )}
                    ref={contentEditableRef}
                />
                <NotePlaceholder />
                <OnChangePlugin ignoreSelectionChange onChange={handleChange} />
            </div>
        </>
    );
}

function NotePlaceholder() {
    const [editor] = useLexicalComposerContext();
    const isEmpty = useLexicalIsTextContentEmpty(editor, true);
    const isEditable = useLexicalEditable();

    if (!(isEditable && isEmpty)) {
        return null;
    }

    return (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-0 text-base text-muted-foreground"
        >
            <T>Start writing, or paste a link to add</T>
        </div>
    );
}
