"use client";

import { Tabs } from "@base-ui/react/tabs";
import { activeElement, contains, getTarget } from "@base-ui/utils/shadowDom";
import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useRefWithInit } from "@base-ui/utils/useRefWithInit";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import { cn } from "cn";
import { T, useGT } from "gt-next";
import type { SerializedEditorState } from "lexical";
import {
    AlertCircleIcon,
    CheckIcon,
    Copy,
    ExternalLinkIcon,
    Globe,
    PanelRight,
    PlusIcon,
    RotateCcwIcon,
    SquarePen,
    XIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import * as React from "react";
import {
    createContext,
    type ReactNode,
    use,
    useEffect,
    useRef,
    useState,
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
import { useCopyToClipboard } from "@/components/hooks/use-copy-to-clipboard";
import { useLastVisited } from "@/components/hooks/use-last-visited";
import { useItemsStateContext } from "@/components/session/items";
import { Button } from "@/components/ui/button";
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
import { getSystemControlKey } from "@/lib/common/keyboard";
import { createLogger } from "@/lib/common/logs/console/logger";
import { clamp } from "@/lib/common/number";
import { hasOembedSupport, type Oembed } from "@/lib/common/oembed";
import { isStorageQuotaExceededError } from "@/lib/common/storage";
import { isHttpUrl, parseDisplayUrl, parseValidUrl } from "@/lib/common/url";
import { normalizeHtml } from "@/lib/notes/utils";

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

type IframeStatus = "pending" | "loaded" | "blocked";

type OembedStatus = "blocked" | "loaded" | "loading" | "oembed";

interface SidePanelUrlInput {
    title?: string | null;
    url: string;
}

export interface SidePanelNote {
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

export type EditorSaveHandler = (
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

const SidePanelContext = createContext<SidePanelContext | null>(null);

function useSidePanelContext(): SidePanelContext {
    const context = use(SidePanelContext);
    if (!context) {
        throw new Error("Side components must be used inside <SidePanel>.");
    }
    return context;
}

const LazyEditor = dynamic(
    () => import("./editor").then((module) => module.NoteEditor),
    { loading: EditorLoading }
);

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
                return;
            }
            sideStoreActions.removeTabById(item.id);
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
            {/* Keep activated editors mounted so tab switches preserve editor history. */}
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
        return <SidePanelNotePanel isActive={isActive} item={item} />;
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

interface SidePanelNotePanelProps {
    isActive: boolean;
    item: SidePanelNoteEntry;
}

function SidePanelNotePanel({ isActive, item }: SidePanelNotePanelProps) {
    const {
        closeNoteTab,
        onClosePreview,
        onSaveNote,
        onUrlPaste,
        registerNoteClose,
    } = useSidePanelContext();
    const [hasBeenActivated, setHasBeenActivated] = useState(isActive);

    if (isActive && !hasBeenActivated) {
        setHasBeenActivated(true);
    }

    const handleSaveNote = useStableCallback(
        async (draft: EditorDraft, noteId: string | null) => {
            const savedNote = await onSaveNote(draft, noteId);
            if (savedNote) {
                const nextNote = toSideNote(savedNote);
                if (!areSideNotesEqual(item.note, nextNote)) {
                    sideStoreActions.updateNoteEntry(item.id, nextNote);
                }
            }
            return savedNote;
        }
    );

    return (
        <Tabs.Panel
            className="relative flex min-h-0 min-w-0 flex-1 flex-col"
            keepMounted
            value={getSideTabId(item)}
        >
            {hasBeenActivated ? (
                <LazyEditor
                    closeNoteTab={closeNoteTab}
                    isActive={isActive}
                    note={item.note}
                    onClosePreview={onClosePreview}
                    onSaveNote={handleSaveNote}
                    onUrlPaste={onUrlPaste}
                    registerNoteClose={registerNoteClose}
                    tabId={item.id}
                />
            ) : null}
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

function EditorLoading() {
    return (
        <div
            aria-busy="true"
            className="flex min-h-96 flex-1 items-center justify-center"
            role="status"
        >
            <Spinner className="text-muted-foreground size-5" />
            <span className="sr-only">
                <T>Loading note editor…</T>
            </span>
        </div>
    );
}
