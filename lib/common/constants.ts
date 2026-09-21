/**
 * BCP-47 locales enabled in General Translation.
 * Keep in sync with `locales` in `gt.config.json`.
 */
export const SUPPORTED_LOCALES = ["en-US", "es-ES"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "en-US";

export const FOUNDING_DATE = new Date("2026-04-09T00:00:00.000Z");

/** Shown after the page-specific title, e.g. "Settings | Cache App". */
export const APP_NAME = "Cache App";

export const SITE_DOMAIN = "www.cachd.app";

export const DOCS_URL = "https://docs.cachd.app";

export const CHANGELOG_URL = `${DOCS_URL}/docs/changelog`;

export const SUPPORT_URL = DOCS_URL;

export const GITHUB_URL = "https://github.com/gilsmt/cache-app";

export const CACHE_EXTENSION_ID = "fibhdcjlclheehonialdpealhemmoikn";
export const CACHE_EXTENSION_DOWNLOAD_URL =
    "https://chromewebstore.google.com/detail/fibhdcjlclheehonialdpealhemmoikn";
export const CACHE_EXTENSION_READY_EVENT = "CACHE_EXTENSION_READY";
export const CACHE_SITE_OPEN_AND_SYNC_EVENT = "CACHE_SITE_OPEN_AND_SYNC";

export const APPLE_DOMAIN_ASSOCIATION = "";

const VERCEL_URL =
    process.env.VERCEL_ENV === "production"
        ? process.env.VERCEL_PROJECT_PRODUCTION_URL
        : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;

export const BASE_URL =
    process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : `https://${VERCEL_URL ?? SITE_DOMAIN}`;

export const FALLBACK_URL = "about:blank";

export const SORT_ASC = "asc" as const;
export const SORT_DESC = "desc" as const;

export const ITEM_KIND_BOOKMARK = "bookmark" as const;
export const ITEM_KIND_FOLDER = "folder" as const;
export const ITEM_KIND_NOTE = "note" as const;

export const NAME_MAX_LENGTH = 64;

export const DESCRIPTION_MAX_LENGTH = 1024;

export const PRISMA_UNIQUE_CONSTRAINT_ERROR = "P2002";

export const FREE_LIBRARY_PREVIEW_ITEMS = 12;

export const MAX_COLLECTIONS_PER_ITEM = 100;

export const BATCH_UPDATE_MAX_ITEMS = 500;

export const COLLECTION_CREATE_FROM_ITEMS_MAX_ITEMS = 9999;

export const MAX_COLLECTIONS_PER_BATCH = 100;

export const CSRF = {
    cookieName: "csrfToken",
    fieldName: "_csrf",
    headerName: "x-csrf-token",
};

export const IMAGE_MIME_TYPES = {
    avif: "image/avif",
    bmp: "image/bmp",
    gif: "image/gif",
    ico: "image/x-icon",
    jfif: "image/pjpeg",
    jpg: "image/jpeg",
    png: "image/png",
    svg: "image/svg+xml",
    webp: "image/webp",
} as const;

export const VIDEO_MIME_TYPES = {
    mov: "video/quicktime",
    mp4: "video/mp4",
    webm: "video/webm",
} as const;

export const STRING_MIME_TYPES = {
    csv: "text/csv",
    html: "text/html",
    json: "application/json",
    log: "text/plain",
    markdown: "text/markdown",
    md: "text/markdown",
    text: "text/plain",
    xhtml: "application/xhtml+xml",
    xml: "application/xml",
} as const;

export const MIME_TYPES = {
    ...STRING_MIME_TYPES,
    // binary
    binary: "application/octet-stream",
    // image
    ...IMAGE_MIME_TYPES,
    // video
    ...VIDEO_MIME_TYPES,
} as const;

export const USER_AGENT =
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

export const EXPORT_IMAGE_TYPES = {
    clipboard: "clipboard",
    png: "png",
    svg: "svg",
} as const;

export const ACTION_STATUS = {
    CREATED: "CREATED",
    DELETED: "DELETED",
    DISABLED: "DISABLED",
    DUPLICATE: "DUPLICATE",
    ERROR: "ERROR",
    INVALID: "INVALID",
    NOT_FOUND: "NOT_FOUND",
    RESTORED: "RESTORED",
    SHARED: "SHARED",
    SUBSCRIPTION_REQUIRED: "SUBSCRIPTION_REQUIRED",
    SUCCESS: "SUCCESS",
    UNAUTHORIZED: "UNAUTHORIZED",
    UPDATED: "UPDATED",
} as const;

/** Days an item lives in Recently deleted before a hard purge. */
export const LIBRARY_ITEM_TRASH_WINDOW_DAYS = 30;

export const NOTE_DND_MIME = "application/x-cache-note-id";
