"use client";

import type { BaseUIEvent } from "@base-ui/react";
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
    type TextFormatType,
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
import useSWR from "swr";
import { useItemsContext } from "@/components/session/items";
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
import { type SaveStatus, useAutosave } from "@/hooks/use-autosave";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { useLastVisited } from "@/hooks/use-last-visited";
import type { LibraryItemWithCollections } from "@/lib/collections/utils";
import { ITEM_KIND_BOOKMARK } from "@/lib/common/constants";
import { getOwnerDocument, isTextEntryTarget } from "@/lib/common/dom";
import { saveFile } from "@/lib/common/file";
import { getSystemAltKey, getSystemControlKey } from "@/lib/common/keyboard";
import { createLogger } from "@/lib/common/logs/console/logger";
import { clamp } from "@/lib/common/number";
import { isRecord } from "@/lib/common/object";
import {
    hasOembedSupport,
    type Oembed,
    OembedSchema,
} from "@/lib/common/oembed";
import { slugify, truncateLabel } from "@/lib/common/string";
import {
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
    type NoteSerializedEditorState,
    normalizeNoteHtml,
    serializeNoteEditorStateToHtml,
} from "@/lib/integrations/notes/utils";
import { sendNoteToNotion } from "@/lib/integrations/notion/actions";

const SIDE_BLOCKED_URL = "about:blank";
const DEFAULT_TITLE = "Preview";
const DEFAULT_TIMEOUT_MS = 8000;
const ACTIVE_INDEX_STORAGE_KEY = "cache:side:active-index";
const ITEMS_STORAGE_KEY = "cache:side:items";
const OPEN_STORAGE_KEY = "cache:side:open";
const QUEUE_LIMIT = 12;
const SIDE_RECENT_ITEMS_LIMIT = 3;

const OEMBED_IFRAME_SANDBOX =
    "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation";
const OEMBED_DIRECT_IFRAME_SANDBOX = `${OEMBED_IFRAME_SANDBOX} allow-same-origin allow-forms allow-modals allow-downloads`;
const OEMBED_IFRAME_ALLOW =
    "accelerometer; autoplay; clipboard-write; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share";
const SIDE_IFRAME_SANDBOX =
    "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-presentation";
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
    strikeThrough: false,
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
        stateKey: "bold",
    },
    {
        ariaLabel: (gt: Translate) => gt("Italic"),
        format: "italic",
        icon: ItalicIcon,
        stateKey: "italic",
    },
    {
        ariaLabel: (gt: Translate) => gt("Underline"),
        format: "underline",
        icon: UnderlineIcon,
        stateKey: "underline",
    },
    {
        ariaLabel: (gt: Translate) => gt("Strikethrough"),
        format: "strikethrough",
        icon: StrikethroughIcon,
        stateKey: "strikeThrough",
    },
] satisfies ReadonlyArray<{
    ariaLabel: (gt: Translate) => string;
    format: TextFormatType;
    icon: LucideIcon;
    stateKey: NoteInlineFormatStateKey;
}>;

const EXPORT_CONTENT_PROVIDERS: readonly ExportContentProvider[] = [
    {
        createUrl: (query) =>
            `https://chatgpt.com/?${new URLSearchParams({ hints: "search", prompt: query })}`,
        getTitle: (gt) => gt("Open in ChatGPT"),
        icon: OpenAIIcon,
        id: "chatgpt",
    },
    {
        createUrl: (query) =>
            `https://claude.ai/new?${new URLSearchParams({ q: query })}`,
        getTitle: (gt) => gt("Open in Claude"),
        icon: ClaudeIcon,
        id: "claude",
    },
    {
        createUrl: (query) =>
            `https://cursor.com/link/prompt?${new URLSearchParams({ text: query })}`,
        getTitle: (gt) => gt("Open in Cursor"),
        icon: CursorIcon,
        id: "cursor",
    },
    {
        createUrl: (query) =>
            `codex://new?${new URLSearchParams({ prompt: query })}`,
        getTitle: (gt) => gt("Open in Codex"),
        icon: OpenAIIcon,
        id: "codex",
    },
    {
        createUrl: (query) =>
            `https://t3.chat/new?${new URLSearchParams({ q: query })}`,
        getTitle: (gt) => gt("Open in T3 Chat"),
        icon: MessageCircleIcon,
        id: "t3-chat",
    },
    {
        createUrl: (query) =>
            `https://v0.app?${new URLSearchParams({ q: query })}`,
        getTitle: (gt) => gt("Open in v0"),
        icon: V0Icon,
        id: "v0",
    },
    {
        createUrl: (_query) => "https://docs.new",
        getTitle: (gt) => gt("Open in Google Docs"),
        icon: GoogleDocsIcon,
        id: "google-docs",
    },
];

type IframeStatus = "pending" | "loaded" | "blocked";

type OembedStatus = "blocked" | "loaded" | "loading" | "oembed";

type Translate = ReturnType<typeof useGT>;

type OembedResolution =
    | {
          oembed: Oembed;
          resolution: "found";
      }
    | {
          resolution: "not-found" | "unsupported";
      };

export interface SideUrlInput {
    description?: string;
    title?: string;
    url: string;
}

export interface SideNote {
    id: string;
    noteContentHtml: string | null;
    noteContentState: unknown;
    noteContentText: string | null;
}

interface SideUrlEntry {
    description?: string;
    id: string;
    title: string;
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
    contentState: NoteSerializedEditorState | null;
}

type NoteSaveHandler = (
    draft: NoteDraft,
    noteId: string | null
) => Promise<LibraryItemWithCollections | null>;

interface SideQueueState {
    activeIndex: number;
    items: SideEntry[];
}

interface SideContextValue {
    onSaveNote: NoteSaveHandler;
    onUrlPaste: (url: string) => Promise<void> | void;
}

interface SideTabsContextValue {
    onKeyDown: (
        index: number,
        event: React.KeyboardEvent<HTMLButtonElement>
    ) => void;
    registerTab: (itemId: string, element: HTMLButtonElement | null) => void;
}

interface SideStore {
    activeIndex: number;
    isOpen: boolean;
    items: SideEntry[];
}

interface SideStorage<T> {
    getSnapshot: (key: string) => T | Promise<T>;
    subscribe?: (update: (value: T) => void, key: string) => void;
    update: (value: T, key: string) => void;
    value: T;
}

interface SideActions {
    openWithEntry: (entry: SideEntry) => void;
    removeQueueItem: (index: number) => void;
    selectQueueIndex: (index: number) => void;
    updateNoteEntry: (id: string, note: SideNote) => void;
}

type SideStoreActions = SideActions &
    Record<string, (...args: never[]) => void>;

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

const SideContext = createContext<SideContextValue | null>(null);
const SideTabsContext = createContext<SideTabsContextValue | null>(null);

function useSideContext(): SideContextValue {
    const context = use(SideContext);
    if (!context) {
        throw new Error("Side components must be used inside <SideRoot>.");
    }
    return context;
}

function useSideTabsContext(): SideTabsContextValue {
    const context = use(SideTabsContext);
    if (!context) {
        throw new Error("Side tabs must be rendered inside <SideList>.");
    }
    return context;
}

export function useIsSideOpen(): boolean {
    const { isOpen } = useSideStore();
    return isOpen;
}

function useSideStatus(url: string | null, timeoutMs: number) {
    const oembedUrl =
        url !== null && !isSideBlockedUrl(url) && hasOembedSupport(url)
            ? url
            : null;

    const { data, error, mutate } = useSWR(oembedUrl, resolveOembed, {
        revalidateIfStale: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false,
    });
    const timeout = useTimeout();
    const statusCacheRef = useRefWithInit(
        () => new Map<string, IframeStatus>()
    ).current;
    const [iframeStatus, setIframeStatus] = React.useState<IframeStatus>(() =>
        url ? (statusCacheRef.get(url) ?? "pending") : "pending"
    );
    const [attempt, setAttempt] = useState(0);

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

    React.useEffect(() => {
        if (isSideBlockedUrl(url) || iframeStatus !== "pending") {
            timeout.clear();
            return;
        }
        timeout.start(timeoutMs, () => {
            setIframeStatus((current) =>
                current === "pending" ? "blocked" : current
            );
        });
        return () => {
            timeout.clear();
        };
    }, [timeout, timeoutMs, url, iframeStatus]);

    React.useEffect(() => {
        if (data?.resolution === "found") {
            timeout.clear();
        }
    }, [timeout, data]);

    React.useEffect(() => {
        if (error && url) {
            log.warn("Side oEmbed fetch failed; trying iframe fallback.", {
                host: parseDisplayUrl(url),
            });
        }
    }, [error, url]);

    React.useEffect(() => {
        if (iframeStatus === "blocked" && url) {
            log.warn("Side preview did not load; showing fallback.", {
                host: parseDisplayUrl(url),
            });
        }
    }, [iframeStatus, url]);

    const oembed = data?.resolution === "found" ? data.oembed : null;
    const status = parseOembedStatus(url, data, iframeStatus);

    return { attempt, markAsBlocked, markAsLoaded, oembed, retry, status };
}

function parseOembedStatus(
    url: string | null,
    data: OembedResolution | undefined,
    iframeStatus: IframeStatus
): OembedStatus {
    if (isSideBlockedUrl(url)) {
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

async function resolveOembed(url: string): Promise<OembedResolution> {
    const response = await fetch(`/api/oembed?url=${encodeURIComponent(url)}`, {
        headers: { Accept: "application/json" },
    });
    if (response.status === 404) {
        return { resolution: "unsupported" };
    }
    if (!response.ok) {
        return { resolution: "not-found" };
    }
    const parsed = OembedSchema.safeParse(await response.json());
    return parsed.success
        ? { oembed: parsed.data, resolution: "found" }
        : { resolution: "not-found" };
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
        return (
            left.title === right.title &&
            left.description === right.description &&
            left.url === right.url
        );
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
        description: input.description,
        id: `url:${input.url}`,
        title: input.title ?? DEFAULT_TITLE,
        type: "url",
        url: input.url,
    };
}

function getRecentSideItems(
    items: LibraryItemWithCollections[],
    lastVisitedItemIds: string[]
): LibraryItemWithCollections[] {
    const itemsById = new Map(items.map((item) => [item.id, item]));

    return lastVisitedItemIds
        .map((itemId) => itemsById.get(itemId))
        .filter(
            (item): item is LibraryItemWithCollections =>
                item?.kind === ITEM_KIND_BOOKMARK
        )
        .slice(0, SIDE_RECENT_ITEMS_LIMIT);
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
        if (!isRecord(rawItem)) {
            return [];
        }

        if (typeof rawItem.url === "string") {
            return [
                createSideUrlEntry({
                    description:
                        typeof rawItem.description === "string"
                            ? rawItem.description
                            : undefined,
                    title:
                        typeof rawItem.title === "string"
                            ? rawItem.title
                            : undefined,
                    url: rawItem.url,
                }),
            ];
        }

        if (rawItem.type !== "note" || typeof rawItem.id !== "string") {
            return [];
        }

        if (!isRecord(rawItem.note) || typeof rawItem.note.id !== "string") {
            return [];
        }

        return [
            {
                id: rawItem.id,
                note: {
                    id: rawItem.note.id,
                    noteContentHtml:
                        typeof rawItem.note.noteContentHtml === "string"
                            ? rawItem.note.noteContentHtml
                            : null,
                    noteContentState: rawItem.note.noteContentState ?? null,
                    noteContentText:
                        typeof rawItem.note.noteContentText === "string"
                            ? rawItem.note.noteContentText
                            : null,
                },
                type: "note",
            } satisfies SideNoteEntry,
        ];
    });
}

function serializeSideItems(items: SideEntry[]): string {
    return JSON.stringify(
        items.filter((item) => item.type === "url" || item.note !== null)
    );
}

function isStorageQuotaExceededError(error: unknown): boolean {
    if (!isRecord(error)) {
        return false;
    }

    return (
        error.name === "QuotaExceededError" ||
        error.code === 22 ||
        error.code === 1014
    );
}

function createSideItemsStorage() {
    // stan-js's browser runtime returns a synchronizer object here, although
    // its published Storage type describes the callable factory result as T.
    const persistedStorage = storage<SideEntry[]>([], {
        deserialize: deserializeSideItems,
        serialize: serializeSideItems,
        storageKey: ITEMS_STORAGE_KEY,
    }) as unknown as SideStorage<SideEntry[]>;

    return {
        ...persistedStorage,
        update(value: SideEntry[], key: string) {
            try {
                persistedStorage.update(value, key);
            } catch (error) {
                if (!isStorageQuotaExceededError(error)) {
                    throw error;
                }

                log.warn(
                    "Side tabs exceeded local storage quota; keeping the current tabs in memory.",
                    error
                );
            }
        },
    } as unknown as SideEntry[];
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

function getSidePanelId(entry: SideEntry): string {
    return `side-panel-${entry.type}-${encodeURIComponent(entry.id)}`;
}

function isSideBlockedUrl(url: string | null): boolean {
    if (url === null || url === SIDE_BLOCKED_URL) {
        return true;
    }
    const parsed = parseValidUrl(url);
    return parsed?.protocol !== "http:" && parsed?.protocol !== "https:";
}

function isSideKeyboardShortcut(event: KeyboardEvent): boolean {
    return (
        event.code === "KeyB" &&
        event.altKey &&
        (event.metaKey || event.ctrlKey) &&
        !event.getModifierState("AltGraph")
    );
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

const SIDE_ITEMS_STORAGE = createSideItemsStorage();

const { actions: sideStoreActions, useStore: useSideStore } = createStore<
    SideStore,
    SideStoreActions
>(
    {
        activeIndex: storage(0, {
            storageKey: ACTIVE_INDEX_STORAGE_KEY,
        }),
        isOpen: storage(false, {
            storageKey: OPEN_STORAGE_KEY,
        }),
        items: SIDE_ITEMS_STORAGE,
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
    const contextValue = { onSaveNote, onUrlPaste };

    return <SideContext value={contextValue}>{children}</SideContext>;
}

export function SideContent() {
    const gt = useGT();
    const { onSaveNote, onUrlPaste } = useSideContext();
    const {
        activeIndex,
        isOpen,
        items,
        removeQueueItem,
        selectQueueIndex,
        setIsOpen,
    } = useSideStore();

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

    const handleToggleShortcut = useStableCallback((event: KeyboardEvent) => {
        if (
            event.defaultPrevented ||
            event.isComposing ||
            !isSideKeyboardShortcut(event) ||
            isTextEntryTarget(event.target)
        ) {
            return;
        }
        setIsOpen((prev) => !prev);
    });

    useHotkeys("mod+alt+b", handleToggleShortcut, {
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
        const doc = aside?.ownerDocument ?? document;
        const trackInvoker = (target: EventTarget | null) => {
            if (target instanceof HTMLElement && !aside?.contains(target)) {
                invokerRef.current = target;
            }
        };
        trackInvoker(doc.activeElement);
        const handleFocusIn = (event: FocusEvent) => {
            trackInvoker(event.target);
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
        const doc = aside.ownerDocument;
        if (isOpen) {
            // Notes move focus to the editor in SideNotePanel. Only move
            // focus here for URL tabs so Escape on the aside stays reachable
            // and mobile screen readers enter the fixed panel.
            if (activeEntry?.type === "url") {
                const tab = doc.getElementById(getSideTabId(activeEntry));
                if (tab) {
                    tab.focus({ preventScroll: true });
                } else {
                    doc.getElementById(getSidePanelId(activeEntry))?.focus({
                        preventScroll: true,
                    });
                }
            }
            return;
        }
        const invoker = invokerRef.current;
        invokerRef.current = null;
        const activeElement = doc.activeElement;
        if (activeElement && aside.contains(activeElement)) {
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
                noteCloseHandlersRef.get(item.id)?.();
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

    return (
        <>
            <SideToggle />
            <aside
                aria-hidden={!isOpen}
                aria-label={gt("Preview")}
                className={cn(
                    "group/side relative z-50 flex min-h-0 shrink-0 flex-col overflow-hidden border-s bg-background transition-[width,transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                    "fixed inset-y-0 right-0 w-[calc(100%-3rem)] max-w-md data-[state=collapsed]:translate-x-full",
                    "lg:w-[400px]",
                    "lg:sticky lg:top-0 lg:right-auto lg:h-dvh lg:max-h-dvh lg:translate-x-0 lg:data-[state=collapsed]:w-0 lg:data-[state=collapsed]:border-transparent lg:data-[state=collapsed]:opacity-0"
                )}
                data-side="right"
                data-slot="side"
                data-state={isOpen ? "expanded" : "collapsed"}
                inert={!isOpen}
                onKeyDown={handleAsideKeyDown}
                ref={asideRef}
            >
                <div
                    className={cn(
                        "flex h-full min-h-0 w-[calc(100vw-3rem)] min-w-0 max-w-md flex-1 flex-col",
                        "lg:w-[400px]",
                        "lg:max-w-[400px]"
                    )}
                >
                    <div
                        className={cn(
                            "flex shrink-0 flex-col gap-2 p-2 pr-11",
                            {
                                "p-0": !activeEntry,
                            }
                        )}
                    >
                        <h2 className="sr-only">
                            <T>Side</T>
                        </h2>
                        <div className="flex max-w-full items-center gap-1">
                            <SideList
                                items={items}
                                onTabSelect={selectQueueIndex}
                            >
                                {(item, index) => (
                                    <SideListItem
                                        index={index}
                                        isActive={index === safeActiveIndex}
                                        item={item}
                                        key={item.id}
                                        onRemove={handleRemoveItem}
                                        onSelect={selectQueueIndex}
                                    />
                                )}
                            </SideList>
                            {activeEntry ? <SideNewTabMenu /> : null}
                        </div>
                    </div>
                    <SidePanel
                        activeEntry={activeEntry}
                        isOpen={isOpen}
                        items={items}
                        onCloseNote={handleCloseNote}
                        onRegisterNoteClose={registerNoteCloseHandler}
                        onSaveNote={onSaveNote}
                        onUrlPaste={onUrlPaste}
                    />
                </div>
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
    onSaveNote: NoteSaveHandler;
    onUrlPaste: (url: string) => Promise<void> | void;
}

function SidePanel({
    activeEntry,
    isOpen,
    items,
    onCloseNote,
    onRegisterNoteClose,
    onSaveNote,
    onUrlPaste,
}: SidePanelProps) {
    const visibleActiveEntry = isOpen ? activeEntry : null;
    const { attempt, markAsBlocked, markAsLoaded, oembed, retry, status } =
        useSideStatus(
            visibleActiveEntry?.type === "url" ? visibleActiveEntry.url : null,
            DEFAULT_TIMEOUT_MS
        );

    return (
        <>
            {visibleActiveEntry?.type === "url" ? (
                <SideUrlPanel
                    attempt={attempt}
                    entry={visibleActiveEntry}
                    markAsBlocked={markAsBlocked}
                    markAsLoaded={markAsLoaded}
                    oembed={oembed}
                    onRetry={retry}
                    status={status}
                />
            ) : null}
            {/* Keep every note session mounted so tab switches preserve editor history. */}
            {items.map((item) =>
                item.type === "note" ? (
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
                        onSave={onSaveNote}
                        onUrlPaste={onUrlPaste}
                    />
                ) : null
            )}
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
        <div
            aria-busy={isLoading}
            aria-labelledby={getSideTabId(entry)}
            className="relative min-h-0 flex-1"
            id={getSidePanelId(entry)}
            role="tabpanel"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: tabpanel needs keyboard focus per ARIA tabs pattern; matches previous DrawerPanel behavior
            tabIndex={0}
        >
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
                    sandbox={SIDE_IFRAME_SANDBOX}
                    src={entry.url}
                    title={gt("Preview of {title}", { title: entry.title })}
                />
            )}
        </div>
    );
}

function SidePanelEmpty() {
    const { items } = useItemsContext();
    const { lastVisitedItemIds } = useLastVisited();

    const recentItems = getRecentSideItems(items, lastVisitedItemIds);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1">
                <Placeholder className="bg-background">
                    <Globe
                        aria-hidden
                        className="z-20 size-5.5 text-muted-foreground"
                        focusable="false"
                    />
                    <span className="z-20 text-center font-medium text-muted-foreground text-sm">
                        Side
                    </span>
                </Placeholder>
            </div>
            {recentItems.length > 0 ? (
                <section className="shrink-0 border-t p-4">
                    <h2 className="font-medium text-foreground text-sm">
                        <T>Recently visited</T>
                    </h2>
                    <ul className="mt-2 flex flex-col gap-1">
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
    const title = item.caption?.trim() || item.url;
    const label = item.caption?.trim() || parseDisplayUrl(item.url);

    const handleOpen = useStableCallback(() => {
        openSide({
            description: parseDisplayUrl(item.url),
            title,
            url: item.url,
        });
    });

    return (
        <li>
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

interface SideListProps extends Omit<React.ComponentProps<"div">, "children"> {
    children: (item: SideEntry, index: number) => React.ReactNode;
    items: SideEntry[];
    onTabSelect: (index: number) => void;
}

function SideList({
    items,
    className,
    children,
    onTabSelect,
    ...props
}: SideListProps) {
    const gt = useGT();
    const tabRefs = useRefWithInit(
        () => new Map<string, HTMLButtonElement>()
    ).current;

    const registerTab = useStableCallback(
        (itemId: string, element: HTMLButtonElement | null) => {
            if (element) {
                tabRefs.set(itemId, element);
            } else {
                tabRefs.delete(itemId);
            }
        }
    );

    const focusTab = useStableCallback((itemId: string) => {
        tabRefs.get(itemId)?.focus();
    });

    const handleKeyDown = useStableCallback(
        (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
            let nextIndex: number | null = null;

            if (event.key === "ArrowLeft") {
                nextIndex = index === 0 ? items.length - 1 : index - 1;
            } else if (event.key === "ArrowRight") {
                nextIndex = index === items.length - 1 ? 0 : index + 1;
            } else if (event.key === "Home") {
                nextIndex = 0;
            } else if (event.key === "End") {
                nextIndex = items.length - 1;
            }

            if (nextIndex === null) {
                return;
            }

            const nextItem = items[nextIndex];
            if (!nextItem) {
                return;
            }

            event.preventDefault();
            onTabSelect(nextIndex);
            focusTab(nextItem.id);
        }
    );

    const contextValue = { onKeyDown: handleKeyDown, registerTab };

    return (
        <SideTabsContext value={contextValue}>
            <div
                {...props}
                aria-label={gt("Open side tabs")}
                className={cn(
                    "flex min-w-0 max-w-full flex-1 items-center gap-1.5 overflow-x-auto",
                    className
                )}
                role="tablist"
            >
                {items.map(children)}
            </div>
        </SideTabsContext>
    );
}

interface SideListItemProps {
    index: number;
    isActive: boolean;
    item: SideEntry;
    onRemove: (item: SideEntry, index: number) => void;
    onSelect: (index: number) => void;
}

function SideListItem({
    index,
    isActive,
    item,
    onRemove,
    onSelect,
}: SideListItemProps) {
    const gt = useGT();
    const { onKeyDown, registerTab } = useSideTabsContext();

    const entryTitle = getSideEntryTitle(item);

    let title: string;
    if (entryTitle === DEFAULT_TITLE) {
        title = gt("Preview");
    } else if (entryTitle !== null) {
        title = truncateLabel(entryTitle);
    } else if (item.type === "note") {
        title = item.note ? gt("Untitled note") : gt("New note");
    } else {
        title = gt("Preview");
    }
    const closeLabel = gt("Close {title}", { title });

    const handleKeyDown = useStableCallback(
        (event: React.KeyboardEvent<HTMLButtonElement>) => {
            onKeyDown(index, event);
        }
    );

    const handleTabRef = useStableCallback(
        (element: HTMLButtonElement | null) => {
            registerTab(item.id, element);
        }
    );

    const handleClick = useStableCallback(() => {
        onSelect(index);
    });

    const handleRemove = useStableCallback(() => {
        onRemove(item, index);
    });

    return (
        <div
            className={cn(
                "relative inline-flex min-w-0 shrink-0 items-center rounded-lg",
                isActive ? "bg-secondary" : "hover:bg-accent"
            )}
            role="presentation"
        >
            <Button
                aria-controls={getSidePanelId(item)}
                aria-selected={isActive}
                id={getSideTabId(item)}
                onClick={handleClick}
                onKeyDown={handleKeyDown}
                ref={handleTabRef}
                role="tab"
                size="sm"
                tabIndex={isActive ? 0 : -1}
                title={title}
                variant="ghost"
            >
                {item.type === "note" ? null : (
                    <Globe aria-hidden className="size-3.5" focusable="false" />
                )}
                <Calligraph className="min-w-0 truncate font-medium">
                    {title}
                </Calligraph>
            </Button>
            <Button
                aria-label={closeLabel}
                onClick={handleRemove}
                size="icon-sm"
                title={closeLabel}
                variant="ghost"
            >
                <XIcon className="size-3.5 shrink-0" />
            </Button>
        </div>
    );
}

function SideNewTabMenu() {
    const gt = useGT();
    const { items } = useItemsContext();
    const { lastVisitedItemIds } = useLastVisited();

    const recentItems = getRecentSideItems(items, lastVisitedItemIds);
    const triggerLabel = gt("Open recent tabs");

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
                <PlusIcon aria-hidden className="size-4" focusable="false" />
            </MenuTrigger>
            <MenuPopup align="end" className="w-72">
                <MenuGroup>
                    <MenuGroupLabel>
                        <T>Recently visited</T>
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
    const title = item.caption?.trim() || item.url;
    const label = item.caption?.trim() || parseDisplayUrl(item.url);

    const handleOpen = useStableCallback(() => {
        openSide({
            description: parseDisplayUrl(item.url),
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
                    <T>Loading preview...</T>
                </p>
                <p className="max-w-sm text-balance text-muted-foreground text-sm">
                    <T>Opening the page.</T>
                </p>
            </div>
        </div>
    );
}

function SideBlocked({ onRetry, url }: { onRetry: () => void; url: string }) {
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

function SideToggle({
    className,
    onClick,
    ...props
}: React.ComponentProps<typeof Button>) {
    const gt = useGT();
    const { isOpen, setIsOpen } = useSideStore();

    const handleClick = useStableCallback(
        (event: BaseUIEvent<React.MouseEvent<HTMLButtonElement>>) => {
            onClick?.(event);
            if (event.defaultPrevented) {
                return;
            }
            setIsOpen((prev) => !prev);
        }
    );

    const toggleLabel = isOpen ? gt("Close preview") : gt("Open preview");
    const toggleShortcut = `${getSystemControlKey()}${getSystemAltKey()}B`;
    const toggleTitle = isOpen
        ? gt("Close preview ({shortcut})", { shortcut: toggleShortcut })
        : gt("Open preview ({shortcut})", { shortcut: toggleShortcut });

    return (
        <Button
            {...props}
            aria-label={toggleLabel}
            className={cn(
                "fixed top-2 right-0.5 z-60 lg:right-2",
                { "text-muted-foreground": !isOpen },
                className
            )}
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
    onSave: NoteSaveHandler;
    onUrlPaste: (url: string) => Promise<void> | void;
}

function SideNotePanel({
    entry,
    isActive,
    onClose,
    onRegisterClose,
    onSave,
    onUrlPaste,
}: SideNotePanelProps) {
    const contentEditableRef = useRef<HTMLDivElement | null>(null);

    const handleClose = useStableCallback(() => {
        onClose(entry.id);
    });

    const handleSave = useStableCallback(
        async (draft: NoteDraft, noteId: string | null) => {
            const savedNote = await onSave(draft, noteId);
            if (savedNote) {
                const nextNote = toSideNote(savedNote);
                if (!areSideNotesEqual(entry.note, nextNote)) {
                    sideStoreActions.updateNoteEntry(entry.id, nextNote);
                }
            }
            return savedNote;
        }
    );

    useIsoLayoutEffect(
        () => onRegisterClose(entry.id, handleClose),
        [entry.id, handleClose, onRegisterClose]
    );

    useIsoLayoutEffect(() => {
        if (isActive) {
            contentEditableRef.current?.focus({ preventScroll: true });
        }
    }, [isActive]);

    return (
        <NoteRoot
            contentEditableRef={contentEditableRef}
            isActive={isActive}
            note={entry.note}
            onClose={handleClose}
            onSave={handleSave}
            onUrlPaste={onUrlPaste}
        >
            <div
                aria-hidden={!isActive}
                aria-labelledby={getSideTabId(entry)}
                className={cn(
                    "min-h-0 flex-1 flex-col",
                    isActive ? "flex" : "hidden"
                )}
                id={getSidePanelId(entry)}
                role="tabpanel"
                tabIndex={isActive ? 0 : -1}
            >
                <ScrollArea className="min-h-0 flex-1">
                    <div className="p-4">
                        <NoteEditor />
                        <NoteMetrics />
                    </div>
                </ScrollArea>
            </div>
        </NoteRoot>
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

interface NoteContextValue {
    contentEditableRef?: React.RefObject<HTMLDivElement | null>;
    contentHtml: string;
    editorKey: number;
    initialDraft: NoteDraft;
    isDirty: boolean;
    onClose: () => void | Promise<void>;
    onDraftChange: (draft: NoteDraft) => void;
    onUrlPaste: (url: string) => Promise<void> | void;
    query: string;
    saveStatus: SaveStatus;
    sessionId: string;
    shouldCreateBookmarkFromUrlPaste: () => boolean;
    textMetrics: NoteTextMetrics;
}

interface FormatState {
    blockType: NoteBlockType;
    bold: boolean;
    italic: boolean;
    strikeThrough: boolean;
    underline: boolean;
}

interface NoteTextMetrics {
    characterCount: number;
    paragraphCount: number;
    plainText: string;
    readMinuteCount: number;
    wordCount: number;
}

type NoteBlockType = "h1" | "h2" | "h3" | "paragraph";

type NoteInlineFormatStateKey = Exclude<keyof FormatState, "blockType">;

interface ExportContentProvider {
    createUrl: (query: string) => string;
    getTitle: (gt: Translate) => string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    id: string;
}

interface EditorSession {
    editorKey: number;
    extension: ReturnType<typeof createNoteSessionExtension>;
}

const NoteContext = createContext<NoteContextValue | null>(null);

function useNoteContext(): NoteContextValue {
    const context = use(NoteContext);
    if (!context) {
        throw new Error(
            "Side note components must be rendered inside a note tab."
        );
    }
    return context;
}

function normalizeDraft(draft: NoteDraft): NoteDraft {
    return {
        contentHtml: normalizeNoteHtml(draft.contentHtml),
        contentState: draft.contentState,
    };
}

function noteDraftFromEditorState(
    contentState: NoteSerializedEditorState
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
        left.strikeThrough === right.strikeThrough &&
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

function parseNoteBlockType(value: string | undefined): NoteBlockType | null {
    for (const option of NOTE_BLOCK_OPTIONS) {
        if (option.value === value) {
            return option.value;
        }
    }
    return null;
}

function parseTextFormat(value: string | undefined): TextFormatType | null {
    for (const option of NOTE_TEXT_FORMAT_OPTIONS) {
        if (option.format === value) {
            return option.format;
        }
    }
    return null;
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

function createNoteSessionExtension(
    sessionId: string,
    editorKey: number,
    initialDraft: NoteDraft
) {
    return defineExtension({
        $initialEditorState: getInitialEditorState(initialDraft),
        dependencies: [NOTE_EDITOR_EXTENSION],
        name: `${NOTE_EDITOR_NAMESPACE}-${sessionId}-${editorKey}`,
        namespace: NOTE_EDITOR_NAMESPACE,
    });
}

interface NoteRootProps {
    children: ReactNode;
    contentEditableRef?: React.RefObject<HTMLDivElement | null>;
    isActive: boolean;
    note: SideNote | null;
    onClose: () => void | Promise<void>;
    onSave: NoteSaveHandler;
    onUrlPaste: (url: string) => Promise<void> | void;
}

function NoteRoot({
    children,
    contentEditableRef,
    isActive,
    note,
    onClose,
    onSave,
    onUrlPaste,
}: NoteRootProps) {
    const sessionId = React.useId();
    const [initialDraft, setInitialDraft] = useState<NoteDraft>(() =>
        noteDraftFromItem(note)
    );
    const [draft, setDraft] = useState<NoteDraft>(initialDraft);
    const [editorKey, setEditorKey] = useState(0);
    const isClosingRef = useRef(false);

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

    useEffect(() => {
        if (!isActive) {
            return;
        }

        const ownerDocument = getOwnerDocument(contentEditableRef?.current);
        ownerDocument.addEventListener("keydown", handleSaveShortcut);
        return () => {
            ownerDocument.removeEventListener("keydown", handleSaveShortcut);
        };
    }, [contentEditableRef, handleSaveShortcut, isActive]);

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

    const deferredContentHtml = useDeferredValue(draft.contentHtml);
    const textMetrics = getNoteTextMetrics(deferredContentHtml);
    const query = textMetrics.plainText;

    return (
        <NoteContext
            value={{
                contentEditableRef,
                contentHtml: draft.contentHtml,
                editorKey,
                initialDraft,
                isDirty,
                onClose: handleClose,
                onDraftChange: handleDraftChange,
                onUrlPaste: handleUrlPaste,
                query,
                saveStatus,
                sessionId,
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
    const { contentHtml, query } = useNoteContext();
    const { copyToClipboard, isCopied } = useCopyToClipboard();

    const [isSendingToNotion, startSendToNotion] = useTransition();
    const [notionStatus, setNotionStatus] = useState<{
        message: string;
        tone: "error" | "success";
    } | null>(null);

    const hasQuery = query.length > 0;

    const handleCopyNote = useStableCallback(() => {
        if (!hasQuery) {
            return;
        }
        copyToClipboard(query);
    });

    const handleExportMarkdown = useStableCallback(() => {
        downloadMarkdownFile(contentHtml, query, gt("Markdown file")).catch(
            (error: unknown) => {
                log.error("Unexpected Markdown export failure", error);
            }
        );
    });

    const handleSendToNotion = useStableCallback(() => {
        if (!hasQuery || isSendingToNotion) {
            return;
        }

        setNotionStatus(null);
        startSendToNotion(async () => {
            const result = await sendNoteToNotion({
                contentHtml,
                title: getNotionNoteTitle(query),
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
        <div className="inline-flex items-center justify-end gap-1">
            <NoteSaveStatus />
            <Button
                aria-label={gt("Copy note")}
                disabled={!hasQuery}
                onClick={handleCopyNote}
                size="icon-xs"
                variant="ghost"
            >
                {isCopied ? (
                    <CheckIcon
                        aria-hidden
                        className="size-3"
                        focusable="false"
                    />
                ) : (
                    <Copy aria-hidden className="size-3" focusable="false" />
                )}
            </Button>
            <Menu>
                <MenuTrigger
                    render={
                        <Button
                            disabled={!hasQuery}
                            size="xs"
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
                            hasQuery={hasQuery}
                            key={provider.id}
                            provider={provider}
                            query={query}
                        />
                    ))}
                    <MenuItem
                        disabled={!hasQuery || isSendingToNotion}
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
                        disabled={!hasQuery}
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
        sessionId,
        shouldCreateBookmarkFromUrlPaste,
    } = useNoteContext();
    const sessionRef = useRef<EditorSession | null>(null);

    if (
        sessionRef.current === null ||
        sessionRef.current.editorKey !== editorKey
    ) {
        sessionRef.current = {
            editorKey,
            extension: createNoteSessionExtension(
                sessionId,
                editorKey,
                initialDraft
            ),
        };
    }

    return (
        <LexicalExtensionComposer
            contentEditable={null}
            extension={sessionRef.current.extension}
            key={editorKey}
        >
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

function NoteMetrics() {
    const { textMetrics } = useNoteContext();

    const shouldShowReadTime = textMetrics.readMinuteCount >= 2;

    return (
        <div className="mt-3 flex items-center justify-end gap-4 border-border/60 border-t pt-3 text-muted-foreground text-xs">
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
        message = gt("Saving...");
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

function ExportProviderMenuItem({
    hasQuery,
    provider,
    query,
}: {
    hasQuery: boolean;
    provider: ExportContentProvider;
    query: string;
}) {
    const gt = useGT();
    const ProviderIcon = provider.icon;
    const title = provider.getTitle(gt);
    const href = provider.createUrl(query);

    return (
        <MenuItem
            disabled={!hasQuery}
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

    const updateToolbarState = useStableCallback(() => {
        editor.getEditorState().read(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
                commitFormats(INITIAL_FORMAT_STATE);
                return;
            }

            commitFormats({
                blockType: getSelectionBlockType(selection),
                bold: selection.hasFormat("bold"),
                italic: selection.hasFormat("italic"),
                strikeThrough: selection.hasFormat("strikethrough"),
                underline: selection.hasFormat("underline"),
            });
        });
    });

    useEffect(() => {
        updateToolbarState();

        return mergeRegister(
            editor.registerUpdateListener(updateToolbarState),
            editor.registerCommand(
                SELECTION_CHANGE_COMMAND,
                () => {
                    updateToolbarState();
                    return false;
                },
                COMMAND_PRIORITY_LOW
            )
        );
    }, [editor, updateToolbarState]);

    const setBlockType = useStableCallback((blockType: NoteBlockType) => {
        editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
                return;
            }

            if (blockType === "paragraph") {
                $setBlocksType(selection, () => $createParagraphNode());
                return;
            }

            $setBlocksType(selection, () => $createHeadingNode(blockType));
        });
    });

    const handleBlockTypeMouseDown = useStableCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            const blockType = parseNoteBlockType(
                event.currentTarget.dataset.blockType
            );
            if (blockType) {
                setBlockType(blockType);
            }
        }
    );

    const handleFormatMouseDown = useStableCallback(
        (event: React.MouseEvent<HTMLButtonElement>) => {
            event.preventDefault();
            const format = parseTextFormat(event.currentTarget.dataset.format);
            if (format) {
                editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
            }
        }
    );

    return (
        <div
            aria-label={gt("Text formatting")}
            aria-orientation="horizontal"
            className="inline-flex items-center justify-start gap-3"
            ref={mergedRef}
            role="toolbar"
        >
            {NOTE_BLOCK_OPTIONS.map((option) => (
                <Button
                    aria-label={option.ariaLabel(gt)}
                    data-block-type={option.value}
                    key={option.value}
                    onMouseDown={handleBlockTypeMouseDown}
                    size="xs"
                    variant={
                        formats.blockType === option.value
                            ? "secondary"
                            : "ghost"
                    }
                >
                    {option.label(gt)}
                </Button>
            ))}
            {NOTE_TEXT_FORMAT_OPTIONS.map((option) => {
                const Icon = option.icon;

                return (
                    <Button
                        aria-label={option.ariaLabel(gt)}
                        className={cn(formats[option.stateKey] && "bg-accent")}
                        data-format={option.format}
                        key={option.format}
                        onMouseDown={handleFormatMouseDown}
                        size="icon-xs"
                        variant="ghost"
                    >
                        <Icon className="size-4" />
                    </Button>
                );
            })}
        </div>
    );
}

interface ContentPluginProps {
    contentEditableRef?: React.RefObject<HTMLDivElement | null>;
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

    useEffect(
        () =>
            editor.registerCommand(
                PASTE_COMMAND,
                handlePaste,
                COMMAND_PRIORITY_LOW
            ),
        [editor, handlePaste]
    );

    const handleChange = useStableCallback((editorState: EditorState) => {
        onDraftChange(noteDraftFromEditorState(editorState.toJSON()));
    });

    return (
        <>
            <div className="mt-2 mb-3 flex items-center justify-between">
                <FormattingToolbarControls />
                <NoteToolbarControls />
            </div>
            <div className="relative min-h-96 flex-1">
                <ContentEditable
                    className={cn(
                        "prose prose-stone h-full min-h-96 max-w-none overflow-y-auto text-[15px] leading-7 outline-none",
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
            <T>Start typing or paste a link to add...</T>
        </div>
    );
}
