export const CACHE_APP_DEFAULT_LOCALE = "en-US";

export const CHROME_SYNC_MODES = {
    continuous: "continuous_sync",
    oneTimeImport: "one_time_import",
} as const;

export type ChromeSyncMode =
    (typeof CHROME_SYNC_MODES)[keyof typeof CHROME_SYNC_MODES];

export const MESSAGE_TYPES = {
    API_CALL: "API_CALL",
    BOOKMARKS_CHUNK: "BOOKMARKS_CHUNK",
    BOOKMARKS_COMPLETE: "BOOKMARKS_COMPLETE",
    CACHE_EXTENSION_READY: "CACHE_EXTENSION_READY",
    CACHE_SITE_BRIDGE: "CACHE_SITE_BRIDGE",
    CACHE_SITE_BRIDGE_REQUEST: "CACHE_SITE_BRIDGE_REQUEST",
    CACHE_SITE_OPEN_AND_SYNC: "CACHE_SITE_OPEN_AND_SYNC",
    CACHE_SITE_TOKEN: "CACHE_SITE_TOKEN",
    CACHE_YT_BOOTSTRAP: "CACHE_YT_BOOTSTRAP",
    CONTENT_SCRIPT_READY: "CONTENT_SCRIPT_READY",
    OPEN_CACHE_TAB: "OPEN_CACHE_TAB",
    SHOW_POPUP: "SHOW_POPUP",
    START_SYNC: "START_SYNC",
    SYNC_DONE: "SYNC_DONE",
    SYNC_ERROR: "SYNC_ERROR",
    SYNC_PROGRESS: "SYNC_PROGRESS",
} as const;

export type MessageType = (typeof MESSAGE_TYPES)[keyof typeof MESSAGE_TYPES];

export const STORAGE_KEYS = {
    autoSyncMarkers: "pendingAutoSyncMarkers",
    chromeLastSyncAt: "chromeLastSyncAt",
    chromePendingEvents: "chromePendingEvents",
    chromeSyncEnabled: "chromeSyncEnabled",
    lastClipCollectionIds: "lastClipCollectionIds",
    pendingOpenAndSyncUrl: "pendingOpenAndSyncUrl",
    syncApiKey: "syncApiKey",
    syncEndpoint: "syncEndpoint",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export const SOURCE_LABELS = {
    chrome: "Chrome bookmarks",
    chrome_bookmarks: "Chrome bookmarks",
    instagram: "Instagram Saved",
    tiktok: "TikTok Favorites",
    youtube: "YouTube Watch Later",
} as const;

export type BookmarkSource = keyof typeof SOURCE_LABELS;

const DEFAULT_CACHE_APP_ORIGIN = "https://cachd.app";

/**
 * The app's own web origins. The extension reads the ingest token from the
 * page origin and posts library data to this origin, so only these hosts are
 * first-party. A wildcard once trusted every cachd.app label, including
 * subdomains delegated to third-party services.
 */
const TRUSTED_CACHE_WEB_ORIGINS = new Set([
    "https://cachd.app",
    "https://www.cachd.app",
]);

/** Local development serves the app on arbitrary localhost ports. */
const LOCALHOST_ORIGIN_PATTERN = /^http:\/\/localhost:\d+$/;

function normalizeOrigin(value: string): string {
    return value.trim().replace(/\/+$/, "");
}

function originFromUrl(raw: string): string {
    const candidate = raw.trim();
    if (!candidate) {
        return "";
    }
    try {
        return new URL(candidate).origin;
    } catch {
        return "";
    }
}

export function isTrustedCacheWebOrigin(origin: string): boolean {
    return (
        TRUSTED_CACHE_WEB_ORIGINS.has(origin) ||
        LOCALHOST_ORIGIN_PATTERN.test(origin)
    );
}

export function getConfiguredCacheAppOrigin(): string {
    return DEFAULT_CACHE_APP_ORIGIN;
}

/**
 * Resolve a stored endpoint or page origin to a trusted app origin. A value
 * outside the allowlist falls back to the configured origin so a third-party
 * host under cachd.app cannot become the upload target.
 */
export function resolveCacheOrigin(raw: string): string {
    const origin = originFromUrl(raw);
    return isTrustedCacheWebOrigin(origin)
        ? origin
        : getConfiguredCacheAppOrigin();
}

export function buildOriginPath(origin: string, path: string): string {
    const normalizedOrigin = normalizeOrigin(origin);
    return normalizedOrigin && path.startsWith("/")
        ? `${normalizedOrigin}${path}`
        : "";
}

export function defaultInstagramSyncEndpoint(
    origin: string = getConfiguredCacheAppOrigin(),
): string {
    return buildOriginPath(origin, "/api/integrations/instagram/saved");
}

export function defaultTikTokSyncEndpoint(
    origin: string = getConfiguredCacheAppOrigin(),
): string {
    return buildOriginPath(origin, "/api/integrations/tiktok/saved");
}

export function defaultYouTubeSyncEndpoint(
    origin: string = getConfiguredCacheAppOrigin(),
): string {
    return buildOriginPath(origin, "/api/integrations/youtube/watch-later");
}

export function defaultChromeSyncEndpoint(
    origin: string = getConfiguredCacheAppOrigin(),
): string {
    return buildOriginPath(origin, "/api/integrations/chrome/sync");
}

export function defaultExtensionCollectionsEndpoint(
    origin: string = getConfiguredCacheAppOrigin(),
): string {
    return buildOriginPath(origin, "/api/integrations/extension/collections");
}

export function defaultExtensionClipEndpoint(
    origin: string = getConfiguredCacheAppOrigin(),
): string {
    return buildOriginPath(origin, "/api/integrations/extension/clip");
}

export function defaultExtensionIngestTokenEndpoint(
    origin: string = getConfiguredCacheAppOrigin(),
): string {
    return buildOriginPath(origin, "/api/user/extension-ingest-token");
}

export function ingestEndpointForSource(
    storedEndpoint: string,
    source: string,
): string {
    const origin = resolveCacheOrigin(storedEndpoint);

    switch (source) {
        case "youtube":
            return defaultYouTubeSyncEndpoint(origin);
        case "chrome":
        case "chrome_bookmarks":
            return defaultChromeSyncEndpoint(origin);
        case "tiktok":
            return defaultTikTokSyncEndpoint(origin);
        default:
            return defaultInstagramSyncEndpoint(origin);
    }
}

export function sourceLabel(source: string): string {
    return SOURCE_LABELS[source as BookmarkSource] ?? "items";
}

export function isYouTubeWatchLaterUrl(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl);
        return (
            url.hostname.replace(/^www\./, "") === "youtube.com" &&
            url.pathname === "/playlist" &&
            url.searchParams.get("list") === "WL"
        );
    } catch {
        return false;
    }
}

export function isSocialImportUrl(rawUrl: string): boolean {
    try {
        const url = new URL(rawUrl);
        const host = url.hostname.replace(/^www\./, "");
        if (
            host === "instagram.com" &&
            /\/[^/?#]+\/saved(?:\/|$)/.test(url.pathname)
        ) {
            return true;
        }
        if (
            host === "tiktok.com" &&
            /\/[^/?#]+\/favorites(?:\/|$)/.test(url.pathname)
        ) {
            return true;
        }
    } catch {
        return false;
    }
    return isYouTubeWatchLaterUrl(rawUrl);
}

/** True when the URL is a Cache web app origin we may bridge auth from. */
export function isCacheSiteUrl(rawUrl: string): boolean {
    try {
        return isTrustedCacheWebOrigin(new URL(rawUrl).origin);
    } catch {
        return false;
    }
}

export function isUnsupportedClipUrl(rawUrl: string): boolean {
    if (!rawUrl) {
        return true;
    }
    return (
        rawUrl.startsWith("chrome://") ||
        rawUrl.startsWith("chrome-extension://") ||
        rawUrl.startsWith("edge://") ||
        rawUrl.startsWith("about:") ||
        rawUrl.startsWith("javascript:") ||
        rawUrl.startsWith("data:")
    );
}

/** Hosts where the Cache web app can bridge auth into the extension. */
export const CACHE_SITE_MATCHES = [
    "https://cachd.app/*",
    "https://www.cachd.app/*",
] as const;

export const SOCIAL_SAVE_MATCHES = [
    "https://www.instagram.com/*",
    "https://www.tiktok.com/*",
    "https://www.youtube.com/*",
] as const;
