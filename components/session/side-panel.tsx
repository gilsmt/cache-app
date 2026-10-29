"use client";

import { Tabs } from "@base-ui/react/tabs";
import { activeElement, contains, getTarget } from "@base-ui/utils/shadowDom";
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
    HeadingAnnounceExtension,
    RichTextExtension,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
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
    useEffect,
    useRef,
    useState,
    useTransition,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import { TextMorph } from "torph/react";
import * as z from "zod";
import { useFavicon } from "@/components/hooks/queries/use-favicon";
import {
    type OembedResolution,
    useOembed,
} from "@/components/hooks/queries/use-oembed";
import {
    type AutosaveStatus,
    useAutosave,
} from "@/components/hooks/use-autosave";
import { useCopyToClipboard } from "@/components/hooks/use-copy-to-clipboard";
import { useLastVisited } from "@/components/hooks/use-last-visited";
import { ItemCollectionsCombobox } from "@/components/session/collections";
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
import {
    ScrollArea,
    ScrollAreaRoot,
    ScrollAreaViewport,
    ScrollBar,
} from "@/components/ui/scroll-area";
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
import { sendNoteToNotion } from "@/lib/integrations/notion/actions";
import {
    convertNoteHtmlToMarkdown,
    extractNoteText,
    isSerializedEditorState,
    NOTE_EMPTY_HTML,
    normalizeHtml,
    serializeEditorStateToHtml,
} from "@/lib/notes/utils";

const ACTIVE_INDEX_STORAGE_KEY = "cache:side:active-index";
const ITEMS_STORAGE_KEY = "cache:side:items";
const OPEN_STORAGE_KEY = "cache:side:open";
const PREVIEW_LOADING_TIMEOUT_MS = 8000;
const SIDE_RECENT_ITEMS_LIMIT = 3;

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

const EDITOR_NAMESPACE = "cache-library-note";
const EDITOR_READING_WORDS_PER_MINUTE = 250;
const EDITOR_WORD_SEPARATOR = /\s+/u;

const EDITOR_HISTORY_ANNOUNCE_UNDONE = "Undone";
const EDITOR_HISTORY_ANNOUNCE_REDONE = "Redone";

const EDITOR_HEADING_ANNOUNCE_CREATED = "Heading level %s";
const EDITOR_HEADING_ANNOUNCE_DESTROYED = "Heading level %s removed";

const EDITOR_NON_EMPTY_BLOCK_TAG_REGEX =
    /<(h[1-3]|p)>(?!(?:\s|<br\s*\/?>)*<\/\1>)[\s\S]*?<\/\1>/giu;

const EDITOR_THEME = {
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

type IframeStatus = "pending" | "loaded" | "blocked";

type OembedStatus = "blocked" | "loaded" | "loading" | "oembed";

interface SidePanelUrlInput {
    title?: string | null;
    url: string;
}

interface SidePanelNote {
    id: string;
    noteContentHtml: string | null;
    noteContentState: unknown;
    noteContentText: string | null;
}

interface SidePanelUrlEntry {
    id: string;
    title: string | null;
    type: "url";
    url: string;
}

interface SidePanelNoteEntry {
    id: string;
    note: SidePanelNote | null;
    type: "note";
}

type SidePanelEntry = SidePanelNoteEntry | SidePanelUrlEntry;

export interface EditorDraft {
    contentHtml: string;
    contentState: SerializedEditorState | null;
}

type EditorSaveHandler = (
    draft: EditorDraft,
    noteId: string | null
) => Promise<LibraryItemWithCollections | null>;

interface SidePanelTabState {
    activeIndex: number;
    items: SidePanelEntry[];
}

interface SidePanelStorageKeys {
    activeIndex: string;
    items: string;
}

interface SidePanelContext {
    closeNoteTab: (id: string) => void;
    onClosePreview: () => void;
    onSaveNote: EditorSaveHandler;
    onUrlPaste: (url: string) => Promise<void> | void;
    registerNoteClose: (
        id: string,
        close: () => void | Promise<void>
    ) => () => void;
    requestCloseTab: (item: SidePanelEntry) => void;
}

interface EditorFormatState {
    blockType: EditorBlockType;
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
}

interface EditorTextMetrics {
    characterCount: number;
    paragraphCount: number;
    plainText: string;
    readMinuteCount: number;
    wordCount: number;
}

interface EditorActionsContext {
    contentEditableRef: React.RefObject<HTMLDivElement | null>;
    onDraftChange: (draft: EditorDraft) => void;
    onUrlPaste: (url: string) => Promise<void> | void;
    shouldCreateBookmarkFromUrlPaste: () => boolean;
}

interface EditorDraftContext {
    contentHtml: string;
    isDirty: boolean;
    noteId: string | null;
    saveStatus: AutosaveStatus;
    textMetrics: EditorTextMetrics;
}

interface EditorExportProvider {
    createUrl: (plainText: string) => string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    id:
        | "chatgpt"
        | "claude"
        | "codex"
        | "cursor"
        | "google-docs"
        | "t3-chat"
        | "v0";
}

type EditorBlockType = "h1" | "h2" | "h3" | "paragraph";

type EditorInlineFormat = Exclude<keyof EditorFormatState, "blockType">;

const log = createLogger("library:side");

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

const SIDE_IFRAME_STATUS_CACHE = new Map<string, IframeStatus>();

const INITIAL_FORMAT_STATE: EditorFormatState = {
    blockType: "paragraph",
    bold: false,
    italic: false,
    strikethrough: false,
    underline: false,
};

const EDITOR_BLOCK_VALUES = [
    "paragraph",
    "h1",
    "h2",
    "h3",
] as const satisfies readonly EditorBlockType[];

const EDITOR_TEXT_FORMAT_OPTIONS = [
    {
        format: "bold",
        icon: BoldIcon,
    },
    {
        format: "italic",
        icon: ItalicIcon,
    },
    {
        format: "underline",
        icon: UnderlineIcon,
    },
    {
        format: "strikethrough",
        icon: StrikethroughIcon,
    },
] satisfies ReadonlyArray<{
    format: EditorInlineFormat;
    icon: LucideIcon;
}>;

const EXPORT_CONTENT_PROVIDERS: readonly EditorExportProvider[] = [
    {
        createUrl: (plainText) =>
            `https://chatgpt.com/?${new URLSearchParams({ hints: "search", prompt: plainText })}`,
        icon: OpenAIIcon,
        id: "chatgpt",
    },
    {
        createUrl: (plainText) =>
            `https://claude.ai/new?${new URLSearchParams({ q: plainText })}`,
        icon: ClaudeIcon,
        id: "claude",
    },
    {
        createUrl: (plainText) =>
            `https://cursor.com/link/prompt?${new URLSearchParams({ text: plainText })}`,
        icon: CursorIcon,
        id: "cursor",
    },
    {
        createUrl: (plainText) =>
            `codex://new?${new URLSearchParams({ prompt: plainText })}`,
        icon: OpenAIIcon,
        id: "codex",
    },
    {
        createUrl: (plainText) =>
            `https://t3.chat/new?${new URLSearchParams({ q: plainText })}`,
        icon: MessageCircleIcon,
        id: "t3-chat",
    },
    {
        createUrl: (plainText) =>
            `https://v0.app?${new URLSearchParams({ q: plainText })}`,
        icon: V0Icon,
        id: "v0",
    },
    {
        createUrl: () => "https://docs.new",
        icon: GoogleDocsIcon,
        id: "google-docs",
    },
];

const EDITOR_EXTENSION = defineExtension({
    dependencies: [
        RichTextExtension,
        HistoryExtension,
        configExtension(AriaLiveRegionExtension, {
            owner: null,
            politeness: "polite",
        }),
        configExtension(HistoryAnnounceExtension, {
            redone: EDITOR_HISTORY_ANNOUNCE_REDONE,
            undone: EDITOR_HISTORY_ANNOUNCE_UNDONE,
        }),
        configExtension(HeadingAnnounceExtension, {
            created: EDITOR_HEADING_ANNOUNCE_CREATED,
            destroyed: EDITOR_HEADING_ANNOUNCE_DESTROYED,
        }),
        RovingTabIndexExtension,
        FocusManagerExtension,
    ],
    name: EDITOR_NAMESPACE,
    namespace: EDITOR_NAMESPACE,
    onError(error: Error) {
        log.error("Unexpected editor error", error);
    },
    theme: EDITOR_THEME,
});

const SidePanelContext = createContext<SidePanelContext | null>(null);

function useSidePanelContext(): SidePanelContext {
    const context = use(SidePanelContext);
    if (!context) {
        throw new Error("Side components must be used inside <SidePanel>.");
    }
    return context;
}

const EditorActionsContext = createContext<EditorActionsContext | null>(null);

function useEditorActionsContext(): EditorActionsContext {
    const context = use(EditorActionsContext);
    if (!context) {
        throw new Error("Editor components must be used inside <EditorRoot>.");
    }
    return context;
}

const EditorDraftContext = createContext<EditorDraftContext | null>(null);

function useEditorDraftContext(): EditorDraftContext {
    const context = use(EditorDraftContext);
    if (!context) {
        throw new Error("Editor components must be used inside <EditorRoot>.");
    }
    return context;
}

function addSideTabEntry(
    items: SidePanelEntry[],
    entry: SidePanelEntry
): SidePanelTabState {
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

    const nextItems = [...items, entry];

    return { activeIndex: nextItems.length - 1, items: nextItems };
}

function removeSideTabEntry(
    items: SidePanelEntry[],
    activeIndex: number,
    index: number
): SidePanelTabState | null {
    if (index < 0 || index >= items.length) {
        return null;
    }
    const nextItems = items.filter((_, i) => i !== index);
    // Removing a tab before the active one shifts the active tab left;
    // removing the active tab hands the slot to its follower.
    return {
        activeIndex: clampActiveIndex(
            activeIndex - (index < activeIndex ? 1 : 0),
            nextItems.length
        ),
        items: nextItems,
    };
}

function areSideEntriesSameTab(
    left: SidePanelEntry,
    right: SidePanelEntry
): boolean {
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

function areSideEntriesEqual(
    left: SidePanelEntry,
    right: SidePanelEntry
): boolean {
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
    left: SidePanelNote | null,
    right: SidePanelNote | null
): boolean {
    if (left === null || right === null) {
        return left === right;
    }
    return (
        left.id === right.id &&
        normalizeHtml(left.noteContentHtml) ===
            normalizeHtml(right.noteContentHtml)
    );
}

function createSideUrlEntry(input: SidePanelUrlInput): SidePanelUrlEntry {
    return {
        id: `url:${input.url}`,
        title: input.title ?? null,
        type: "url",
        url: input.url,
    };
}

function clampActiveIndex(index: number, itemsLength: number): number {
    if (itemsLength === 0) {
        return 0;
    }
    return clamp(index, 0, itemsLength - 1);
}

function getSideEntryTitle(entry: SidePanelEntry): string | null {
    if (entry.type === "url") {
        return entry.title;
    }

    const firstLine = entry.note?.noteContentText
        ?.split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0);

    return firstLine ?? null;
}

function getSideTabId(entry: SidePanelEntry): string {
    return `side-tab-${entry.type}-${encodeURIComponent(entry.id)}`;
}

function toSideNote(note: LibraryItemWithCollections): SidePanelNote {
    return {
        id: note.id,
        noteContentHtml: note.noteContentHtml,
        noteContentState: note.noteContentState,
        noteContentText: note.noteContentText,
    };
}

function getSideStorageKeys(userId: string): SidePanelStorageKeys {
    const scopedKey = (baseKey: string) =>
        `${baseKey}:user:${encodeURIComponent(userId)}`;

    return {
        activeIndex: scopedKey(ACTIVE_INDEX_STORAGE_KEY),
        items: scopedKey(ITEMS_STORAGE_KEY),
    };
}

function deserializeSideItems(value: string): SidePanelEntry[] {
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

    return parsed.flatMap((rawItem): SidePanelEntry[] => {
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

function readSideItemsFromKey(storageKey: string): SidePanelEntry[] {
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

function writeSideActiveIndexForUser(storageKey: string, index: number): void {
    writeSideStorageValue(storageKey, JSON.stringify(index));
}

function isSideEntryPersisted(entry: SidePanelEntry): boolean {
    return entry.type === "url" || entry.note !== null;
}

function getPersistedActiveIndex(
    items: SidePanelEntry[],
    activeIndex: number
): number {
    const safeIndex = clampActiveIndex(activeIndex, items.length);
    const serializedPosition = items
        .slice(0, safeIndex)
        .filter(isSideEntryPersisted).length;
    const serializedLength = items.filter(isSideEntryPersisted).length;
    return clampActiveIndex(serializedPosition, serializedLength);
}

function writeSideItemsForUser(
    storageKey: string,
    items: SidePanelEntry[]
): void {
    writeSideStorageValue(
        storageKey,
        JSON.stringify(items.filter(isSideEntryPersisted))
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

function normalizeDraft(draft: EditorDraft): EditorDraft {
    return {
        contentHtml: normalizeHtml(draft.contentHtml),
        contentState: draft.contentState,
    };
}

function editorDraftFromEditorState(
    contentState: SerializedEditorState
): EditorDraft {
    return normalizeDraft({
        contentHtml: serializeEditorStateToHtml(contentState),
        contentState,
    });
}

function editorDraftFromItem(note: SidePanelNote | null): EditorDraft {
    const contentState = isSerializedEditorState(note?.noteContentState)
        ? note.noteContentState
        : null;

    if (contentState) {
        return editorDraftFromEditorState(contentState);
    }

    return normalizeDraft({
        contentHtml: note?.noteContentHtml ?? NOTE_EMPTY_HTML,
        contentState: null,
    });
}

function getEditorTextMetrics(contentHtml: string): EditorTextMetrics {
    const plainText = extractNoteText(contentHtml);
    const matchedBlocks = contentHtml.match(EDITOR_NON_EMPTY_BLOCK_TAG_REGEX);
    const wordCount =
        plainText.length === 0
            ? 0
            : plainText.split(EDITOR_WORD_SEPARATOR).filter(Boolean).length;
    const paragraphCount =
        plainText.length === 0 ? 0 : Math.max(1, matchedBlocks?.length ?? 0);

    return {
        characterCount: plainText.length,
        paragraphCount,
        plainText,
        readMinuteCount: Math.ceil(wordCount / EDITOR_READING_WORDS_PER_MINUTE),
        wordCount,
    };
}

function haveDraftsChanged(left: EditorDraft, right: EditorDraft): boolean {
    return normalizeHtml(left.contentHtml) !== normalizeHtml(right.contentHtml);
}

function isDraftEmpty(draft: EditorDraft): boolean {
    return extractNoteText(draft.contentHtml).length === 0;
}

function shouldCloseWithoutSaving(
    currentDraft: EditorDraft,
    initialDraft: EditorDraft,
    hasPersistedNote: boolean
): boolean {
    if (!haveDraftsChanged(currentDraft, initialDraft)) {
        return true;
    }
    return !hasPersistedNote && isDraftEmpty(currentDraft);
}

interface EditorDraftSync {
    nextDraft: EditorDraft;
    shouldReset: boolean;
}

// Decides what an incoming note prop means for the mounted editor. A save
// echoes the note back through the store, so a draft the user is ahead of
// must survive that echo; anything else that differs resets the session.
function resolveEditorDraftSync(
    note: SidePanelNote | null,
    savedNoteId: string | null,
    latestDraft: EditorDraft,
    initialDraft: EditorDraft
): EditorDraftSync {
    const nextDraft = editorDraftFromItem(note);
    const noteId = note?.id ?? null;
    const shouldPreserveLocalDraft =
        noteId !== null &&
        noteId === savedNoteId &&
        haveDraftsChanged(latestDraft, initialDraft) &&
        haveDraftsChanged(nextDraft, latestDraft);

    return {
        nextDraft,
        shouldReset:
            !shouldPreserveLocalDraft &&
            haveDraftsChanged(nextDraft, latestDraft),
    };
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

function preserveEditorSelection(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
}

function getSelectionBlockType(selection: RangeSelection): EditorBlockType {
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
    initialDraft: EditorDraft
): InitialEditorStateType {
    if (initialDraft.contentState) {
        return JSON.stringify(initialDraft.contentState);
    }

    if (normalizeHtml(initialDraft.contentHtml) === NOTE_EMPTY_HTML) {
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

function createEditorSessionExtension(initialDraft: EditorDraft) {
    return defineExtension({
        $initialEditorState: getInitialEditorState(initialDraft),
        dependencies: [EDITOR_EXTENSION],
        name: `${EDITOR_NAMESPACE}-session`,
        namespace: EDITOR_NAMESPACE,
    });
}

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
        items: [] as SidePanelEntry[],
    },
    ({ actions, getState }) => ({
        openWithEntry(entry: SidePanelEntry) {
            const { items } = getState();
            const tabs = addSideTabEntry(items, entry);

            actions.setItems(tabs.items);
            actions.setActiveIndex(tabs.activeIndex);
            actions.setIsOpen(true);
        },
        removeTabById(id: string) {
            const { activeIndex, items } = getState();
            const tabs = removeSideTabEntry(
                items,
                activeIndex,
                items.findIndex((item) => item.id === id)
            );
            if (!tabs) {
                return;
            }
            actions.setItems(tabs.items);
            actions.setActiveIndex(tabs.activeIndex);
        },
        selectTabIndex(index: number) {
            const { items } = getState();
            if (index < 0 || index >= items.length) {
                return;
            }
            actions.setActiveIndex(index);
        },
        updateNoteEntry(id: string, note: SidePanelNote) {
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

            const nextEntry: SidePanelNoteEntry = { ...currentEntry, note };
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

function useRecentSideItems(): LibraryItemWithCollections[] {
    const { items } = useItemsStateContext();
    const { lastVisitedItemIds } = useLastVisited();
    const itemsById = new Map(items.map((item) => [item.id, item]));

    const recentItems: LibraryItemWithCollections[] = [];
    for (const itemId of lastVisitedItemIds) {
        if (recentItems.length === SIDE_RECENT_ITEMS_LIMIT) {
            break;
        }
        const item = itemsById.get(itemId);
        if (item?.kind === ITEM_KIND_BOOKMARK) {
            recentItems.push(item);
        }
    }
    return recentItems;
}

function useRecentItemView(item: LibraryItemWithCollections) {
    const caption = item.caption?.trim() || null;
    const title = caption ?? item.url;
    const label = caption ?? parseDisplayUrl(item.url);

    const handleOpen = useStableCallback(() => {
        openSidePanel({
            title,
            url: item.url,
        });
    });

    return { handleOpen, label, title };
}

function useUrlStatus(url: string | null) {
    const oembedUrl = url !== null && hasOembedSupport(url) ? url : null;
    const { data, error, mutate } = useOembed(oembedUrl);

    const timeout = useTimeout();
    const [iframeStatus, setIframeStatus] = React.useState<IframeStatus>(() =>
        url ? (SIDE_IFRAME_STATUS_CACHE.get(url) ?? "pending") : "pending"
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
            SIDE_IFRAME_STATUS_CACHE.delete(url);
        }
        setIframeStatus("pending");
        setAttempt((current) => current + 1);
        mutate();
    });

    React.useEffect(() => {
        if (url && (iframeStatus === "loaded" || iframeStatus === "blocked")) {
            SIDE_IFRAME_STATUS_CACHE.set(url, iframeStatus);
        }
    }, [url, iframeStatus]);

    // An oEmbed hit stops the iframe, so the timeout only guards the direct
    // iframe path. The hook mounts per active tab, so each tab gets the full
    // deadline from mount.
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

function useSideTab(): void {
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
            const tabs = addSideTabEntry(mergedItems, entry);
            mergedItems = tabs.items;
            mergedIndex = tabs.activeIndex;
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

export function openSideNote(note: LibraryItemWithCollections | null) {
    const sideNote = note ? toSideNote(note) : null;
    sideStoreActions.openWithEntry({
        id: sideNote?.id ?? `new-note:${crypto.randomUUID()}`,
        note: sideNote,
        type: "note",
    });
}

export function openSidePanel(input: SidePanelUrlInput) {
    sideStoreActions.openWithEntry(createSideUrlEntry(input));
}

interface SidePanelProps extends React.PropsWithChildren {
    onSaveNote: EditorSaveHandler;
    onUrlPaste: (url: string) => Promise<void> | void;
}

export function SidePanel({
    children,
    onSaveNote,
    onUrlPaste,
}: SidePanelProps) {
    const noteCloseHandlersRef = useRefWithInit(
        () => new Map<string, () => void | Promise<void>>()
    ).current;

    const registerNoteClose = useStableCallback(
        (id: string, close: () => void | Promise<void>) => {
            noteCloseHandlersRef.set(id, close);
            return () => {
                if (noteCloseHandlersRef.get(id) === close) {
                    noteCloseHandlersRef.delete(id);
                }
            };
        }
    );

    const closeNoteTab = useStableCallback((id: string) => {
        sideStoreActions.removeTabById(id);
    });

    const onClosePreview = useStableCallback(() => {
        sideStoreActions.setIsOpen(false);
    });

    const requestCloseTab = useStableCallback((item: SidePanelEntry) => {
        if (item.type === "note") {
            const closeNote = noteCloseHandlersRef.get(item.id);
            if (closeNote) {
                Promise.resolve(closeNote()).catch((error: unknown) => {
                    log.error("Failed to close editor tab", {
                        error,
                        tabId: item.id,
                    });
                });
            }
            return;
        }
        sideStoreActions.removeTabById(item.id);
    });

    const contextValue: SidePanelContext = {
        closeNoteTab,
        onClosePreview,
        onSaveNote,
        onUrlPaste,
        registerNoteClose,
        requestCloseTab,
    };

    return <SidePanelContext value={contextValue}>{children}</SidePanelContext>;
}

export function SidePanelContent() {
    const gt = useGT();
    const { activeIndex, isOpen, items, selectTabIndex, setIsOpen } =
        useSideStore();
    const { data: session } = useSession();
    const userId = session?.user?.id ?? null;

    useSideTab();

    const safeActiveIndex = clampActiveIndex(activeIndex, items.length);
    const activeEntry = items[safeActiveIndex] ?? null;
    const tabValue = isOpen && activeEntry ? getSideTabId(activeEntry) : null;

    const asideRef = useRef<HTMLElement | null>(null);
    const invokerRef = useRef<HTMLElement | null>(null);
    const prevIsOpenRef = useRef(isOpen);

    const handleToggleShortcut = useStableCallback(() => {
        setIsOpen((prev) => !prev);
    });

    useHotkeys("mod+j, mod+i, mod+enter", handleToggleShortcut, {
        description: gt("Open or close preview"),
        preventDefault: true,
    });

    const handleKeyDown = useStableCallback(
        (event: React.KeyboardEvent<HTMLElement>) => {
            if (event.key === "Escape" && !event.defaultPrevented) {
                setIsOpen(false);
            }
        }
    );

    const handleValueChange = useStableCallback((value: unknown) => {
        if (typeof value !== "string") {
            return;
        }
        const index = items.findIndex((item) => getSideTabId(item) === value);
        if (index !== -1) {
            selectTabIndex(index);
        }
    });

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
        trackInvoker(activeElement(doc));
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
            // Editor tabs move focus into the editor on activation. Only move
            // focus here for URL tabs so Escape on the aside stays reachable
            // and mobile screen readers enter the fixed panel.
            if (activeEntry?.type === "url") {
                const tab = doc.querySelector<HTMLElement>(
                    `#${CSS.escape(getSideTabId(activeEntry))}`
                );
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
        const focusedElement = activeElement(doc);
        if (contains(aside, focusedElement)) {
            if (
                invoker?.isConnected &&
                invoker !== doc.body &&
                invoker !== doc.documentElement
            ) {
                invoker.focus({ preventScroll: true });
            } else {
                doc.querySelector<HTMLElement>(
                    '[data-slot="side-trigger"]'
                )?.focus({ preventScroll: true });
            }
        }
    }, [isOpen, activeEntry]);

    return (
        <aside
            aria-hidden={!isOpen}
            aria-label={gt("Preview")}
            className={cn(
                "group/side bg-background relative z-50 flex min-h-0 shrink-0 flex-col overflow-hidden border-s transition-[width,transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
                "fixed inset-y-0 right-0 w-[calc(100%-3rem)] max-w-lg data-[state=collapsed]:translate-x-full",
                "lg:w-1/2 lg:max-w-full",
                "lg:sticky lg:top-0 lg:right-auto lg:h-dvh lg:max-h-dvh lg:translate-x-0 lg:data-[state=collapsed]:w-0 lg:data-[state=collapsed]:border-transparent lg:data-[state=collapsed]:opacity-0"
            )}
            data-side="right"
            data-slot="side"
            data-state={isOpen ? "expanded" : "collapsed"}
            inert={!isOpen}
            onKeyDown={handleKeyDown}
            ref={asideRef}
        >
            <Tabs.Root
                className="flex h-full min-h-0 min-w-0 flex-1 flex-col"
                onValueChange={handleValueChange}
                value={tabValue}
            >
                <SidePanelTabBar userId={userId} />
                <SidePanelList>
                    {(item, isActive) => (
                        <SidePanelListItem
                            isActive={isActive}
                            item={item}
                            key={item.id}
                        />
                    )}
                </SidePanelList>
            </Tabs.Root>
        </aside>
    );
}

export function SidePanelTrigger() {
    const gt = useGT();
    const { isOpen, setIsOpen } = useSideStore();

    const controlKey = getSystemControlKey();
    const shortcut = `${controlKey}J / ${controlKey}I`;
    const triggerTitle = isOpen
        ? gt("Close preview ({shortcut})", { shortcut })
        : gt("Open preview ({shortcut})", { shortcut });

    const handleClick = useStableCallback(() => {
        setIsOpen((prev) => !prev);
    });

    return (
        <Button
            className={cn(
                "fixed top-2 right-0.5 z-50 opacity-80 hover:opacity-100 lg:right-2",
                isOpen ? "cursor-e-resize" : "cursor-w-resize"
            )}
            data-slot="side-trigger"
            onClick={handleClick}
            size="icon-sm"
            title={triggerTitle}
            variant={isOpen ? "secondary" : "ghost"}
        >
            <PanelRight aria-hidden className="size-4" focusable="false" />
        </Button>
    );
}

interface SidePanelTabBarProps {
    userId: string | null;
}

function SidePanelTabBar({ userId }: SidePanelTabBarProps) {
    const { activeIndex, isOpen, items } = useSideStore();

    const sideTabUrls = isOpen
        ? items.flatMap((item) => (item.type === "url" ? [item.url] : []))
        : [];
    const faviconsByUrl = useFavicon(
        userId,
        sideTabUrls.length > 0 ? sideTabUrls : null
    );

    const safeActiveIndex = clampActiveIndex(activeIndex, items.length);
    const activeEntry = items[safeActiveIndex] ?? null;

    return (
        <div
            className={cn("flex min-w-0 shrink-0 flex-col gap-2 p-2 pr-10", {
                "p-0": !activeEntry,
            })}
        >
            <div className="flex max-w-full min-w-0 flex-nowrap items-center gap-1">
                <SidePanelTabsList
                    items={items}
                    trailingAction={
                        activeEntry ? <SidePanelTabNewMenu /> : null
                    }
                >
                    {(item, index) => (
                        <SidePanelTabsListItem
                            faviconUrl={
                                item.type === "url"
                                    ? (faviconsByUrl[item.url] ?? null)
                                    : null
                            }
                            isActive={index === safeActiveIndex}
                            item={item}
                            key={item.id}
                        />
                    )}
                </SidePanelTabsList>
                {activeEntry?.type === "url" ? (
                    <SidePanelTabCopyLinkButton
                        key={activeEntry.url}
                        url={activeEntry.url}
                    />
                ) : null}
            </div>
        </div>
    );
}

interface SidePanelListProps {
    children: (item: SidePanelEntry, isActive: boolean) => ReactNode;
}

function SidePanelList({ children }: SidePanelListProps) {
    const { activeIndex, isOpen, items } = useSideStore();

    const safeActiveIndex = clampActiveIndex(activeIndex, items.length);
    const activeEntry = items[safeActiveIndex] ?? null;
    const activeId = isOpen ? (activeEntry?.id ?? null) : null;

    return (
        <>
            {/* Keep every editor session mounted so tab switches preserve editor history. */}
            {items.map((item) => children(item, item.id === activeId))}
            {activeId === null && isOpen ? <SidePanelEmpty /> : null}
        </>
    );
}

interface SidePanelItemProps {
    isActive: boolean;
    item: SidePanelEntry;
}

function SidePanelListItem({ isActive, item }: SidePanelItemProps) {
    if (item.type === "note") {
        return (
            <Tabs.Panel
                className="relative flex min-h-0 min-w-0 flex-1 flex-col"
                keepMounted
                value={getSideTabId(item)}
            >
                <EditorRoot
                    isActive={isActive}
                    note={item.note}
                    tabId={item.id}
                >
                    <ScrollArea className="min-w-0 flex-1">
                        <div className="w-full min-w-0 p-4 pt-0">
                            <div className="mt-2 mb-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                <EditorFormatControls />
                                <EditorExportControls />
                            </div>
                            <EditorContent />
                            <EditorFooter />
                        </div>
                    </ScrollArea>
                </EditorRoot>
            </Tabs.Panel>
        );
    }

    return (
        <Tabs.Panel
            className="relative min-h-0 min-w-0 flex-1"
            keepMounted
            value={getSideTabId(item)}
        >
            {isActive ? <SidePanelUrl entry={item} /> : null}
        </Tabs.Panel>
    );
}

interface SidePanelUrlProps {
    entry: SidePanelUrlEntry;
}

function SidePanelUrl({ entry }: SidePanelUrlProps) {
    const gt = useGT();
    const { attempt, markAsBlocked, markAsLoaded, oembed, retry, status } =
        useUrlStatus(entry.url);

    const isLoading = status === "loading";
    const isBlocked = status === "blocked";
    const isOembed = status === "oembed";

    return (
        <>
            {isLoading ? <SidePanelLoading /> : null}
            {isBlocked ? (
                <SidePanelBlocked onRetry={retry} url={entry.url} />
            ) : null}
            {isOembed && oembed ? (
                <SidePanelOembedPreview oembed={oembed} />
            ) : null}
            {isBlocked || isOembed ? null : (
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: resource load/error lifecycle is not user interaction; upstream jsx-a11y exempts iframe onError/onLoad
                <iframe
                    allow={OEMBED_IFRAME_ALLOW}
                    allowFullScreen
                    className="bg-background size-full border-0"
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
                        className="text-muted-foreground relative z-20 size-5.5"
                        focusable="false"
                    />
                </Placeholder>
            </div>
            {recentItems.length > 0 ? (
                <section className="shrink-0 border-t p-4">
                    <h2 className="text-foreground text-sm font-medium">
                        <T>Recents</T>
                    </h2>
                    <ul className="mt-2 flex list-none flex-col gap-1">
                        {recentItems.map((item) => (
                            <SidePanelRecentItem item={item} key={item.id} />
                        ))}
                    </ul>
                </section>
            ) : null}
        </div>
    );
}

interface SidePanelRecentItemProps {
    item: LibraryItemWithCollections;
}

function SidePanelRecentItem({ item }: SidePanelRecentItemProps) {
    const gt = useGT();
    const { handleOpen, label, title } = useRecentItemView(item);

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

interface SidePanelOembedPreviewProps {
    oembed: Oembed;
}

function SidePanelOembedPreview({ oembed }: SidePanelOembedPreviewProps) {
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
            className="bg-background size-full border-0"
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

interface SidePanelTabsListProps {
    children: (item: SidePanelEntry, index: number) => ReactNode;
    items: SidePanelEntry[];
    trailingAction: ReactNode;
}

function SidePanelTabsList({
    children,
    items,
    trailingAction,
}: SidePanelTabsListProps) {
    return (
        <div className="flex min-w-0 flex-1 items-center gap-1">
            <ScrollAreaRoot className="h-fit min-w-0 flex-1">
                <Tabs.List
                    activateOnFocus
                    className="flex min-w-full items-center gap-1"
                    render={<ScrollAreaViewport />}
                >
                    {items.map(children)}
                </Tabs.List>
                <ScrollBar orientation="horizontal" />
            </ScrollAreaRoot>
            {trailingAction}
        </div>
    );
}

interface SidePanelTabsListItemProps {
    faviconUrl: string | null;
    isActive: boolean;
    item: SidePanelEntry;
}

function SidePanelTabsListItem({
    faviconUrl,
    isActive,
    item,
}: SidePanelTabsListItemProps) {
    const gt = useGT();
    const { requestCloseTab } = useSidePanelContext();

    const entryTitle = getSideEntryTitle(item);
    let title: string;
    if (entryTitle !== null) {
        title = truncateLabel(entryTitle);
    } else if (item.type === "note") {
        title = item.note ? gt("Untitled") : gt("New");
    } else {
        title = gt("Preview");
    }
    const closeLabel = gt("Close {title}", { title });

    const handleRemove = useStableCallback(() => {
        requestCloseTab(item);
    });

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
                "relative flex max-w-48 min-w-24 flex-1 basis-0 items-center rounded-lg",
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
                    <SidePanelTabFavicon
                        faviconSrc={faviconUrl}
                        key={faviconUrl ?? "globe"}
                    />
                )}
                <TextMorph className="min-w-0 flex-1 truncate text-left font-medium">
                    {title}
                </TextMorph>
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

interface SidePanelTabFaviconProps {
    faviconSrc: string | null;
}

function SidePanelTabFavicon({ faviconSrc }: SidePanelTabFaviconProps) {
    const [hasFailed, setHasFailed] = useState(false);

    const handleError = useStableCallback(() => setHasFailed(true));

    // `key={faviconUrl}` on the parent remounts this component when the URL
    // changes, so `hasFailed` resets without an effect.
    const showFavicon = !!faviconSrc && !hasFailed;

    return (
        <span aria-hidden className="size-3.5 shrink-0">
            {showFavicon ? (
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: image load errors are resource lifecycle events, not user interactions.
                <img
                    alt=""
                    className="size-full object-contain"
                    draggable={false}
                    height={14}
                    loading="lazy"
                    onError={handleError}
                    src={`/api/preview?url=${encodeURIComponent(faviconSrc)}`}
                    width={14}
                />
            ) : (
                <Globe className="size-full" focusable="false" />
            )}
        </span>
    );
}

interface SidePanelTabCopyLinkButtonProps {
    url: string;
}

function SidePanelTabCopyLinkButton({ url }: SidePanelTabCopyLinkButtonProps) {
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

function SidePanelTabNewMenu() {
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
                        className="text-muted-foreground size-4"
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
                            <SidePanelNewMenuItem item={item} key={item.id} />
                        ))
                    ) : (
                        <MenuItem disabled>
                            <span className="text-muted-foreground flex-1">
                                <T>No recent tabs</T>
                            </span>
                        </MenuItem>
                    )}
                </MenuGroup>
            </MenuPopup>
        </Menu>
    );
}

interface SidePanelNewMenuItemProps {
    item: LibraryItemWithCollections;
}

function SidePanelNewMenuItem({ item }: SidePanelNewMenuItemProps) {
    const gt = useGT();
    const { handleOpen, label, title } = useRecentItemView(item);

    return (
        <MenuItem onClick={handleOpen} title={item.url}>
            <Globe
                aria-hidden
                className="text-muted-foreground size-4 shrink-0"
                focusable="false"
            />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="sr-only">
                {gt("Open {title} in Side", { title })}
            </span>
        </MenuItem>
    );
}

function SidePanelLoading() {
    return (
        <div
            aria-live="polite"
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 text-center"
            role="status"
        >
            <Spinner className="text-muted-foreground size-5" />
            <div className="space-y-1">
                <p className="text-foreground text-sm font-medium">
                    <T>Loading preview…</T>
                </p>
                <p className="text-muted-foreground max-w-sm text-sm text-balance">
                    <T>Opening the page.</T>
                </p>
            </div>
        </div>
    );
}

interface SidePanelBlockedProps {
    onRetry: () => void;
    url: string;
}

function SidePanelBlocked({ onRetry, url }: SidePanelBlockedProps) {
    return (
        <div
            aria-live="assertive"
            className="flex size-full flex-col items-center justify-center gap-4 px-6 text-center"
            role="alert"
        >
            <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
                <AlertCircleIcon className="size-5" />
            </div>
            <div className="space-y-2">
                <p className="text-foreground text-base font-medium">
                    <T>Preview unavailable</T>
                </p>
                <p className="text-muted-foreground max-w-md text-sm text-balance">
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

interface EditorRootProps {
    children: ReactNode;
    isActive: boolean;
    note: SidePanelNote | null;
    tabId: string;
}

function EditorRoot({ children, isActive, note, tabId }: EditorRootProps) {
    const {
        closeNoteTab,
        onClosePreview,
        onSaveNote,
        onUrlPaste,
        registerNoteClose,
    } = useSidePanelContext();
    const [initialDraft, setInitialDraft] = useState<EditorDraft>(() =>
        editorDraftFromItem(note)
    );
    const [draft, setDraft] = useState<EditorDraft>(initialDraft);
    // The extension object carries the initial editor state, so a reset must
    // swap both atomically. One state keeps the key and the extension in
    // agreement with no render-phase sync.
    const [session, setSession] = useState(() => ({
        extension: createEditorSessionExtension(initialDraft),
        key: 0,
    }));
    const isClosingRef = useRef(false);
    const contentEditableRef = useRef<HTMLDivElement | null>(null);

    const initialDraftRef = useRef<EditorDraft>(draft);
    const latestDraftRef = useRef<EditorDraft>(draft);

    const noteId = note?.id ?? null;
    const savedNoteIdRef = useRef<string | null>(noteId);

    const [prevNote, setPrevNote] = useState(note);

    if (!Object.is(note, prevNote)) {
        setPrevNote(note);
        const sync = resolveEditorDraftSync(
            note,
            savedNoteIdRef.current,
            latestDraftRef.current,
            initialDraftRef.current
        );
        setInitialDraft(sync.nextDraft);

        if (sync.shouldReset) {
            setDraft(sync.nextDraft);
            setSession((current) => ({
                extension: createEditorSessionExtension(sync.nextDraft),
                key: current.key + 1,
            }));
        }
    }

    useIsoLayoutEffect(() => {
        savedNoteIdRef.current = noteId;
        initialDraftRef.current = initialDraft;
        latestDraftRef.current = draft;
    }, [noteId, initialDraft, draft]);

    const handleDraftChange = useStableCallback((nextDraft: EditorDraft) => {
        const normalizedDraft = normalizeDraft(nextDraft);
        if (!haveDraftsChanged(normalizedDraft, latestDraftRef.current)) {
            return;
        }
        latestDraftRef.current = normalizedDraft;
        setDraft(normalizedDraft);
    });

    const handleSave = useStableCallback(
        async (draftToSave: EditorDraft, targetNoteId: string | null) => {
            const savedNote = await onSaveNote(draftToSave, targetNoteId);
            if (savedNote) {
                const nextNote = toSideNote(savedNote);
                if (!areSideNotesEqual(note, nextNote)) {
                    sideStoreActions.updateNoteEntry(tabId, nextNote);
                }
            }
            return savedNote;
        }
    );

    const handleUrlPaste = useStableCallback(async (url: string) => {
        await onUrlPaste(url);
        closeNoteTab(tabId);
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
            return draftToSave.contentHtml;
        }

        const savedNote = await handleSave(draftToSave, savedNoteIdRef.current);
        if (!savedNote) {
            return false;
        }

        savedNoteIdRef.current = savedNote.id;
        initialDraftRef.current = draftToSave;
        setInitialDraft(draftToSave);

        return draftToSave.contentHtml;
    });

    const {
        isDirty,
        saveImmediately,
        status: saveStatus,
    } = useAutosave({
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
            closeNoteTab(tabId);
            return;
        }

        isClosingRef.current = true;
        try {
            const isSaved = await saveImmediately();
            if (isSaved) {
                closeNoteTab(tabId);
            }
        } finally {
            isClosingRef.current = false;
        }
    });

    // The tab's close button removes this panel, so the registered handler
    // must flush the draft first: only this component owns the save state.
    useIsoLayoutEffect(
        () => registerNoteClose(tabId, handleClose),
        [handleClose, registerNoteClose, tabId]
    );

    const handleEnterShortcut = useStableCallback((event: KeyboardEvent) => {
        if (
            event.defaultPrevented ||
            event.isComposing ||
            event.key !== "Enter"
        ) {
            return;
        }

        const isToggleShortcut =
            (event.metaKey || event.ctrlKey) &&
            !event.altKey &&
            !event.shiftKey;

        if (!isToggleShortcut) {
            return;
        }

        event.preventDefault();
        // Stop modified Enter before Lexical runs its block-splitting handler
        // and before the global toggle shortcut sees the same keystroke.
        event.stopPropagation();
        saveImmediately().then(
            () => {
                onClosePreview();
            },
            (error: unknown) => {
                log.error("Unexpected note shortcut close failure", error);
                onClosePreview();
            }
        );
    });

    // The keydown listener lives on the owner document of the editor, so the
    // shortcut works from anywhere in an active editor tab.
    useEffect(() => {
        if (!isActive) {
            return;
        }

        const ownerDocument = getOwnerDocument(contentEditableRef.current);
        ownerDocument.addEventListener("keydown", handleEnterShortcut, true);
        return () => {
            ownerDocument.removeEventListener(
                "keydown",
                handleEnterShortcut,
                true
            );
        };
    }, [handleEnterShortcut, isActive]);

    const textMetrics = getEditorTextMetrics(draft.contentHtml);

    const actionsContextValue = useRefWithInit(() => ({
        contentEditableRef,
        onDraftChange: handleDraftChange,
        onUrlPaste: handleUrlPaste,
        shouldCreateBookmarkFromUrlPaste,
    })).current;

    const draftContextValue: EditorDraftContext = {
        contentHtml: draft.contentHtml,
        isDirty,
        noteId,
        saveStatus,
        textMetrics,
    };

    return (
        <LexicalExtensionComposer
            contentEditable={null}
            extension={session.extension}
            key={session.key}
        >
            <EditorActionsContext value={actionsContextValue}>
                <EditorDraftContext value={draftContextValue}>
                    {children}
                </EditorDraftContext>
            </EditorActionsContext>
        </LexicalExtensionComposer>
    );
}

function EditorExportControls() {
    const gt = useGT();
    const { contentHtml, noteId, textMetrics } = useEditorDraftContext();
    const { plainText } = textMetrics;
    const { copyToClipboard, isCopied } = useCopyToClipboard();
    const { items } = useItemsStateContext();

    const [isSendingToNotion, startSendToNotion] = useTransition();
    const [notionStatus, setNotionStatus] = useState<{
        message: string;
        tone: "error" | "success";
    } | null>(null);

    const hasPlainText = plainText.length > 0;

    // Collection assignment needs the persisted library item, so an unsaved
    // draft offers no combobox until its first autosave creates the note.
    const noteItem =
        noteId === null
            ? null
            : (items.find((item) => item.id === noteId) ?? null);

    const assignedCollectionCount = noteItem?.collections.length ?? 0;
    const assignCollectionsLabel =
        assignedCollectionCount === 0
            ? gt("Assign collections")
            : gt("Change or add collections ({count} selected)", {
                  count: assignedCollectionCount,
              });

    const handleCopyNote = useStableCallback(() => {
        if (!hasPlainText) {
            return;
        }
        copyToClipboard(plainText);
    });

    const handleExportMarkdown = useStableCallback(() => {
        const markdown = convertNoteHtmlToMarkdown(contentHtml);
        const blob = new Blob([markdown], { type: "text/markdown" });
        saveFile(blob, {
            description: gt("Markdown file"),
            extension: "md",
            name: slugify(getNotionNoteTitle(plainText)) || "note",
        }).catch((error: unknown) => {
            log.error("Unexpected Markdown export failure", error);
        });
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
            <EditorStatus />
            {noteItem ? (
                <ItemCollectionsCombobox
                    items={[noteItem]}
                    render={
                        <Button
                            aria-label={assignCollectionsLabel}
                            size="icon-sm"
                            variant="ghost"
                        />
                    }
                />
            ) : null}
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
                        <EditorExportMenuItem
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
                        <NotionIcon className="text-muted-foreground size-4" />
                        <TextMorph className="flex-1">
                            {isSendingToNotion
                                ? gt("Sending to Notion…")
                                : gt("Send to Notion")}
                        </TextMorph>
                        <ExternalLinkIcon className="text-muted-foreground size-4" />
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
                        <FileTextIcon className="text-muted-foreground size-4" />
                        <span className="flex-1">
                            <T>Export to Markdown</T>
                        </span>
                        <DownloadIcon className="text-muted-foreground size-4" />
                    </MenuItem>
                </MenuPopup>
            </Menu>
        </div>
    );
}

function EditorFooter() {
    const { textMetrics } = useEditorDraftContext();

    const shouldShowReadTime = textMetrics.readMinuteCount >= 2;
    const closeShortcut = `${getSystemControlKey()}+Enter`;

    return (
        <div className="border-border/60 text-muted-foreground mt-3 flex items-center justify-end gap-4 border-t pt-3 text-xs">
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

function EditorStatus() {
    const gt = useGT();
    const { isDirty, saveStatus } = useEditorDraftContext();

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
        <span
            aria-live={isError ? "assertive" : "polite"}
            className={cn(
                "px-1 text-xs",
                isError ? "text-destructive" : "text-muted-foreground"
            )}
            role={isError ? "alert" : "status"}
        >
            <TextMorph>{message}</TextMorph>
        </span>
    );
}

interface EditorExportMenuItemProps {
    hasPlainText: boolean;
    plainText: string;
    provider: EditorExportProvider;
}

function EditorExportMenuItem({
    hasPlainText,
    plainText,
    provider,
}: EditorExportMenuItemProps) {
    const gt = useGT();

    const ProviderIcon = provider.icon;
    const href = provider.createUrl(plainText);

    let label: string;
    switch (provider.id) {
        case "chatgpt":
            label = gt("Open in ChatGPT");
            break;
        case "claude":
            label = gt("Open in Claude");
            break;
        case "codex":
            label = gt("Open in Codex");
            break;
        case "cursor":
            label = gt("Open in Cursor");
            break;
        case "google-docs":
            label = gt("Open in Google Docs");
            break;
        case "t3-chat":
            label = gt("Open in T3 Chat");
            break;
        case "v0":
            label = gt("Open in v0");
            break;
        default:
            throw new Error(
                `Unknown export provider: ${provider.id satisfies never}`
            );
    }

    return (
        <MenuItem
            disabled={!hasPlainText}
            render={<a href={href} rel="noopener noreferrer" target="_blank" />}
        >
            <ProviderIcon className="text-muted-foreground size-4" />
            <span className="flex-1">{label}</span>
            <ExternalLinkIcon className="text-muted-foreground size-4" />
        </MenuItem>
    );
}

function EditorFormatControls() {
    const gt = useGT();
    const [editor] = useLexicalComposerContext();
    const [formats, setFormats] =
        useState<EditorFormatState>(INITIAL_FORMAT_STATE);

    const rovingTabIndexRef = useLexicalRovingTabIndexRef();
    const focusManagerRef = useLexicalFocusManagerRef();
    const mergedRefs = useMergedRefs(rovingTabIndexRef, focusManagerRef);

    const commitFormats = useStableCallback(
        (nextFormats: EditorFormatState) => {
            setFormats((current) =>
                current.blockType === nextFormats.blockType &&
                current.bold === nextFormats.bold &&
                current.italic === nextFormats.italic &&
                current.strikethrough === nextFormats.strikethrough &&
                current.underline === nextFormats.underline
                    ? current
                    : nextFormats
            );
        }
    );

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
            ref={mergedRefs}
            role="toolbar"
        >
            {EDITOR_BLOCK_VALUES.map((value) => (
                <EditorBlockTypeButton
                    isActive={formats.blockType === value}
                    key={value}
                    value={value}
                />
            ))}
            {EDITOR_TEXT_FORMAT_OPTIONS.map((option) => (
                <EditorInlineFormatButton
                    isActive={formats[option.format]}
                    key={option.format}
                    option={option}
                />
            ))}
        </div>
    );
}

interface EditorBlockTypeButtonProps {
    isActive: boolean;
    value: EditorBlockType;
}

function EditorBlockTypeButton({
    isActive,
    value,
}: EditorBlockTypeButtonProps) {
    const gt = useGT();
    const [editor] = useLexicalComposerContext();

    const handleClick = useStableCallback(() => {
        editor.update(() => {
            const selection = $getSelection();
            if (!$isRangeSelection(selection)) {
                return;
            }
            if (value === "paragraph") {
                $setBlocksType(selection, () => $createParagraphNode());
                return;
            }
            $setBlocksType(selection, () => $createHeadingNode(value));
        });
    });

    let ariaLabel: string;
    let label: string;
    switch (value) {
        case "h1":
            ariaLabel = gt("Heading 1");
            label = "H1";
            break;
        case "h2":
            ariaLabel = gt("Heading 2");
            label = "H2";
            break;
        case "h3":
            ariaLabel = gt("Heading 3");
            label = "H3";
            break;
        case "paragraph":
            ariaLabel = gt("Paragraph");
            label = "Text";
            break;
        default:
            throw new Error(
                `Unknown note block type: ${value satisfies never}`
            );
    }

    return (
        <Button
            aria-label={ariaLabel}
            onClick={handleClick}
            onMouseDown={preserveEditorSelection}
            size="xs"
            variant={isActive ? "secondary" : "ghost"}
        >
            {label}
        </Button>
    );
}

interface EditorInlineFormatButtonProps {
    isActive: boolean;
    option: (typeof EDITOR_TEXT_FORMAT_OPTIONS)[number];
}

function EditorInlineFormatButton({
    isActive,
    option,
}: EditorInlineFormatButtonProps) {
    const gt = useGT();
    const [editor] = useLexicalComposerContext();

    const Icon = option.icon;

    const handleClick = useStableCallback(() => {
        editor.dispatchCommand(FORMAT_TEXT_COMMAND, option.format);
    });

    let ariaLabel: string;
    const format = option.format;
    switch (format) {
        case "bold":
            ariaLabel = gt("Bold");
            break;
        case "italic":
            ariaLabel = gt("Italic");
            break;
        case "strikethrough":
            ariaLabel = gt("Strikethrough");
            break;
        case "underline":
            ariaLabel = gt("Underline");
            break;
        default:
            throw new Error(
                `Unknown note text format: ${format satisfies never}`
            );
    }

    return (
        <Button
            aria-label={ariaLabel}
            className={cn(isActive && "bg-accent")}
            onClick={handleClick}
            onMouseDown={preserveEditorSelection}
            size="icon-xs"
            variant="ghost"
        >
            <Icon className="size-4" />
        </Button>
    );
}

function EditorContent() {
    const { contentEditableRef } = useEditorActionsContext();

    return (
        <div className="relative min-h-96 w-full min-w-0 flex-1">
            <ContentEditable
                className={cn(
                    "prose prose-stone min-h-96 w-full max-w-full min-w-0 text-[15px] leading-7 wrap-anywhere whitespace-pre-wrap outline-none",
                    "prose-p:my-0 prose-p:min-h-[1.75rem]",
                    "prose-mark:rounded-sm prose-mark:bg-amber-200/90 prose-mark:px-0.5",
                    "prose-strong:font-semibold prose-em:italic prose-u:underline prose-s:line-through"
                )}
                ref={contentEditableRef}
            />
            <EditorPlaceholder />
            <EditorChangeReporter />
            <EditorUrlPasteHandler />
        </div>
    );
}

function EditorPlaceholder() {
    const [editor] = useLexicalComposerContext();
    const isEmpty = useLexicalIsTextContentEmpty(editor, true);
    const isEditable = useLexicalEditable();

    if (!(isEditable && isEmpty)) {
        return null;
    }

    return (
        <div
            aria-hidden
            className="text-muted-foreground pointer-events-none absolute inset-0 text-[15px] leading-7"
        >
            <T>Start writing, or paste a link to add</T>
        </div>
    );
}

function EditorChangeReporter() {
    const { onDraftChange } = useEditorActionsContext();

    const handleChange = useStableCallback((editorState: EditorState) => {
        onDraftChange(editorDraftFromEditorState(editorState.toJSON()));
    });

    return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />;
}

function EditorUrlPasteHandler() {
    const { onUrlPaste, shouldCreateBookmarkFromUrlPaste } =
        useEditorActionsContext();
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
            log.error("Unexpected editor URL paste failure", error);
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

    return null;
}
