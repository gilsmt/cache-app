import type {
    ClipResponse,
    CreateCollectionResponse,
    ExtensionCollectionDto,
    ListCollectionsResponse,
} from "@/lib/api";
import {
    MESSAGE_TYPES,
    STORAGE_KEYS,
    isSocialImportUrl,
    isUnsupportedClipUrl,
} from "@/lib/runtime";
import cssText from "data-text:../popup.module.css";
import type { PlasmoCSConfig, PlasmoGetOverlayAnchor } from "plasmo";
import { useEffect, useId, useState } from "react";
import { CollectionCreateView } from "../collection-create-view";
import styles from "../popup.module.css";

export const config: PlasmoCSConfig = {
    matches: ["<all_urls>"],
};

export const getStyle = () => {
    const style = document.createElement("style");
    style.textContent = cssText;
    return style;
};

export const getOverlayAnchor: PlasmoGetOverlayAnchor = async () =>
    document.body;

function callBackground<T>(method: string, args?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: MESSAGE_TYPES.API_CALL, method, args },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (response?.error) {
                    reject(new Error(response.error));
                    return;
                }
                resolve(response?.data as T);
            },
        );
    });
}

function listCollections(): Promise<ListCollectionsResponse> {
    return callBackground("listCollections");
}

function createCollection(input: {
    name: string;
    description?: string;
}): Promise<CreateCollectionResponse> {
    return callBackground("createCollection", input);
}

function clipPage(input: {
    url: string;
    caption?: string;
    collectionIds: string[];
}): Promise<ClipResponse> {
    return callBackground("clipPage", input);
}

function sendRuntimeMessage<T extends Record<string, unknown>>(
    message: Record<string, unknown>,
): Promise<T> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve((response ?? {}) as T);
        });
    });
}

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
});

const POPUP_SUCCESS_CLOSE_DELAY_MS = 900;
const TITLE_MAX_LENGTH = 48;

type ActiveTab = {
    id: number | undefined;
    title: string;
    url: string;
};

type PopupViewState =
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "list" }
    | { kind: "create" }
    | { kind: "unsupported" }
    | { kind: "social" }
    | { kind: "unlinked" };

type LinkState = "unknown" | "unlinked" | "linked";

function truncateTitle(title: string, max = TITLE_MAX_LENGTH): string {
    if (title.length <= max) return title;
    return `${title.slice(0, max - 1)}…`;
}

function hostnameFromUrl(raw: string): string {
    try {
        return new URL(raw).hostname;
    } catch {
        return "";
    }
}

async function readLinkState(): Promise<LinkState> {
    const data = await chrome.storage.local.get([STORAGE_KEYS.syncApiKey]);
    const raw = data[STORAGE_KEYS.syncApiKey];
    const token = typeof raw === "string" ? raw.trim() : "";
    return token ? "linked" : "unlinked";
}

async function readLastClipCollectionIds(): Promise<string[]> {
    const data = await chrome.storage.local.get([
        STORAGE_KEYS.lastClipCollectionIds,
    ]);
    const stored = data[STORAGE_KEYS.lastClipCollectionIds];
    return Array.isArray(stored)
        ? stored.filter((id): id is string => typeof id === "string")
        : [];
}

async function persistLastClipCollectionIds(ids: string[]): Promise<void> {
    await chrome.storage.local.set({
        [STORAGE_KEYS.lastClipCollectionIds]: ids,
    });
}

async function openCacheInNewTab(): Promise<void> {
    const response = await sendRuntimeMessage<{ error?: string; ok?: boolean }>(
        { type: MESSAGE_TYPES.OPEN_CACHE_TAB },
    );
    if (response.error) {
        throw new Error(response.error);
    }
}

async function triggerSocialImport(tabId: number | undefined): Promise<void> {
    if (typeof tabId !== "number") {
        throw new Error("No active tab to import from.");
    }
    const response = await sendRuntimeMessage<{ error?: string; ok?: boolean }>({
        type: MESSAGE_TYPES.START_SYNC,
        tabId,
    });
    if (response.error) {
        throw new Error(response.error);
    }
}

function SearchField({
    value,
    onChange,
    disabled,
}: {
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
}): React.ReactElement {
    return (
        <div className={styles.searchRow}>
            <input
                type="text"
                className={styles.searchInput}
                placeholder="Search…"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}

function CollectionRow({
    collection,
    isSelected,
    onToggle,
}: {
    collection: ExtensionCollectionDto;
    isSelected: boolean;
    onToggle: (id: string) => void;
}): React.ReactElement {
    const handleClick = () => onToggle(collection.id);
    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onToggle(collection.id);
        }
    };
    return (
        <li
            className={`${styles.row} ${isSelected ? styles.rowChecked : ""}`}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="checkbox"
            aria-checked={isSelected}
            tabIndex={0}
        >
            <span className={styles.rowName}>
                {collection.name}
                <span className={styles.rowCount}>
                    {NUMBER_FORMATTER.format(collection.itemCount)}
                </span>
            </span>
            <span className={styles.rowCheck} aria-hidden="true">
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path
                        d="M2 5.5L4.5 8L9 3"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </span>
        </li>
    );
}

function ListSkeletons(): React.ReactElement {
    return (
        <ul className={styles.list} aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
                <li
                    key={i}
                    className={styles.skeletonRow}
                    style={{
                        width: `${70 + ((i * 13) % 30)}%`,
                    }}
                />
            ))}
        </ul>
    );
}

function PageInfo({ tab }: { tab: ActiveTab }): React.ReactElement {
    const [isOpen, setIsOpen] = useState(false);
    const hostname = hostnameFromUrl(tab.url);
    const truncatedTitle = tab.title ? truncateTitle(tab.title) : "";

    return (
        <div className={styles.pageInfo}>
            <button
                type="button"
                className={styles.pageInfoTrigger}
                onClick={() => setIsOpen((v) => !v)}
                aria-expanded={isOpen}
            >
                <span className={styles.pageInfoLabel}>
                    {hostname}
                    {truncatedTitle ? ` — ${truncatedTitle}` : ""}
                </span>
                <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    className={`${styles.pageInfoChevron} ${isOpen ? styles.pageInfoChevronOpen : ""}`}
                    aria-hidden="true"
                >
                    <path
                        d="M4 6l3 3 3-3"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>
            {isOpen ? (
                <div className={styles.pageInfoPanel}>
                    <p className={styles.pageInfoFullTitle}>
                        {tab.title || tab.url}
                    </p>
                    <p className={styles.pageInfoUrl}>{tab.url}</p>
                </div>
            ) : null}
        </div>
    );
}

function UnlinkedPanel(): React.ReactElement {
    const [error, setError] = useState<string | null>(null);

    const handleOpenCache = () => {
        setError(null);
        void openCacheInNewTab().catch((err: unknown) => {
            setError(
                err instanceof Error
                    ? err.message
                    : "Could not open Cache.",
            );
        });
    };

    return (
        <div className={styles.root}>
            <div className={styles.centerState}>
                <p className={styles.centerStateTitle}>Cache is not linked</p>
                <p className={styles.centerStateBody}>
                    Open Cache to link this browser. Sign in once and your
                    collections will appear here.
                </p>
                {error ? <p className={styles.inlineError}>{error}</p> : null}
                <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={handleOpenCache}
                >
                    Open Cache
                </button>
            </div>
        </div>
    );
}

function UnsupportedPanel({
    hostname,
}: {
    hostname: string;
}): React.ReactElement {
    return (
        <div className={styles.root}>
            <div className={styles.centerState}>
                <p className={styles.centerStateTitle}>
                    This page can&apos;t be saved
                </p>
                <p className={styles.centerStateBody}>
                    {hostname
                        ? `${hostname} cannot be read by extensions.`
                        : "Browser-internal pages cannot be read by extensions."}{" "}
                    Open a regular web page to save it into Cache.
                </p>
            </div>
        </div>
    );
}

function SocialImportPanel({ tab }: { tab: ActiveTab }): React.ReactElement {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState(false);
    const labelId = useId();

    const handleSubmit = () => {
        setError(null);
        setIsSubmitting(true);
        void triggerSocialImport(tab.id)
            .then(() => setDone(true))
            .catch((err: unknown) => {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Could not start import. Reopen the page and try again.",
                );
            })
            .finally(() => setIsSubmitting(false));
    };

    return (
        <div className={styles.root}>
            <div className={styles.centerState}>
                <p className={styles.centerStateTitle}>
                    Import this collection
                </p>
                <p className={styles.centerStateBody}>
                    {hostnameFromUrl(tab.url)} will be imported through
                    Cache&apos;s bulk social import. Smart Collections will
                    organize items once they land in your library.
                </p>
            </div>
            <div className={styles.footer}>
                {done ? (
                    <p className={styles.successBanner}>Import started.</p>
                ) : null}
                {error ? <p className={styles.inlineError}>{error}</p> : null}
                <button
                    aria-labelledby={labelId}
                    className={styles.primaryButton}
                    disabled={isSubmitting || done}
                    onClick={handleSubmit}
                    type="button"
                >
                    <span id={labelId}>
                        {isSubmitting ? "Importing…" : "Import to Cache"}
                    </span>
                </button>
            </div>
        </div>
    );
}

function PopupPanel({
    tab,
    onClose,
}: {
    tab: ActiveTab;
    onClose: () => void;
}): React.ReactElement {
    const [collections, setCollections] = useState<ExtensionCollectionDto[]>(
        [],
    );
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [view, setView] = useState<PopupViewState>({ kind: "loading" });
    const [search, setSearch] = useState("");
    const [clipError, setClipError] = useState<string | null>(null);
    const [isClipping, setIsClipping] = useState(false);
    const [clipSuccess, setClipSuccess] = useState(false);
    const clipLabelId = useId();

    const isUnsupported = isUnsupportedClipUrl(tab.url);
    const isSocial = !isUnsupported && isSocialImportUrl(tab.url);
    const shouldLoadCollections = !isUnsupported && !isSocial;

    const fetchCollections = async () => {
        setView({ kind: "loading" });
        setClipError(null);
        setClipSuccess(false);
        try {
            const linkState = await readLinkState();
            if (linkState === "unlinked") {
                setView({ kind: "unlinked" });
                return;
            }
            const response = await listCollections();
            const list = response.collections ?? [];
            const lastIds = await readLastClipCollectionIds();
            const liveIds = new Set(list.map((c) => c.id));
            const restored = lastIds.filter((id) => liveIds.has(id));
            setCollections(list);
            setSelectedIds(new Set(restored));
            setView({ kind: "list" });
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : "Could not load your collections.";
            if (/not linked/i.test(message)) {
                setView({ kind: "unlinked" });
                return;
            }
            setView({
                kind: "error",
                message,
            });
        }
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (isUnsupported) {
                setView({ kind: "unsupported" });
                return;
            }
            try {
                const linkState = await readLinkState();
                if (cancelled) {
                    return;
                }
                if (linkState === "unlinked") {
                    setView({ kind: "unlinked" });
                    return;
                }
                if (isSocial) {
                    setView({ kind: "social" });
                    return;
                }
                void fetchCollections();
            } catch (error) {
                if (cancelled) {
                    return;
                }
                setView({
                    kind: "error",
                    message:
                        error instanceof Error
                            ? error.message
                            : "Could not read extension state.",
                });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isUnsupported, isSocial, tab.url]);

    useEffect(() => {
        const handler = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || isClipping) {
                return;
            }
            if (view.kind === "create") {
                return;
            }
            onClose();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [isClipping, onClose, view.kind]);

    const toggleSelection = (id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleCreated = (collection: ExtensionCollectionDto) => {
        setCollections((prev) => [collection, ...prev]);
        setSelectedIds((prev) => new Set(prev).add(collection.id));
        setView({ kind: "list" });
    };

    const handleClip = async () => {
        if (isClipping || !shouldLoadCollections || view.kind !== "list") {
            return;
        }
        setClipError(null);
        setClipSuccess(false);
        setIsClipping(true);
        try {
            const ids = Array.from(selectedIds);
            await clipPage({
                url: tab.url,
                caption: tab.title,
                collectionIds: ids,
            });
            void persistLastClipCollectionIds(ids);
            setClipSuccess(true);
            window.setTimeout(onClose, POPUP_SUCCESS_CLOSE_DELAY_MS);
        } catch (error) {
            setClipError(
                error instanceof Error
                    ? error.message
                    : "Save failed. Please try again.",
            );
        } finally {
            setIsClipping(false);
        }
    };

    if (view.kind === "unlinked") {
        return <UnlinkedPanel />;
    }

    if (view.kind === "unsupported") {
        return <UnsupportedPanel hostname={hostnameFromUrl(tab.url)} />;
    }

    if (view.kind === "social") {
        return <SocialImportPanel tab={tab} />;
    }

    const filteredCollections =
        search.trim() === ""
            ? collections
            : collections.filter((c) =>
                  c.name.toLowerCase().includes(search.trim().toLowerCase()),
              );

    const hasCollections = collections.length > 0;

    return (
        <div className={styles.root}>
            <PageInfo tab={tab} />

            {view.kind === "list" ? (
                <>
                    <SearchField value={search} onChange={setSearch} />
                    <div className={styles.sectionHeader}>
                        <span>Collections</span>
                        <button
                            type="button"
                            className={styles.newButton}
                            onClick={() => setView({ kind: "create" })}
                        >
                            + New
                        </button>
                    </div>
                    {!hasCollections ? (
                        <div className={styles.centerState}>
                            <p className={styles.centerStateTitle}>
                                No collections yet
                            </p>
                            <p className={styles.centerStateBody}>
                                Create a collection to start filing pages.
                            </p>
                            <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => setView({ kind: "create" })}
                                style={{ width: "auto" }}
                            >
                                Create your first collection
                            </button>
                        </div>
                    ) : filteredCollections.length === 0 ? (
                        <div className={styles.centerState}>
                            <p className={styles.centerStateBody}>
                                No collections match &ldquo;{search}&rdquo;.
                            </p>
                        </div>
                    ) : (
                        <ul className={styles.list}>
                            {filteredCollections.map((collection) => (
                                <CollectionRow
                                    key={collection.id}
                                    collection={collection}
                                    isSelected={selectedIds.has(collection.id)}
                                    onToggle={toggleSelection}
                                />
                            ))}
                        </ul>
                    )}
                    <div className={styles.footer}>
                        {clipSuccess ? (
                            <p className={styles.successBanner}>
                                Saved to Cache.
                            </p>
                        ) : null}
                        {clipError ? (
                            <p className={styles.inlineError}>{clipError}</p>
                        ) : null}
                        <button
                            aria-labelledby={clipLabelId}
                            className={styles.secondaryButton}
                            disabled={isClipping || clipSuccess}
                            onClick={handleClip}
                            type="button"
                        >
                            <span id={clipLabelId}>
                                {isClipping ? "Saving…" : "Done"}
                            </span>
                        </button>
                    </div>
                </>
            ) : null}

            {view.kind === "loading" ? (
                <>
                    <SearchField
                        value={search}
                        onChange={setSearch}
                        disabled
                    />
                    <div
                        className={styles.sectionHeader}
                        aria-label="Collections"
                    >
                        <span>Collections</span>
                    </div>
                    <ListSkeletons />
                    <div className={styles.footer}>
                        <button
                            type="button"
                            className={styles.secondaryButton}
                            disabled
                        >
                            Done
                        </button>
                    </div>
                </>
            ) : null}

            {view.kind === "error" ? (
                <div className={styles.centerState}>
                    <p className={styles.centerStateBody}>{view.message}</p>
                    <button
                        type="button"
                        className={styles.retryButton}
                        onClick={() => void fetchCollections()}
                    >
                        Retry
                    </button>
                </div>
            ) : null}

            {view.kind === "create" ? (
                <CollectionCreateView
                    createCollection={createCollection}
                    onCreated={handleCreated}
                    onCancel={() => setView({ kind: "list" })}
                />
            ) : null}
        </div>
    );
}

export default function PopupOverlay(): React.ReactElement {
    const [visible, setVisible] = useState(false);
    const [tab, setTab] = useState<ActiveTab | null>(null);

    useEffect(() => {
        const handler = (msg: { type: string; tab: ActiveTab }) => {
            if (msg.type === MESSAGE_TYPES.SHOW_POPUP && msg.tab) {
                setTab(msg.tab);
                setVisible(true);
            }
        };
        chrome.runtime.onMessage.addListener(handler);
        return () => chrome.runtime.onMessage.removeListener(handler);
    }, []);

    const handleClose = () => setVisible(false);

    if (!visible || !tab) return <></>;

    return (
        <div
            className={styles.overlay}
            role="dialog"
            aria-modal="true"
            aria-label="Save to Cache"
        >
            <div
                className={styles.overlayBackdrop}
                onClick={handleClose}
            />
            <div className={styles.overlayPanel}>
                <PopupPanel tab={tab} onClose={handleClose} />
            </div>
        </div>
    );
}
