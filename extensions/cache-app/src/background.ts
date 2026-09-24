// @ts-nocheck — mechanical port of the production service worker; boundary
// contracts live in @/lib/runtime and the overlay is fully typed.
import {
    CHROME_SYNC_MODES,
    MESSAGE_TYPES,
    STORAGE_KEYS,
    buildOriginPath,
    defaultChromeSyncEndpoint,
    getConfiguredCacheAppOrigin,
    ingestEndpointForSource,
    isCacheSiteUrl,
    isSocialImportUrl,
    isUnsupportedClipUrl,
    resolveCacheOrigin,
} from "@/lib/runtime";
// Plasmo resolves these to built bundle URLs for dynamic MAIN-world registration.
import cacheSiteMainUrl from "url:./page-world/cache-site-main";
import youtubeMainUrl from "url:./page-world/youtube-main";

const PAGE_WORLD_SCRIPT_IDS = {
    cacheSite: "cache-page-world-site",
    youtube: "cache-page-world-youtube",
} as const;

function pageWorldFileName(bundleUrl: string): string {
    return bundleUrl.split("/").pop()?.split("?")[0] ?? "";
}

async function registerPageWorldScripts() {
    const cacheSiteJs = pageWorldFileName(String(cacheSiteMainUrl));
    const youtubeJs = pageWorldFileName(String(youtubeMainUrl));
    if (!(cacheSiteJs && youtubeJs)) {
        throw new Error("Missing page-world bundle filenames.");
    }
    const scripts = [
        {
            id: PAGE_WORLD_SCRIPT_IDS.cacheSite,
            js: [cacheSiteJs],
            matches: ["https://cachd.app/*", "https://www.cachd.app/*"],
            runAt: "document_idle",
            world: "MAIN",
        },
        {
            id: PAGE_WORLD_SCRIPT_IDS.youtube,
            js: [youtubeJs],
            matches: ["https://www.youtube.com/*"],
            runAt: "document_idle",
            world: "MAIN",
        },
    ];
    const ids = scripts.map((script) => script.id);
    // Unregister first so extension updates replace hashed filenames instead of
    // keeping stale dynamic registrations that point at deleted bundles.
    await chrome.scripting.unregisterContentScripts({ ids }).catch(() => {});
    await chrome.scripting.registerContentScripts(scripts);
}

void registerPageWorldScripts().catch((error) => {
    console.error("[Cache] page-world script registration failed:", error);
});

type InstagramSavedItem = {
    shortcode: string;
    url: string;
    caption: string;
    postedAt: string;
    savedAt: string;
};
type TikTokFavoriteItem = {
    id: string;
    url: string;
    caption: string;
    postedAt: string;
    savedAt: string;
};
type YouTubeWatchLaterItem = {
    videoId: string;
    videoUrl: string;
    title: string;
    channelName: string;
    channelId: string;
    duration: string;
    playlistItemId: string;
    position: number | null;
    publishedAt: string | null;
    availability: string;
    savedAt: string;
};

const INSTAGRAM_STORAGE_VERSION = 1;
const TIKTOK_STORAGE_VERSION = 1;
const YOUTUBE_STORAGE_VERSION = 1;
const CHROME_SYNC_BATCH_SIZE = 200;
const DEFAULT_BROWSER_PROFILE_ID = "default";

function formatApiError(body: any, status: any): string {
    if (typeof body?.error === "string" && body.error.trim()) {
        return body.error;
    }
    const flattened = body?.error;
    if (
        flattened &&
        typeof flattened === "object" &&
        Array.isArray(flattened.formErrors) &&
        flattened.fieldErrors &&
        typeof flattened.fieldErrors === "object"
    ) {
        const parts = [...flattened.formErrors];
        for (const key of Object.keys(flattened.fieldErrors)) {
            const fieldMessages = flattened.fieldErrors[key];
            if (Array.isArray(fieldMessages)) {
                parts.push(...fieldMessages);
            }
        }
        if (parts.length > 0) {
            return parts.join(" ");
        }
    }
    return `Request failed (${status})`;
}

chrome.action.onClicked.addListener(async (tab) => {
    const tabId = tab?.id;
    if (typeof tabId !== "number") {
        return;
    }
    const url = tab.url ?? "";
    if (isUnsupportedClipUrl(url)) {
        return;
    }
    try {
        await chrome.tabs.sendMessage(tabId, {
            type: MESSAGE_TYPES.SHOW_POPUP,
            tab: {
                id: tabId,
                title: tab.title ?? "",
                url,
            },
        });
    } catch (error) {
        console.debug("[Cache App] SHOW_POPUP dispatch failed:", error);
    }
});

/** Stale auto-sync markers are dropped after this window. Caps the chance of
 *  a stray sync firing when an unrelated tab reuses an old id. */
const AUTO_SYNC_MARKER_TTL_MS = 60_000;
/** Buffer for the target SPA (Instagram, TikTok, YouTube) to render its
 *  scrollable view before we start saving. */
const AUTO_SYNC_TAB_READY_DELAY_MS = 2000;
const INSTAGRAM_KEYS = {
    bookmarkCount: "bookmarkCount",
    bookmarks: "instagramSavedBookmarks",
    lastSyncAt: "lastSyncAt",
    storageVersion: "storageVersion",
};

const TIKTOK_KEYS = {
    favoriteCount: "tiktokFavoriteCount",
    lastSyncAt: "tiktokLastSyncAt",
    storageVersion: "tiktokStorageVersion",
    videos: "tiktokFavoriteVideos",
};

const YOUTUBE_KEYS = {
    items: "youtubeWatchLaterItems",
    lastSyncAt: "youtubeWatchLaterLastSyncAt",
    storageVersion: "youtubeWatchLaterStorageVersion",
    videoCount: "youtubeWatchLaterVideoCount",
};

const CHROME_KEYS = {
    bookmarkCount: "chromeBookmarkCount",
    browserProfileId: "chromeBrowserProfileId",
    deviceId: "chromeDeviceId",
    deviceName: "chromeDeviceName",
    lastError: "chromeLastError",
    lastSyncAt: "chromeLastSyncAt",
    pendingEvents: "chromePendingEvents",
    pendingMode: "chromePendingMode",
    syncEnabled: "chromeSyncEnabled",
};

// chrome.storage.local does not support atomic read-modify-write.
// We serialize every queue mutation through a single Promise chain so
// that flushes cannot overwrite enqueues that happen between a flush’s
// read and its subsequent write.
let queueMutationPromise: Promise<unknown> = Promise.resolve();

function withQueueLock<T>(operation: () => Promise<T> | T): Promise<T> {
    const promise = queueMutationPromise.then(operation) as Promise<T>;
    queueMutationPromise = promise.then(
        () => undefined,
        () => undefined,
    );
    return promise;
}

// Auto-sync markers are stored as an array in chrome.storage.local. Two open
// requests can race (e.g. user clicks Instagram then TikTok quickly), and the
// marker is consumed in a separate turn from when it is written, so we use the
// same serialization pattern.
let autoSyncMarkerMutationPromise: Promise<unknown> = Promise.resolve();

function withAutoSyncMarkerLock<T>(
    operation: () => Promise<T> | T,
): Promise<T> {
    const promise = autoSyncMarkerMutationPromise.then(operation) as Promise<T>;
    autoSyncMarkerMutationPromise = promise.then(
        () => undefined,
        () => undefined,
    );
    return promise;
}

function pruneAutoSyncMarkers(markers: any, now: any) {
    return markers.filter(
        (marker) =>
            typeof marker?.tabId === "number" &&
            typeof marker?.createdAt === "number" &&
            now - marker.createdAt < AUTO_SYNC_MARKER_TTL_MS
    );
}

async function addPendingAutoSync(tabId: any) {
    await withAutoSyncMarkerLock(async () => {
        const stored = await chrome.storage.local.get([
            STORAGE_KEYS.autoSyncMarkers,
        ]);
        const existing = Array.isArray(stored[STORAGE_KEYS.autoSyncMarkers])
            ? stored[STORAGE_KEYS.autoSyncMarkers]
            : [];
        const now = Date.now();
        const next = pruneAutoSyncMarkers(existing, now)
            .filter((marker) => marker.tabId !== tabId)
            .concat({ createdAt: now, tabId });
        await chrome.storage.local.set({
            [STORAGE_KEYS.autoSyncMarkers]: next,
        });
    });
}

async function consumePendingAutoSync(tabId: any) {
    return withAutoSyncMarkerLock(async () => {
        const stored = await chrome.storage.local.get([
            STORAGE_KEYS.autoSyncMarkers,
        ]);
        const existing = Array.isArray(stored[STORAGE_KEYS.autoSyncMarkers])
            ? stored[STORAGE_KEYS.autoSyncMarkers]
            : [];
        const now = Date.now();
        const fresh = pruneAutoSyncMarkers(existing, now);
        const matchIndex = fresh.findIndex(
            (marker) => marker.tabId === tabId
        );
        if (matchIndex === -1) {
            if (fresh.length !== existing.length) {
                await chrome.storage.local.set({
                    [STORAGE_KEYS.autoSyncMarkers]: fresh,
                });
            }
            return null;
        }
        const [match] = fresh.splice(matchIndex, 1);
        await chrome.storage.local.set({
            [STORAGE_KEYS.autoSyncMarkers]: fresh,
        });
        return match;
    });
}

async function startOpenAndSync(openURL: any) {
    const trimmed = typeof openURL === "string" ? openURL.trim() : "";
    if (!trimmed) {
        return;
    }
    if (!isSocialImportUrl(trimmed)) {
        throw new Error(
            "Open-and-sync only supports Instagram Saved, TikTok Favorites, or YouTube Watch Later.",
        );
    }
    // Persist URL before create so CONTENT_SCRIPT_READY can still match if the
    // tab id marker races behind a fast content-script load.
    await chrome.storage.local.set({
        [STORAGE_KEYS.pendingOpenAndSyncUrl]: trimmed,
    });
    const tab = await chrome.tabs.create({ active: true, url: trimmed });
    if (typeof tab?.id === "number") {
        await addPendingAutoSync(tab.id);
    }
}

function openAndSyncUrlsMatch(pendingUrl: string, tabUrl: string): boolean {
    try {
        const pending = new URL(pendingUrl);
        const tab = new URL(tabUrl);
        return (
            pending.hostname.replace(/^www\./, "") ===
                tab.hostname.replace(/^www\./, "") &&
            pending.pathname === tab.pathname &&
            pending.search === tab.search
        );
    } catch {
        return pendingUrl === tabUrl;
    }
}

async function consumePendingOpenAndSyncByUrl(tabUrl: string) {
    if (!tabUrl) {
        return false;
    }
    const stored = await chrome.storage.local.get([
        STORAGE_KEYS.pendingOpenAndSyncUrl,
    ]);
    const pending =
        typeof stored[STORAGE_KEYS.pendingOpenAndSyncUrl] === "string"
            ? stored[STORAGE_KEYS.pendingOpenAndSyncUrl]
            : "";
    if (!pending || !openAndSyncUrlsMatch(pending, tabUrl)) {
        return false;
    }
    await chrome.storage.local.remove(STORAGE_KEYS.pendingOpenAndSyncUrl);
    return true;
}

let chromeFlushInFlight = null;

function messageSource(msg: any) {
    if (msg && typeof msg === "object") {
        if (msg.source === "tiktok") {
            return "tiktok";
        }
        if (msg.source === "youtube") {
            return "youtube";
        }
        if (msg.source === "chrome_bookmarks" || msg.source === "chrome") {
            return "chrome_bookmarks";
        }
    }
    return "instagram";
}

function generateClientId(prefix: any) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function ensureChromeIdentity() {
    const stored = await chrome.storage.local.get([
        CHROME_KEYS.browserProfileId,
        CHROME_KEYS.deviceId,
        CHROME_KEYS.deviceName,
    ]);

    const patch = {};
    const profileId =
        typeof stored[CHROME_KEYS.browserProfileId] === "string" &&
        stored[CHROME_KEYS.browserProfileId]
            ? stored[CHROME_KEYS.browserProfileId]
            : generateClientId("chrome_profile");
    const deviceId =
        typeof stored[CHROME_KEYS.deviceId] === "string" &&
        stored[CHROME_KEYS.deviceId]
            ? stored[CHROME_KEYS.deviceId]
            : generateClientId("device");
    if (profileId !== stored[CHROME_KEYS.browserProfileId]) {
        patch[CHROME_KEYS.browserProfileId] = profileId;
    }
    if (deviceId !== stored[CHROME_KEYS.deviceId]) {
        patch[CHROME_KEYS.deviceId] = deviceId;
    }

    let deviceName =
        typeof stored[CHROME_KEYS.deviceName] === "string"
            ? stored[CHROME_KEYS.deviceName]
            : "";
    if (!deviceName) {
        try {
            const platform = await chrome.runtime.getPlatformInfo();
            deviceName = `Chrome on ${platform.os}`;
        } catch {
            deviceName = "Chrome browser";
        }
        patch[CHROME_KEYS.deviceName] = deviceName;
    }

    if (Object.keys(patch).length > 0) {
        await chrome.storage.local.set(patch);
    }

    return { deviceId, deviceName, profileId };
}

function mapChromeBookmarkNode(node: any, browserProfileId: any) {
    return {
        dateAdded:
            typeof node.dateAdded === "number" ? node.dateAdded : undefined,
        dateGroupModified:
            typeof node.dateGroupModified === "number"
                ? node.dateGroupModified
                : undefined,
        externalId: String(node.id),
        index: typeof node.index === "number" ? node.index : undefined,
        kind: node.url ? "bookmark" : "folder",
        parentExternalId:
            typeof node.parentId === "string" && node.parentId
                ? node.parentId
                : undefined,
        title: typeof node.title === "string" ? node.title : "",
        url:
            typeof node.url === "string" && node.url
                ? node.url
                : `cache://chrome-bookmarks/folder/${encodeURIComponent(browserProfileId)}/${encodeURIComponent(String(node.id))}`,
    };
}

function flattenChromeBookmarkTree(nodes: any, browserProfileId: any, result: any, snapshotIds: any) {
    for (const node of nodes) {
        const externalId = String(node.id);
        snapshotIds.push(externalId);
        result.push({
            bookmark: mapChromeBookmarkNode(node, browserProfileId),
            occurredAt: new Date().toISOString(),
            type: "upsert",
        });
        if (node.children) {
            flattenChromeBookmarkTree(
                node.children,
                browserProfileId,
                result,
                snapshotIds
            );
        }
    }
}

async function readSyncMetaForUi() {
    const data = await chrome.storage.local.get([
        INSTAGRAM_KEYS.bookmarkCount,
        INSTAGRAM_KEYS.lastSyncAt,
        TIKTOK_KEYS.favoriteCount,
        TIKTOK_KEYS.lastSyncAt,
        YOUTUBE_KEYS.lastSyncAt,
        YOUTUBE_KEYS.videoCount,
        CHROME_KEYS.bookmarkCount,
        CHROME_KEYS.lastError,
        CHROME_KEYS.lastSyncAt,
        CHROME_KEYS.pendingEvents,
        CHROME_KEYS.syncEnabled,
    ]);
    const chromePending = Array.isArray(data[CHROME_KEYS.pendingEvents])
        ? data[CHROME_KEYS.pendingEvents].length
        : 0;
    return {
        chromeContinuousSync: data[CHROME_KEYS.syncEnabled] !== false,
        chromeCount:
            typeof data[CHROME_KEYS.bookmarkCount] === "number"
                ? data[CHROME_KEYS.bookmarkCount]
                : 0,
        chromeLastError:
            typeof data[CHROME_KEYS.lastError] === "string"
                ? data[CHROME_KEYS.lastError]
                : "",
        chromeLastSyncAt:
            typeof data[CHROME_KEYS.lastSyncAt] === "string"
                ? data[CHROME_KEYS.lastSyncAt]
                : undefined,
        chromePendingEvents: chromePending,
        instagramCount:
            typeof data[INSTAGRAM_KEYS.bookmarkCount] === "number"
                ? data[INSTAGRAM_KEYS.bookmarkCount]
                : 0,
        instagramLastSyncAt:
            typeof data[INSTAGRAM_KEYS.lastSyncAt] === "string"
                ? data[INSTAGRAM_KEYS.lastSyncAt]
                : undefined,
        tiktokCount:
            typeof data[TIKTOK_KEYS.favoriteCount] === "number"
                ? data[TIKTOK_KEYS.favoriteCount]
                : 0,
        tiktokLastSyncAt:
            typeof data[TIKTOK_KEYS.lastSyncAt] === "string"
                ? data[TIKTOK_KEYS.lastSyncAt]
                : undefined,
        youtubeCount:
            typeof data[YOUTUBE_KEYS.videoCount] === "number"
                ? data[YOUTUBE_KEYS.videoCount]
                : 0,
        youtubeLastSyncAt:
            typeof data[YOUTUBE_KEYS.lastSyncAt] === "string"
                ? data[YOUTUBE_KEYS.lastSyncAt]
                : undefined,
    };
}

async function notifySyncError(code: any, message: any) {
    await chrome.runtime
        .sendMessage({
            code,
            message: message ?? "",
            type: MESSAGE_TYPES.SYNC_ERROR,
        })
        .catch(() => {});
}

async function notifySyncProgress(activeSource: any) {
    const meta = await readSyncMetaForUi();
    await chrome.runtime
        .sendMessage({
            activeSource,
            type: MESSAGE_TYPES.SYNC_PROGRESS,
            ...meta,
        })
        .catch(() => {});
}

async function notifySyncDone(completedSource: any) {
    const meta = await readSyncMetaForUi();
    await chrome.runtime
        .sendMessage({
            completedSource,
            type: MESSAGE_TYPES.SYNC_DONE,
            ...meta,
        })
        .catch(() => {});
}

/** Prefer new `savedAt`; accept legacy `scrapedAt` from pre-rename storage. */
function itemSavedAt(...candidates: any[]): string {
    for (const item of candidates) {
        if (typeof item?.savedAt === "string" && item.savedAt.trim()) {
            return item.savedAt.trim();
        }
        if (typeof item?.scrapedAt === "string" && item.scrapedAt.trim()) {
            return item.scrapedAt.trim();
        }
    }
    return new Date().toISOString();
}

/** Map extension item shape onto the Cache ingest DTO. */
function toIngestItems(items: any) {
    if (!Array.isArray(items)) {
        return [];
    }
    return items.map((item) => {
        if (!item || typeof item !== "object") {
            return item;
        }
        const { savedAt: _savedAt, scrapedAt: _scrapedAt, ...rest } = item;
        // Ingest DTO field name is fixed by the Cache API schema.
        return { ...rest, scrapedAt: itemSavedAt(item) };
    });
}

async function postToOptionalBackend(endpoint: any, apiKey: any, items: any, source: any) {
    if (!endpoint?.trim()) {
        return;
    }
    if (!apiKey?.trim()) {
        console.warn(
            "[Cache App] Skipping server sync: no ingest token. Open any Cache page while signed in once."
        );
        return;
    }
    const headers: Record<string, string> = {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
    };
    const res = await fetch(endpoint.trim(), {
        body: JSON.stringify({
            items: toIngestItems(items),
            source,
            syncedAt: new Date().toISOString(),
        }),
        headers,
        method: "POST",
    });
    if (!res.ok) {
        console.warn(
            "[Cache App] Optional sync failed:",
            source,
            res.status,
            await res.text().catch(() => "")
        );
    }
}

async function postYouTubeSnapshot(endpoint: any, apiKey: any, payload: any) {
    if (!endpoint?.trim()) {
        throw new Error("Missing YouTube sync endpoint.");
    }
    if (!apiKey?.trim()) {
        throw new Error(
            "No ingest token found. Open Cache while signed in so the extension can link this browser."
        );
    }
    const res = await fetch(endpoint.trim(), {
        body: JSON.stringify(payload),
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
        },
        method: "POST",
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
            `YouTube Watch Later sync failed (${res.status}): ${body}`
        );
    }
    return res.json().catch(() => null);
}

async function postChromeSyncBatch(endpoint: any, apiKey: any, payload: any) {
    if (!endpoint?.trim()) {
        throw new Error("Missing Chrome sync endpoint.");
    }
    if (!apiKey?.trim()) {
        throw new Error(
            "No ingest token found. Open Cache while signed in so the extension can link this browser."
        );
    }
    const res = await fetch(endpoint.trim(), {
        body: JSON.stringify(payload),
        headers: {
            Accept: "application/json",
            Authorization: `Bearer ${apiKey.trim()}`,
            "Content-Type": "application/json",
        },
        method: "POST",
    });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Chrome bookmark sync failed (${res.status}): ${body}`);
    }
    return res.json().catch(() => null);
}

async function readChromeQueueState() {
    const data = await chrome.storage.local.get([
        CHROME_KEYS.pendingEvents,
        CHROME_KEYS.pendingMode,
        CHROME_KEYS.syncEnabled,
    ]);
    return {
        events: Array.isArray(data[CHROME_KEYS.pendingEvents])
            ? data[CHROME_KEYS.pendingEvents]
            : [],
        mode:
            data[CHROME_KEYS.pendingMode] === CHROME_SYNC_MODES.oneTimeImport
                ? CHROME_SYNC_MODES.oneTimeImport
                : CHROME_SYNC_MODES.continuous,
        // Opt-in: missing key means disabled until the user links Cache.
        syncEnabled: data[CHROME_KEYS.syncEnabled] === true,
    };
}

async function enableChromeContinuousSync() {
    await chrome.storage.local.set({
        [CHROME_KEYS.syncEnabled]: true,
    });
}

async function bootstrapChromeBookmarkSync() {
    await ensureChromeIdentity();

    const data = await chrome.storage.local.get([
        CHROME_KEYS.lastSyncAt,
        CHROME_KEYS.syncEnabled,
        STORAGE_KEYS.syncApiKey,
    ]);
    // Opt-in: only run when continuous sync was explicitly enabled (e.g. after
    // linking Cache). Startup/install must not flip missing → always-on.
    if (data[CHROME_KEYS.syncEnabled] !== true) {
        return;
    }
    const token =
        typeof data[STORAGE_KEYS.syncApiKey] === "string"
            ? data[STORAGE_KEYS.syncApiKey].trim()
            : "";
    if (!token) {
        return;
    }

    const hasSyncedBefore =
        typeof data[CHROME_KEYS.lastSyncAt] === "string" &&
        data[CHROME_KEYS.lastSyncAt].length > 0;
    if (!hasSyncedBefore) {
        await runChromeInitialImport(CHROME_SYNC_MODES.continuous);
        return;
    }
    await flushChromeBookmarkQueue();
}

async function setChromeLastError(message: any) {
    await chrome.storage.local.set({
        [CHROME_KEYS.lastError]: message,
    });
}

async function enqueueChromeEvents(events: any, mode: any) {
    if (!Array.isArray(events) || events.length === 0) {
        return;
    }
    await withQueueLock(async () => {
        const current = await readChromeQueueState();
        await chrome.storage.local.set({
            [CHROME_KEYS.pendingEvents]: [...current.events, ...events],
            [CHROME_KEYS.pendingMode]: mode ?? current.mode,
        });
    });
    await notifySyncProgress("chrome");
}

async function flushChromeBookmarkQueue() {
    if (chromeFlushInFlight) {
        return chromeFlushInFlight;
    }

    chromeFlushInFlight = (async () => {
        try {
            while (true) {
                const { pendingEvents, settings } = await withQueueLock(
                    async () => {
                        const settings = await chrome.storage.local.get([
                            CHROME_KEYS.bookmarkCount,
                            CHROME_KEYS.pendingEvents,
                            CHROME_KEYS.pendingMode,
                            STORAGE_KEYS.syncApiKey,
                            STORAGE_KEYS.syncEndpoint,
                        ]);
                        const pendingEvents = Array.isArray(
                            settings[CHROME_KEYS.pendingEvents]
                        )
                            ? settings[CHROME_KEYS.pendingEvents]
                            : [];
                        return { pendingEvents, settings };
                    }
                );

                if (pendingEvents.length === 0) {
                    break;
                }

                try {
                    const identity = await ensureChromeIdentity();
                    const apiKey =
                        typeof settings[STORAGE_KEYS.syncApiKey] === "string"
                            ? settings[STORAGE_KEYS.syncApiKey]
                            : "";
                    const storedEndpoint =
                        typeof settings[STORAGE_KEYS.syncEndpoint] === "string"
                            ? settings[STORAGE_KEYS.syncEndpoint]
                            : "";
                    const endpoint =
                        ingestEndpointForSource(storedEndpoint, "chrome") ||
                        defaultChromeSyncEndpoint();
                    const mode =
                        settings[CHROME_KEYS.pendingMode] ===
                        CHROME_SYNC_MODES.oneTimeImport
                            ? CHROME_SYNC_MODES.oneTimeImport
                            : CHROME_SYNC_MODES.continuous;

                    await notifySyncProgress("chrome");

                    let offset = 0;
                    while (offset < pendingEvents.length) {
                        const batch = pendingEvents.slice(
                            offset,
                            offset + CHROME_SYNC_BATCH_SIZE
                        );
                        await postChromeSyncBatch(endpoint, apiKey, {
                            browserProfileId:
                                identity.profileId ||
                                DEFAULT_BROWSER_PROFILE_ID,
                            device: {
                                id: identity.deviceId,
                                name: identity.deviceName,
                            },
                            events: batch,
                            mode,
                            syncedAt: new Date().toISOString(),
                        });
                        offset += batch.length;
                    }

                    const bookmarkCount = pendingEvents.reduce(
                        (count, event) => {
                            if (
                                event?.type === "upsert" ||
                                event?.type === "move"
                            ) {
                                return (
                                    count +
                                    (event.bookmark?.kind === "bookmark"
                                        ? 1
                                        : 0)
                                );
                            }
                            return count;
                        },
                        0
                    );

                    const { remaining } = await withQueueLock(async () => {
                        const afterFlush = await chrome.storage.local.get([
                            CHROME_KEYS.bookmarkCount,
                            CHROME_KEYS.pendingEvents,
                        ]);
                        const afterPending = Array.isArray(
                            afterFlush[CHROME_KEYS.pendingEvents]
                        )
                            ? afterFlush[CHROME_KEYS.pendingEvents]
                            : [];
                        const remaining = afterPending.slice(
                            pendingEvents.length
                        );

                        await chrome.storage.local.set({
                            [CHROME_KEYS.bookmarkCount]: Math.max(
                                typeof afterFlush[CHROME_KEYS.bookmarkCount] ===
                                    "number"
                                    ? afterFlush[CHROME_KEYS.bookmarkCount]
                                    : 0,
                                bookmarkCount
                            ),
                            [CHROME_KEYS.lastError]: "",
                            [CHROME_KEYS.lastSyncAt]: new Date().toISOString(),
                            [CHROME_KEYS.pendingEvents]: remaining,
                        });
                        return { remaining };
                    });
                    await notifySyncDone("chrome");

                    if (remaining.length === 0) {
                        break;
                    }
                    // Continue to flush any events that arrived mid-flight.
                } catch (error) {
                    const message =
                        error instanceof Error ? error.message : String(error);
                    console.warn(
                        "[Cache App] Chrome bookmark sync error:",
                        error
                    );
                    await setChromeLastError(message);
                    await notifySyncError("CHROME_SYNC_FAILED", message);
                    break;
                }
            }
        } finally {
            chromeFlushInFlight = null;
        }
    })();

    return chromeFlushInFlight;
}

async function queueChromeBookmarkNode(node: any, type: any) {
    const identity = await ensureChromeIdentity();
    const bookmark = mapChromeBookmarkNode(node, identity.profileId);
    await enqueueChromeEvents(
        [
            {
                bookmark,
                occurredAt: new Date().toISOString(),
                type,
            },
        ],
        CHROME_SYNC_MODES.continuous
    );
    await flushChromeBookmarkQueue();
}

async function queueChromeDelete(externalId: any) {
    await enqueueChromeEvents(
        [
            {
                externalId: String(externalId),
                occurredAt: new Date().toISOString(),
                type: "delete",
            },
        ],
        CHROME_SYNC_MODES.continuous
    );
    await flushChromeBookmarkQueue();
}

async function runChromeInitialImport(mode: any) {
    const identity = await ensureChromeIdentity();
    const tree = await chrome.bookmarks.getTree();
    const events = [];
    const snapshotExternalIds = [];
    flattenChromeBookmarkTree(
        tree,
        identity.profileId,
        events,
        snapshotExternalIds
    );

    const bookmarkCount = events.reduce((count, event) => {
        return count + (event.bookmark?.kind === "bookmark" ? 1 : 0);
    }, 0);

    events.push({
        snapshotExternalIds,
        type: "import_complete",
    });

    await chrome.storage.local.set({
        [CHROME_KEYS.bookmarkCount]: bookmarkCount,
        [CHROME_KEYS.lastError]: "",
        [CHROME_KEYS.syncEnabled]: mode === CHROME_SYNC_MODES.continuous,
    });
    await enqueueChromeEvents(events, mode);
    await flushChromeBookmarkQueue();
}

async function migrateItemsIfNeeded(data: any, versionKey: any, itemsKey: any, targetVersion: any) {
    const version =
        typeof data[versionKey] === "number" ? data[versionKey] : 0;
    const raw = data[itemsKey];
    let items = Array.isArray(raw) ? raw : [];

    if (version < targetVersion) {
        items = items.flatMap((row) =>
            row && typeof row === "object" && !Array.isArray(row) ? [row] : []
        );
        await chrome.storage.local.set({
            [itemsKey]: items,
            [versionKey]: targetVersion,
        });
    }

    return items;
}

function mergeRowsByKey(incoming: any, existing: any, getKey: any, mergeItem: any) {
    const rowsByKey = new Map();

    for (const item of existing) {
        const key = getKey(item);
        if (key) {
            rowsByKey.set(key, item);
        }
    }

    for (const item of incoming) {
        const key = getKey(item);
        if (!key) {
            continue;
        }
        rowsByKey.set(key, mergeItem(item, rowsByKey.get(key), key));
    }

    return [...rowsByKey.values()];
}

function mergeByShortcode(incoming: any, existing: any) {
    return mergeRowsByKey(
        incoming,
        existing,
        (item) => item?.shortcode,
        (item, prev) => ({
            ...prev,
            ...item,
            postedAt: item.postedAt || prev?.postedAt,
            savedAt: itemSavedAt(item, prev),
        })
    );
}

function mergeByVideoId(incoming: any, existing: any) {
    return mergeRowsByKey(
        incoming,
        existing,
        (item) => item?.id,
        (item, prev) => ({
            ...prev,
            ...item,
            postedAt: item.postedAt || prev?.postedAt,
            savedAt: itemSavedAt(item, prev),
        })
    );
}

function mergeByYouTubeVideoId(incoming: any, existing: any) {
    return mergeRowsByKey(
        incoming,
        existing,
        (item) => item?.videoId,
        (item, prev, videoId) => ({
            ...prev,
            ...item,
            availability: item.availability || prev?.availability || "available",
            channelId: item.channelId || prev?.channelId || "",
            channelName: item.channelName || prev?.channelName || "",
            duration: item.duration || prev?.duration || "",
            playlistItemId: item.playlistItemId || prev?.playlistItemId || "",
            position:
                typeof item.position === "number"
                    ? item.position
                    : (prev?.position ?? null),
            publishedAt: item.publishedAt || prev?.publishedAt || null,
            savedAt: itemSavedAt(item, prev),
            title: item.title || prev?.title || "",
            videoUrl:
                item.videoUrl ||
                prev?.videoUrl ||
                `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        })
    );
}

function sanitizeYouTubeSnapshotItem(item: any) {
    const videoId =
        typeof item?.videoId === "string" ? item.videoId.trim() : "";
    if (!videoId) {
        return null;
    }

    const videoUrl =
        typeof item?.videoUrl === "string" && item.videoUrl.trim()
            ? item.videoUrl.trim()
            : `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    return {
        availability:
            typeof item?.availability === "string" && item.availability.trim()
                ? item.availability.trim()
                : "available",
        channelId:
            typeof item?.channelId === "string" && item.channelId.trim()
                ? item.channelId.trim()
                : undefined,
        channelName:
            typeof item?.channelName === "string" && item.channelName.trim()
                ? item.channelName.trim()
                : undefined,
        duration:
            typeof item?.duration === "string" && item.duration.trim()
                ? item.duration.trim()
                : undefined,
        playlistItemId:
            typeof item?.playlistItemId === "string" &&
            item.playlistItemId.trim()
                ? item.playlistItemId.trim()
                : undefined,
        position:
            typeof item?.position === "number" ? item.position : undefined,
        publishedAt:
            typeof item?.publishedAt === "string" && item.publishedAt.trim()
                ? item.publishedAt.trim()
                : undefined,
        savedAt: itemSavedAt(item),
        title:
            typeof item?.title === "string" && item.title.trim()
                ? item.title.trim()
                : undefined,
        videoId,
        videoUrl,
    };
}

async function syncYouTubeSnapshot(endpoint: any, apiKey: any, items: any) {
    const identity = await ensureChromeIdentity();
    const payloadItems = toIngestItems(
        items
            .map((item) => sanitizeYouTubeSnapshotItem(item))
            .filter((item) => item !== null),
    );
    await postYouTubeSnapshot(endpoint, apiKey, {
        browserProfileId: identity.profileId || DEFAULT_BROWSER_PROFILE_ID,
        items: payloadItems,
        snapshotComplete: true,
        sourceDeviceId: identity.deviceId,
        sourceDeviceName: identity.deviceName,
    });
}

const BOOKMARK_SOURCE_CONFIG = {
    instagram: {
        countKey: INSTAGRAM_KEYS.bookmarkCount,
        endpointSource: "instagram",
        itemsKey: INSTAGRAM_KEYS.bookmarks,
        keys: INSTAGRAM_KEYS,
        mergeItems: mergeByShortcode,
        storageVersion: INSTAGRAM_STORAGE_VERSION,
        syncFailureCode: null,
        syncMergedItems: ({ apiKey, endpoint, items }) =>
            postToOptionalBackend(endpoint, apiKey, items, "instagram"),
    },
    tiktok: {
        countKey: TIKTOK_KEYS.favoriteCount,
        endpointSource: "tiktok",
        itemsKey: TIKTOK_KEYS.videos,
        keys: TIKTOK_KEYS,
        mergeItems: mergeByVideoId,
        storageVersion: TIKTOK_STORAGE_VERSION,
        syncFailureCode: null,
        syncMergedItems: ({ apiKey, endpoint, items }) =>
            postToOptionalBackend(endpoint, apiKey, items, "tiktok"),
    },
    youtube: {
        countKey: YOUTUBE_KEYS.videoCount,
        endpointSource: "youtube",
        itemsKey: YOUTUBE_KEYS.items,
        keys: YOUTUBE_KEYS,
        mergeItems: mergeByYouTubeVideoId,
        storageVersion: YOUTUBE_STORAGE_VERSION,
        syncFailureCode: "YOUTUBE_SYNC_FAILED",
        syncMergedItems: ({ apiKey, endpoint, items }) =>
            syncYouTubeSnapshot(endpoint, apiKey, items),
    },
};

function bookmarkSourceConfig(source: any) {
    return BOOKMARK_SOURCE_CONFIG[source] ?? BOOKMARK_SOURCE_CONFIG.instagram;
}

async function persistBookmarkItems(items: any, options: any) {
    const config = bookmarkSourceConfig(options.source);

    const data = await chrome.storage.local.get([
        config.itemsKey,
        config.keys.storageVersion,
        STORAGE_KEYS.syncEndpoint,
        STORAGE_KEYS.syncApiKey,
    ]);

    const existing = await migrateItemsIfNeeded(
        data,
        config.keys.storageVersion,
        config.itemsKey,
        config.storageVersion
    );
    const incoming = Array.isArray(items) ? items : [];
    const merged = config.mergeItems(incoming, existing);

    const patch = {
        [config.itemsKey]: merged,
        [config.keys.storageVersion]: config.storageVersion,
    };
    if (config.countKey) {
        patch[config.countKey] = merged.length;
    }

    if (!options.final) {
        await chrome.storage.local.set(patch);
        await notifySyncProgress(options.source);
        return;
    }

    if (config.keys.lastSyncAt) {
        patch[config.keys.lastSyncAt] = new Date().toISOString();
    }
    await chrome.storage.local.set(patch);

    const endpoint =
        ingestEndpointForSource(
            data[STORAGE_KEYS.syncEndpoint],
            config.endpointSource
        );
    const apiKey =
        typeof data[STORAGE_KEYS.syncApiKey] === "string"
            ? data[STORAGE_KEYS.syncApiKey]
            : "";

    try {
        await config.syncMergedItems({
            apiKey,
            endpoint,
            items: merged,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[Cache App] ${options.source} optional sync error:`, error);
        if (config.syncFailureCode) {
            await notifySyncError(config.syncFailureCode, message);
        }
    }

    await notifySyncDone(options.source);
}

chrome.bookmarks.onCreated.addListener((_id, node) => {
    void queueChromeBookmarkNode(node, "upsert");
});

chrome.bookmarks.onRemoved.addListener((id) => {
    void queueChromeDelete(id);
});

chrome.bookmarks.onChanged.addListener((id) => {
    void chrome.bookmarks
        .get(id)
        .then((nodes) => {
            if (nodes[0]) {
                return queueChromeBookmarkNode(nodes[0], "upsert");
            }
        })
        .catch((error) => {
            console.warn(
                "[Cache App] Could not reload changed bookmark",
                error
            );
        });
});

chrome.bookmarks.onMoved.addListener((id) => {
    void chrome.bookmarks
        .get(id)
        .then((nodes) => {
            if (nodes[0]) {
                return queueChromeBookmarkNode(nodes[0], "move");
            }
        })
        .catch((error) => {
            console.warn("[Cache App] Could not reload moved bookmark", error);
        });
});

chrome.bookmarks.onChildrenReordered.addListener((id) => {
    void chrome.bookmarks
        .getChildren(id)
        .then((children) =>
            Promise.all(
                children.map((child) => queueChromeBookmarkNode(child, "move"))
            )
        )
        .catch((error) => {
            console.warn(
                "[Cache App] Could not reload reordered folder",
                error
            );
        });
});

chrome.bookmarks.onImportEnded.addListener(() => {
    void runChromeInitialImport(CHROME_SYNC_MODES.continuous);
});

chrome.runtime.onInstalled.addListener(() => {
    void bootstrapChromeBookmarkSync().catch((error) => {
        console.warn("[Cache App] chrome bookmark bootstrap failed:", error);
    });
});

chrome.runtime.onStartup?.addListener(() => {
    void bootstrapChromeBookmarkSync().catch((error) => {
        console.warn("[Cache App] chrome bookmark bootstrap failed:", error);
    });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== MESSAGE_TYPES.API_CALL) {
        return;
    }
    (async () => {
        try {
            const data = await chrome.storage.local.get([
                STORAGE_KEYS.syncApiKey,
                STORAGE_KEYS.syncEndpoint,
            ]);
            const token =
                typeof data[STORAGE_KEYS.syncApiKey] === "string"
                    ? data[STORAGE_KEYS.syncApiKey].trim()
                    : "";
            if (!token) {
                sendResponse({ error: "Not linked. Sign in to Cache and open a Cache tab." });
                return;
            }
            const endpointOrigin = resolveCacheOrigin(
                typeof data[STORAGE_KEYS.syncEndpoint] === "string"
                    ? data[STORAGE_KEYS.syncEndpoint]
                    : "",
            );
            if (!endpointOrigin) {
                sendResponse({ error: "Missing Cache origin." });
                return;
            }

            let url: string;
            const fetchOptions: RequestInit & {
                headers: Record<string, string>;
            } = {
                headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${token}`,
                },
            };

            switch (msg.method) {
                case "listCollections":
                    url = buildOriginPath(
                        endpointOrigin,
                        "/api/integrations/extension/collections",
                    );
                    break;
                case "createCollection":
                    url = buildOriginPath(
                        endpointOrigin,
                        "/api/integrations/extension/collections",
                    );
                    fetchOptions.method = "POST";
                    fetchOptions.body = JSON.stringify(msg.args);
                    fetchOptions.headers["Content-Type"] = "application/json";
                    break;
                case "clipPage":
                    url = buildOriginPath(
                        endpointOrigin,
                        "/api/integrations/extension/clip",
                    );
                    fetchOptions.method = "POST";
                    fetchOptions.body = JSON.stringify(msg.args);
                    fetchOptions.headers["Content-Type"] = "application/json";
                    break;
                default:
                    sendResponse({ error: `Unknown method: ${msg.method}` });
                    return;
            }

            if (!url) {
                sendResponse({ error: "Could not build endpoint URL." });
                return;
            }

            const res = await fetch(url, fetchOptions);
            const json = await res.json();
            if (!res.ok) {
                sendResponse({
                    error: formatApiError(json, res.status),
                });
                return;
            }
            sendResponse({ data: json });
        } catch (err) {
            sendResponse({
                error:
                    err instanceof Error
                        ? err.message
                        : "Request failed.",
            });
        }
    })();
    return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === MESSAGE_TYPES.CACHE_SITE_BRIDGE) {
        (async () => {
            const senderUrl = sender?.tab?.url ?? sender?.url ?? "";
            if (!isCacheSiteUrl(senderUrl)) {
                console.warn(
                    "[Cache] Ignoring CACHE_SITE_BRIDGE from non-Cache origin:",
                    senderUrl || "(none)",
                );
                return;
            }
            const endpoint =
                typeof msg.endpoint === "string" ? msg.endpoint.trim() : "";
            const token = typeof msg.token === "string" ? msg.token.trim() : "";
            if (!(endpoint && token)) {
                return;
            }
            if (!isCacheSiteUrl(endpoint) && !isCacheSiteUrl(`${endpoint}/`)) {
                // endpoint may be bare origin or full URL path
                try {
                    const origin = new URL(endpoint).origin;
                    if (!isCacheSiteUrl(origin)) {
                        console.warn(
                            "[Cache] Ignoring CACHE_SITE_BRIDGE with disallowed endpoint:",
                            endpoint,
                        );
                        return;
                    }
                } catch {
                    console.warn(
                        "[Cache] Ignoring CACHE_SITE_BRIDGE with invalid endpoint:",
                        endpoint,
                    );
                    return;
                }
            }
            await chrome.storage.local.set({
                [STORAGE_KEYS.syncApiKey]: token,
                [STORAGE_KEYS.syncEndpoint]: endpoint,
            });
            // Linking this browser opts in to continuous Chrome bookmark sync.
            await enableChromeContinuousSync();
            await bootstrapChromeBookmarkSync();
        })();
        return true;
    }

    if (msg?.type === MESSAGE_TYPES.CACHE_SITE_OPEN_AND_SYNC) {
        (async () => {
            try {
                const senderUrl = sender?.tab?.url ?? sender?.url ?? "";
                if (!isCacheSiteUrl(senderUrl)) {
                    sendResponse?.({
                        error: "Open-and-sync is only allowed from Cache.",
                        ok: false,
                    });
                    return;
                }
                await startOpenAndSync(msg.openURL);
                sendResponse?.({ ok: true });
            } catch (error) {
                console.warn(
                    "[Cache App] open-and-sync orchestration failed:",
                    error
                );
                sendResponse?.({
                    error:
                        error instanceof Error
                            ? error.message
                            : String(error),
                    ok: false,
                });
            }
        })();
        return true;
    }

    if (msg?.type === MESSAGE_TYPES.CONTENT_SCRIPT_READY) {
        const tabId = sender?.tab?.id;
        if (typeof tabId !== "number") {
            return false;
        }
        (async () => {
            let match = await consumePendingAutoSync(tabId);
            if (!match) {
                // Race fallback: tab id marker may land after READY.
                match = await consumePendingOpenAndSyncByUrl(
                    sender?.tab?.url ?? "",
                );
            } else {
                await chrome.storage.local.remove(
                    STORAGE_KEYS.pendingOpenAndSyncUrl,
                );
            }
            if (!match) {
                return;
            }
            setTimeout(() => {
                chrome.tabs
                    .sendMessage(tabId, { type: MESSAGE_TYPES.START_SYNC })
                    .catch((err) => {
                        console.debug(
                            "[Cache App] auto-sync START_SYNC dispatch failed:",
                            err
                        );
                    });
            }, AUTO_SYNC_TAB_READY_DELAY_MS);
        })();
        return false;
    }

    if (
        msg?.type === MESSAGE_TYPES.BOOKMARKS_CHUNK ||
        msg?.type === MESSAGE_TYPES.BOOKMARKS_COMPLETE
    ) {
        (async () => {
            try {
                await persistBookmarkItems(
                    Array.isArray(msg.items) ? msg.items : [],
                    {
                        final: msg.type === MESSAGE_TYPES.BOOKMARKS_COMPLETE,
                        source: messageSource(msg),
                    }
                );
            } catch (error) {
                console.error("[Cache App] bookmark persist failed:", error);
                await notifySyncError(
                    "MERGE_FAILED",
                    error instanceof Error ? error.message : String(error)
                );
            }
        })();
        return true;
    }

    if (msg?.type === MESSAGE_TYPES.SYNC_ERROR) {
        (async () => {
            await notifySyncError(
                typeof msg.code === "string" ? msg.code : "UNKNOWN",
                msg.message
            );
        })();
        return true;
    }

    if (msg?.type === MESSAGE_TYPES.START_SYNC) {
        (async () => {
            const tabId =
                typeof msg.tabId === "number"
                    ? msg.tabId
                    : typeof sender?.tab?.id === "number"
                      ? sender.tab.id
                      : null;
            if (typeof tabId !== "number") {
                sendResponse?.({
                    error: "No active tab to import from.",
                    ok: false,
                });
                return;
            }
            try {
                await chrome.tabs.sendMessage(tabId, {
                    type: MESSAGE_TYPES.START_SYNC,
                });
                sendResponse?.({ ok: true });
            } catch (error) {
                sendResponse?.({
                    error:
                        error instanceof Error
                            ? error.message
                            : "Could not start import. Reopen the page and try again.",
                    ok: false,
                });
            }
        })();
        return true;
    }

    if (msg?.type === MESSAGE_TYPES.OPEN_CACHE_TAB) {
        (async () => {
            try {
                const data = await chrome.storage.local.get([
                    STORAGE_KEYS.syncEndpoint,
                ]);
                const endpoint =
                    typeof data[STORAGE_KEYS.syncEndpoint] === "string"
                        ? data[STORAGE_KEYS.syncEndpoint]
                        : "";
                const origin =
                    resolveCacheOrigin(endpoint) ||
                    getConfiguredCacheAppOrigin();
                if (!origin) {
                    sendResponse?.({
                        error: "Missing Cache origin.",
                        ok: false,
                    });
                    return;
                }
                await chrome.tabs.create({ url: origin });
                sendResponse?.({ ok: true });
            } catch (error) {
                sendResponse?.({
                    error:
                        error instanceof Error
                            ? error.message
                            : "Could not open Cache.",
                    ok: false,
                });
            }
        })();
        return true;
    }

    return false;
});
