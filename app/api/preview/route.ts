import { createHash, randomUUID } from "node:crypto";
import * as z from "zod";
import { getSessionUserId } from "@/lib/auth/session";
import {
    abortAfter,
    abortAfterAny,
    isAbortError,
    raceAbort,
} from "@/lib/common/abort";
import { MIME_TYPES, USER_AGENT } from "@/lib/common/constants";
import { type Dimensions, parseImageDimensions } from "@/lib/common/dimension";
import { NamedError } from "@/lib/common/error";
import type { PreviewMetadata } from "@/lib/common/extract";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    fetchPublicRedirect,
    isUpstreamRefusal,
    releaseResponseBodyBudget,
} from "@/lib/common/security/fetch";
import { parseHttpUrl } from "@/lib/common/security/ssrf";
import { parsePublicHttpUrl } from "@/lib/common/security/ssrf-url";
import { fetchWithTimeout } from "@/lib/common/timeout";
import { parseStandaloneUrl, tryParseUrl } from "@/lib/common/url";
import { resolveProviderAccountAccessToken } from "@/lib/integrations/account";
import { isCobaltHost } from "@/lib/integrations/cobalt/utils";
import { GOOGLE_PHOTOS_PICKER_SCOPE } from "@/lib/integrations/google-photos/shared";
import {
    tiktokOembedThumbnailUrl,
    tiktokOembedUrl,
} from "@/lib/integrations/tiktok/oembed";

const log = createLogger("api:library:preview");

// Proxy contract: browsers hold proxy bytes for a day and revalidate with
// If-None-Match afterwards; a 304 keeps the same ETag.
const PROXY_RESPONSE_CACHE_CONTROL =
    "public, max-age=86400, stale-while-revalidate=604800";
const UNSIGNED_IMAGE_CACHE_CONTROL_HEADER =
    "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800";
const VERCEL_CDN_VIDEO_CACHE_CONTROL_HEADER =
    "public, max-age=300, stale-while-revalidate=60";
// A cached 307 keeps pointing at the asset URL, and a signed asset URL must
// not outlive itself, so the redirect lifetime is capped at what remains.
const REDIRECT_CACHE_MAX_AGE_SECONDS = 3600;
// Proxy responses stream untrusted upstream bytes; sandboxed CSP plus nosniff
// keep a direct navigation from executing anything under our origin.
const PREVIEW_SANDBOX_CSP = "sandbox; default-src 'none'";
const VERCEL_CACHE_TAG_HEADER = "Vercel-Cache-Tag";
const VERCEL_CDN_CACHE_CONTROL_HEADER_NAME = "Vercel-CDN-Cache-Control";
const NO_STORE_HEADER = "private, no-store";
const PLAIN_TEXT_CONTENT_TYPE = `${MIME_TYPES.text}; charset=utf-8`;
const SIGNED_URL_EXPIRY_PARAM = "x-expires";
const SIGNED_URL_GRACE_SECONDS = 300;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
// `url` param contract: at most 2048 characters.
const MAX_TARGET_URL_LENGTH = 2048;
const MAX_PREVIEW_METADATA_BODY_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_CONTENT_LENGTH_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_CONTENT_LENGTH_BYTES = 200 * 1024 * 1024;
const PREVIEW_VIDEO_CACHE_TTL_SECONDS = 5 * 60;
const PREVIEW_IMAGE_CACHE_TTL_SECONDS = 4 * 24 * 60 * 60; // 4 d
// A site icon that stands in for a page the upstream refused expires sooner
// than a page image, so the real preview returns as soon as the upstream
// serves the page again.
const PREVIEW_FALLBACK_IMAGE_CACHE_TTL_SECONDS = 60 * 60; // 1 h
const PREVIEW_NEGATIVE_CACHE_TTL_SECONDS = 60;
// A refused upstream is cached only briefly: the refusal is transient, and a
// short record keeps concurrent requests from hammering the same host.
const PREVIEW_BLOCKED_CACHE_TTL_SECONDS = 60;
const PREVIEW_RESOLUTION_LEASE_TTL_SECONDS = 12;
const PREVIEW_RESOLUTION_WAIT_MS = 12_000;
const PREVIEW_RESOLUTION_POLL_MS = 250;
// Process-local L1 in front of Redis. A hit returns from the Map before any
// Redis read. Cap entries to bound memory. The L1 TTL is short and independent
// of the Redis TTL: a Redis delete/update in another isolate is invisible to
// this process's Map, so a brief L1 lifetime bounds how long a stale target can
// be served (signed-URL expiry is still re-checked on every hit).
const MEMORY_CACHE_MAX_ENTRIES = 256;
const PREVIEW_IMAGE_MEMORY_CACHE_TTL_SECONDS = 5 * 60;
// Upstream-controlled content-types we will proxy. Anything outside these lists
// (notably image/svg+xml and application/octet-stream) is rejected: SVGs execute
// in the browser and would let a hostile upstream use our Referer to hit abuse
// endpoints or run script in our origin's context; octet-stream would let a
// hostile upstream bypass content-type sniffing and ship executable payloads
// under our cache tag.
const SUPPORTED_PREVIEW_IMAGE_MIME_TYPES = new Set<string>([
    MIME_TYPES.avif,
    MIME_TYPES.bmp,
    MIME_TYPES.gif,
    MIME_TYPES.jpg,
    MIME_TYPES.png,
    MIME_TYPES.webp,
    MIME_TYPES.ico,
    "image/vnd.microsoft.icon",
]);
const SUPPORTED_PREVIEW_VIDEO_MIME_TYPES = new Set<string>([
    "video/mp4",
    "video/quicktime",
    "video/webm",
]);
const GOOGLEBOT_USER_AGENT =
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
// The app's own identity. An upstream that refuses the crawler identity
// often serves the same public resource to another one.
const APP_USER_AGENT = "CacheApp/1.0 (+https://www.cachd.app)";
// const BROWSER_USER_AGENT =
//     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const HTTP_SINGLE_RANGE_HEADER_PATTERN = /^bytes=(\d*)-(\d*)$/;
const XHTML_CONTENT_TYPE_PATTERN = /^application\/xhtml\+xml/i;
const ABORTED_RESPONSE = new Response(null, { status: 499 });
const INSTAGRAM_HOST = "instagram.com";
const GOOGLE_PHOTOS_CDN_HOST = "lh3.googleusercontent.com";

const PreviewRedirectLoopError = NamedError.create(
    "PreviewRedirectLoop",
    z.object({ message: z.string() })
);
// The SSRF policy refused the host at a redirect hop. The host is not
// fetchable at all, so the client only learns that no preview exists; the
// reason stays in the log.
const PreviewBlockedHostError = NamedError.create(
    "PreviewBlockedHost",
    z.object({ message: z.string() })
);
// Sentinel errorCode for "no isolate finished resolving before the deadline".
// Distinct from every real Cobalt error code so the response can be a
// transient 503 instead of a cacheable 404. Never written to any cache.
const PREVIEW_RESOLUTION_TIMEOUT_ERROR_CODE = "preview.resolution_timeout";

type PreviewType = "image" | "video";

type PreviewDelivery = "proxy" | "redirect";

interface VideoRangeRequest {
    endByte: number | null;
    header: string;
    startByte: number | null;
}

interface ResolvedImage {
    h?: number;
    imageUrl: string;
    pageUrl: string;
    w?: number;
}

/** A page image, or the site icon standing in for a refused page. */
type ImagePreviewSource = "fallback" | "page";

interface ImageCandidate {
    /** Dimensions the page declares; only the Open Graph image has them. */
    dimensions: Dimensions | null;
    source: ImagePreviewSource;
    url: string;
}

/** The page a preview is resolved from, and the images it offers. */
interface PreviewPage {
    /** Image candidates in priority order: page images first, site icon last. */
    candidates: ImageCandidate[];
    /** The image itself when the target URL points straight at an image. */
    directImageUrl: string | null;
    /** The page URL after redirects. */
    pageUrl: string;
    /** True when the upstream refused the page instead of serving it. */
    refused: boolean;
}

type CacheLookup<T> =
    | { status: "hit"; value: T }
    | { status: "negative" }
    | { status: "miss" };

type ImagePreviewLookup = CacheLookup<ResolvedImage> | { status: "blocked" };

type VideoPreviewWaitResult =
    | { status: "preview"; videoUrl: string }
    | { status: "negative" }
    | { status: "failure"; errorCode: string | null }
    | { status: "miss" };

/**
 * `blocked` never becomes a cached negative: only `not_found` is final.
 */
type ImagePreviewOutcome =
    | { status: "blocked" }
    | { status: "not_found" }
    | { status: "resolved"; value: ResolvedImage };

type ImagePreviewResolution = ImagePreviewOutcome | { status: "unresolved" };

// One cached resolution per (normalized page URL, type). All record kinds
// share the record key; each write carries its own value and TTL, so the
// freshest state wins and the read path switches on `kind`.
type PreviewRecord =
    | { kind: "image"; preview: ResolvedImage }
    | { kind: "negative" }
    | { kind: "blocked" }
    | { kind: "video"; videoUrl: string }
    | { kind: "video-error"; errorCode: string | null };

const NEGATIVE_PREVIEW_RECORD: PreviewRecord = { kind: "negative" };
const NEGATIVE_PREVIEW_RECORD_JSON = JSON.stringify(NEGATIVE_PREVIEW_RECORD);
const BLOCKED_PREVIEW_RECORD: PreviewRecord = { kind: "blocked" };

// Lazy-loaded only on the HTML cache-miss path (not cache-hit / video).
// On import failure, clear the cached promise so the next request can retry.
let extractPreviewMetadataPromise: Promise<
    typeof import("@/lib/common/extract").extractPreviewMetadata
> | null = null;

function loadExtractPreviewMetadata() {
    extractPreviewMetadataPromise ??= import("@/lib/common/extract")
        .then((mod) => mod.extractPreviewMetadata)
        .catch((error: unknown) => {
            extractPreviewMetadataPromise = null;
            throw error;
        });
    return extractPreviewMetadataPromise;
}

// Lazy-loaded only on the video cache-miss path.
let cobaltServicePromise: Promise<
    typeof import("@/lib/integrations/cobalt/service")
> | null = null;

function loadCobaltService() {
    cobaltServicePromise ??= import("@/lib/integrations/cobalt/service").catch(
        (error: unknown) => {
            cobaltServicePromise = null;
            throw error;
        }
    );
    return cobaltServicePromise;
}

// Load Redis on the first cache operation. Concurrent operations share the
// same import promise.
let redisModulePromise: Promise<typeof import("@/lib/common/redis")> | null =
    null;

function loadRedisModule() {
    redisModulePromise ??= import("@/lib/common/redis").catch(
        (error: unknown) => {
            redisModulePromise = null;
            throw error;
        }
    );
    return redisModulePromise;
}

interface MemoryRecordEntry {
    expiresAtMs: number;
    value: PreviewRecord;
}

// Insertion-order Map as crude LRU: re-set on hit moves to end; evict from front.
const memoryPreviewRecords = new Map<string, MemoryRecordEntry>();
const inFlightImagePreviewResolutions = new Map<
    string,
    Promise<ImagePreviewResolution>
>();
const inFlightVideoPreviewResolutions = new Map<
    string,
    Promise<{ errorCode: string | null; videoUrl: string | null }>
>();

function memoryRecordGet(key: string): PreviewRecord | null {
    const entry = memoryPreviewRecords.get(key);
    if (!entry) {
        return null;
    }
    if (Date.now() >= entry.expiresAtMs) {
        memoryPreviewRecords.delete(key);
        return null;
    }
    // LRU touch
    memoryPreviewRecords.delete(key);
    memoryPreviewRecords.set(key, entry);
    return entry.value;
}

function memoryRecordSet(key: string, record: PreviewRecord): void {
    if (memoryPreviewRecords.has(key)) {
        memoryPreviewRecords.delete(key);
    } else if (memoryPreviewRecords.size >= MEMORY_CACHE_MAX_ENTRIES) {
        const oldestKey = memoryPreviewRecords.keys().next().value;
        if (oldestKey !== undefined) {
            memoryPreviewRecords.delete(oldestKey);
        }
    }
    memoryPreviewRecords.set(key, {
        expiresAtMs: Date.now() + recordMemoryTtlSeconds(record) * 1000,
        value: record,
    });
}

function trackInFlightResolution<T>(
    map: Map<string, Promise<T>>,
    key: string,
    resolution: Promise<T>
): Promise<T> {
    const tracked = resolution.finally(() => {
        if (map.get(key) === tracked) {
            map.delete(key);
        }
    });
    tracked.catch(() => undefined);
    map.set(key, tracked);
    return tracked;
}

async function awaitSharedResolution<T>(
    promise: Promise<T>,
    externalSignal: AbortSignal | undefined,
    onSharedTimeout: () => T
): Promise<T> {
    try {
        return await raceAbort(promise, externalSignal);
    } catch (error) {
        if (isAbortError(error) && !externalSignal?.aborted) {
            return onSharedTimeout();
        }
        throw error;
    }
}

function parseResolvedImage(value: unknown): ResolvedImage | null {
    if (!(typeof value === "object" && value !== null)) {
        return null;
    }
    if (!("imageUrl" in value && "pageUrl" in value)) {
        return null;
    }
    if (
        typeof value.imageUrl !== "string" ||
        typeof value.pageUrl !== "string"
    ) {
        return null;
    }
    // Entries written before dimensions existed carry no h/w; entries with
    // corrupt sides degrade to dimensionless rather than missing.
    const dimensions =
        "w" in value && "h" in value
            ? parseImageDimensions(value.w, value.h)
            : null;
    return {
        ...(dimensions ? { h: dimensions.h, w: dimensions.w } : {}),
        imageUrl: value.imageUrl,
        pageUrl: value.pageUrl,
    };
}

/**
 * Validates a record deserialized from Redis. Keys are typed, so a record
 * whose `kind` mismatches its key can only be corruption or deploy skew;
 * callers treat null as a miss and re-resolve.
 */
function parsePreviewRecord(value: unknown): PreviewRecord | null {
    if (!(typeof value === "object" && value !== null && "kind" in value)) {
        return null;
    }
    switch (value.kind) {
        case "negative":
            return NEGATIVE_PREVIEW_RECORD;
        case "blocked":
            return BLOCKED_PREVIEW_RECORD;
        case "video":
            if (!("videoUrl" in value) || typeof value.videoUrl !== "string") {
                return null;
            }
            return { kind: "video", videoUrl: value.videoUrl };
        case "video-error": {
            if (!("errorCode" in value)) {
                return null;
            }
            const errorCode = value.errorCode;
            return errorCode === null || typeof errorCode === "string"
                ? { errorCode, kind: "video-error" }
                : null;
        }
        case "image": {
            if (!("preview" in value)) {
                return null;
            }
            const preview = parseResolvedImage(value.preview);
            return preview ? { kind: "image", preview } : null;
        }
        default:
            return null;
    }
}

const RECORD_REDIS_TTL_SECONDS = {
    blocked: PREVIEW_BLOCKED_CACHE_TTL_SECONDS,
    image: PREVIEW_IMAGE_CACHE_TTL_SECONDS,
    negative: PREVIEW_NEGATIVE_CACHE_TTL_SECONDS,
    video: PREVIEW_VIDEO_CACHE_TTL_SECONDS,
    "video-error": PREVIEW_RESOLUTION_LEASE_TTL_SECONDS,
} as const satisfies Record<PreviewRecord["kind"], number>;

function recordRedisTtlSeconds(record: PreviewRecord): number {
    return RECORD_REDIS_TTL_SECONDS[record.kind];
}

function recordMemoryTtlSeconds(record: PreviewRecord): number {
    // The L1 image TTL stays short and independent of the Redis TTL: a Redis
    // delete/update in another isolate is invisible to this process's Map.
    return record.kind === "image"
        ? PREVIEW_IMAGE_MEMORY_CACHE_TTL_SECONDS
        : recordRedisTtlSeconds(record);
}

export async function GET(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);

    const targetUrl = parsePreviewTargetUrl(requestUrl.searchParams.get("url"));
    if (!targetUrl) {
        return textResponse("Invalid URL", 400);
    }

    const previewType = parsePreviewType(requestUrl.searchParams.get("type"));
    if (!previewType) {
        return textResponse("Unsupported preview type", 400);
    }

    const delivery = parsePreviewDelivery(
        requestUrl.searchParams.get("delivery")
    );
    if (!delivery) {
        return textResponse("Unsupported preview delivery", 400);
    }

    if (requestUrl.searchParams.get("metadata") === "1") {
        return serveImageMetadataResponse(targetUrl, previewType, request);
    }

    // Google Photos CDN URLs require OAuth authorization. Only image
    // previews are supported; video and invalid-type responses are handled
    // by the standard checks above.
    if (previewType === "image" && isGooglePhotosHost(targetUrl)) {
        return serveGooglePhotosPreview(targetUrl, request);
    }

    if (previewType === "video") {
        const cachedVideo = await readCachedVideoPreview(targetUrl.href);
        if (cachedVideo.status === "hit") {
            if (delivery === "redirect") {
                return redirectToPreview(
                    cachedVideo.value,
                    targetUrl.href,
                    "video"
                );
            }
            return proxyVideoResponse(cachedVideo.value, targetUrl, request);
        }
        if (cachedVideo.status === "negative") {
            return previewNotFoundResponse(targetUrl.href, "video");
        }

        if (!isCobaltHost(targetUrl.href)) {
            log.debug("Host not supported for video preview", {
                targetUrl: targetUrl.href,
            });
            return textResponse("Video preview not available", 404);
        }

        const publicTargetUrl = await parsePublicHttpUrl(targetUrl.href);
        if (!publicTargetUrl) {
            return textResponse("Invalid URL", 400);
        }

        return resolveVideoPreview(publicTargetUrl, request, delivery);
    }

    try {
        const cached = await readCachedImagePreview(targetUrl.href);
        if (cached.status === "hit") {
            if (delivery === "redirect") {
                return redirectToPreview(
                    cached.value.imageUrl,
                    targetUrl.href,
                    "image"
                );
            }
            return proxyImageResponse(cached.value, targetUrl, request);
        }
        if (cached.status === "negative") {
            return previewNotFoundResponse(targetUrl.href, "image");
        }
        if (cached.status === "blocked") {
            return previewUnavailableResponse();
        }

        const publicTargetUrl = await parsePublicHttpUrl(targetUrl.href);
        if (!publicTargetUrl) {
            return textResponse("Invalid URL", 400);
        }

        const resolution = await resolveImagePreviewWithCoordination(
            publicTargetUrl,
            request.signal
        );
        if (resolution.status === "not_found") {
            writeCachedNegativePreview(targetUrl.href, "image");
            return previewNotFoundResponse(targetUrl.href, "image");
        }
        if (
            resolution.status === "blocked" ||
            resolution.status === "unresolved"
        ) {
            return previewUnavailableResponse();
        }
        const { value: preview } = resolution;
        if (delivery === "redirect") {
            return redirectToPreview(
                preview.imageUrl,
                publicTargetUrl.href,
                "image"
            );
        }
        return proxyImageResponse(preview, publicTargetUrl, request);
    } catch (error) {
        return handlePreviewError(
            error,
            "resolve preview",
            { message: "Preview temporarily unavailable", status: 503 },
            { targetUrl: targetUrl.href }
        );
    }
}

/**
 * Parses the `url` query param into the request's page URL per the route
 * contract: required, at most 2048 characters, http/https only, no userinfo,
 * and no explicit port other than the scheme default (80 for http, 443 for
 * https). WHATWG parsing already normalizes the host (IDNA to ASCII,
 * lowercased) and strips the default port; the fragment is stripped
 * explicitly so equal pages share one resolution record.
 */
function parsePreviewTargetUrl(rawValue: string | null): URL | null {
    if (!rawValue || rawValue.length > MAX_TARGET_URL_LENGTH) {
        return null;
    }
    const standaloneUrl = parseStandaloneUrl(rawValue);
    if (!standaloneUrl) {
        return null;
    }
    const targetUrl = parseHttpUrl(standaloneUrl.href);
    if (!targetUrl) {
        return null;
    }
    if (targetUrl.username !== "" || targetUrl.password !== "") {
        return null;
    }
    // WHATWG parsing strips the scheme-default port, so any port that
    // survives here is non-default and outside the contract.
    if (targetUrl.port !== "") {
        return null;
    }
    targetUrl.hash = "";
    return targetUrl;
}

function parsePreviewType(type: string | null): PreviewType | null {
    if (type === null || type === "image") {
        return "image";
    }
    if (type === "video") {
        return "video";
    }
    return null;
}

function parsePreviewDelivery(delivery: string | null): PreviewDelivery | null {
    if (delivery === null || delivery === "proxy") {
        return "proxy";
    }
    if (delivery === "redirect") {
        return "redirect";
    }
    return null;
}

async function serveImageMetadataResponse(
    targetUrl: URL,
    previewType: PreviewType,
    request: Request
): Promise<Response> {
    // Only the standard image path resolves dimensions. Google Photos needs
    // per-request OAuth and never goes through resolution; video has no
    // image slot to reserve.
    if (previewType !== "image" || isGooglePhotosHost(targetUrl)) {
        return textResponse("Preview not available", 404);
    }

    try {
        const cached = await readCachedImagePreview(targetUrl.href);
        if (cached.status === "hit") {
            return imageMetadataResponse(cached.value, targetUrl.href);
        }
        if (cached.status === "negative") {
            return previewNotFoundResponse(targetUrl.href, "image");
        }
        if (cached.status === "blocked") {
            return previewUnavailableResponse();
        }

        const publicTargetUrl = await parsePublicHttpUrl(targetUrl.href);
        if (!publicTargetUrl) {
            return textResponse("Invalid URL", 400);
        }

        const resolution = await resolveImagePreviewWithCoordination(
            publicTargetUrl,
            request.signal
        );
        if (resolution.status === "not_found") {
            writeCachedNegativePreview(targetUrl.href, "image");
            return previewNotFoundResponse(targetUrl.href, "image");
        }
        if (
            resolution.status === "blocked" ||
            resolution.status === "unresolved"
        ) {
            return previewUnavailableResponse();
        }
        return imageMetadataResponse(resolution.value, publicTargetUrl.href);
    } catch (error) {
        return handlePreviewError(
            error,
            "resolve preview metadata",
            { message: "Preview temporarily unavailable", status: 503 },
            { targetUrl: targetUrl.href }
        );
    }
}

function imageMetadataResponse(
    preview: ResolvedImage,
    targetHref: string
): Response {
    const signedUrlLifetimeSeconds = getSignedUrlLifetimeSeconds(
        preview.imageUrl
    );
    const cacheControl = previewResponseCacheControl(signedUrlLifetimeSeconds);
    const headers = new Headers();
    headers.set("cache-control", cacheControl);
    headers.set("content-type", `${MIME_TYPES.json}; charset=utf-8`);
    setPreviewCacheHeaders(headers, targetHref, "image", cacheControl);
    return new Response(
        JSON.stringify({
            height: preview.h ?? null,
            imageUrl: preview.imageUrl,
            pageUrl: preview.pageUrl,
            width: preview.w ?? null,
        }),
        { headers, status: 200 }
    );
}

/**
 * Walks the page's images in priority order. A refusal with no usable image
 * is `blocked`: transient, and never cached as a negative.
 */
async function resolveImagePreview(
    targetUrl: URL,
    signal?: AbortSignal
): Promise<ImagePreviewOutcome> {
    const targetHref = targetUrl.href;

    const oembedUrl = tiktokOembedUrl(targetHref);
    if (oembedUrl) {
        const preview = await resolveTikTokImagePreview(
            targetHref,
            oembedUrl,
            signal
        );
        if (preview) {
            writeCachedImagePreview(targetHref, preview, "page");
            return { status: "resolved", value: preview };
        }
        return { status: "not_found" };
    }

    const page = await fetchPreviewPage(targetUrl, signal);
    if (page.directImageUrl) {
        const preview: ResolvedImage = {
            imageUrl: page.directImageUrl,
            pageUrl: targetHref,
        };
        writeCachedImagePreview(targetHref, preview, "page");
        return { status: "resolved", value: preview };
    }

    const userAgent = getUserAgent(targetHref);
    for (const candidate of page.candidates) {
        const isUsable = await isPreviewImageAvailable(
            candidate.url,
            page.pageUrl,
            userAgent,
            signal
        );
        if (!isUsable) {
            continue;
        }
        const preview: ResolvedImage = {
            ...(candidate.dimensions
                ? { h: candidate.dimensions.h, w: candidate.dimensions.w }
                : {}),
            imageUrl: candidate.url,
            pageUrl: page.pageUrl,
        };
        writeCachedImagePreview(targetHref, preview, candidate.source);
        return { status: "resolved", value: preview };
    }

    return page.refused ? { status: "blocked" } : { status: "not_found" };
}

/** Orders the page images before the site icon, which identifies the site, not the page. */
function buildImageCandidates(
    metadata: PreviewMetadata,
    pageUrl: string
): ImageCandidate[] {
    const candidates: ImageCandidate[] = [];
    const seen = new Set<string>();
    // Only the Open Graph image declares dimensions; a fallback image has
    // unknown sides, so it must not carry unrelated values.
    const dimensions = parseImageDimensions(
        metadata.imageWidth,
        metadata.imageHeight
    );
    for (const [index, url] of metadata.images.entries()) {
        const httpUrl = parseHttpUrl(url)?.href;
        if (!httpUrl || seen.has(httpUrl)) {
            continue;
        }
        seen.add(httpUrl);
        candidates.push({
            dimensions: index === 0 ? dimensions : null,
            source: "page",
            url: httpUrl,
        });
    }
    for (const url of metadata.favicons) {
        const httpUrl = parseHttpUrl(url)?.href;
        if (!httpUrl || seen.has(httpUrl)) {
            continue;
        }
        seen.add(httpUrl);
        candidates.push({ dimensions: null, source: "fallback", url: httpUrl });
    }
    const iconUrl = siteIconUrl(pageUrl);
    if (!seen.has(iconUrl)) {
        candidates.push({ dimensions: null, source: "fallback", url: iconUrl });
    }
    return candidates;
}

/** The site icon of a page: the last candidate when the page offers no image. */
function siteIconCandidate(pageUrl: string): ImageCandidate {
    return {
        dimensions: null,
        source: "fallback",
        url: siteIconUrl(pageUrl),
    };
}

function siteIconUrl(pageUrl: string): string {
    return new URL("/favicon.ico", pageUrl).href;
}

/**
 * Reads the page, including error and refused responses: both often carry the
 * site's Open Graph image and icon links.
 */
async function fetchPreviewPage(
    targetUrl: URL,
    signal?: AbortSignal
): Promise<PreviewPage> {
    const targetHref = targetUrl.href;
    const pageResponse = await fetchAsLinkUnfurler(
        targetUrl,
        {
            Accept: "text/html,application/xhtml+xml,image/*",
            Referer: targetHref,
        },
        getUserAgent(targetHref),
        signal
    );
    if (!pageResponse) {
        // No identity got an answer: only the site icon can serve as a
        // preview.
        return {
            candidates: [siteIconCandidate(targetHref)],
            directImageUrl: null,
            pageUrl: targetHref,
            refused: true,
        };
    }

    const pageUrl = parseHttpUrl(pageResponse.url)?.href ?? targetHref;
    const refused = isUpstreamRefusal(pageResponse.status);

    const pageContentType = pageResponse.headers.get("content-type") ?? "";
    if (
        pageResponse.ok &&
        isSupportedPreviewImageContentType(pageContentType)
    ) {
        // The URL points straight at an image: it is the preview.
        await pageResponse.body?.cancel().catch(() => undefined);
        return {
            candidates: [],
            directImageUrl: pageResponse.url || targetHref,
            pageUrl,
            refused,
        };
    }

    const previewContentType =
        normalizePreviewContentType(pageContentType) || pageContentType;
    const shouldReadResponseBody =
        shouldReadPreviewResponseBody(previewContentType);
    const previewBody = shouldReadResponseBody
        ? await readTextBodyWithLimit(
              pageResponse,
              MAX_PREVIEW_METADATA_BODY_BYTES,
              signal
          )
        : "";
    if (!shouldReadResponseBody) {
        await pageResponse.body?.cancel().catch(() => undefined);
    }
    if (previewBody === null) {
        if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        // The page is too large to read: only the site icon can serve as a
        // preview.
        return {
            candidates: [siteIconCandidate(pageUrl)],
            directImageUrl: null,
            pageUrl,
            refused,
        };
    }

    const extractPreviewMetadata = await loadExtractPreviewMetadata();
    const metadata = extractPreviewMetadata(previewBody, pageUrl);
    return {
        candidates: buildImageCandidates(metadata, pageUrl),
        directImageUrl: null,
        pageUrl,
        refused,
    };
}

/**
 * Checks that a candidate URL serves a supported image. The body is dropped
 * without reading it: the caller proxies the image later, and the check only
 * needs the headers.
 */
async function isPreviewImageAvailable(
    url: string,
    referer: string,
    userAgent: string,
    signal?: AbortSignal
): Promise<boolean> {
    const imageUrl = parseHttpUrl(url);
    if (!imageUrl) {
        return false;
    }
    const imageResponse = await fetchAsLinkUnfurler(
        imageUrl,
        { Accept: "image/*", Referer: referer },
        userAgent,
        signal
    );
    if (!imageResponse) {
        return false;
    }
    const contentType = imageResponse.headers.get("content-type") ?? "";
    const isUsable =
        imageResponse.ok &&
        isSupportedPreviewImageContentType(contentType) &&
        !isContentLengthOverLimit(
            imageResponse.headers,
            MAX_IMAGE_CONTENT_LENGTH_BYTES
        );
    await imageResponse.body?.cancel().catch(() => undefined);
    return isUsable;
}

async function resolveImagePreviewWithCoordination(
    targetUrl: URL,
    externalSignal?: AbortSignal
): Promise<ImagePreviewResolution> {
    const key = previewRecordKey(targetUrl.href, "image");
    const inFlight = inFlightImagePreviewResolutions.get(key);
    if (inFlight) {
        const resolution = await awaitSharedResolution(
            inFlight,
            externalSignal,
            (): ImagePreviewResolution => ({ status: "unresolved" })
        );
        if (resolution.status !== "resolved") {
            return resolution;
        }
        return { status: "resolved", value: resolution.value };
    }

    const resolution = trackInFlightResolution(
        inFlightImagePreviewResolutions,
        key,
        resolveImagePreviewAfterLease(key, targetUrl)
    );
    return awaitSharedResolution(resolution, externalSignal, () => ({
        status: "unresolved",
    }));
}

async function resolveImagePreviewAfterLease(
    key: string,
    targetUrl: URL
): Promise<ImagePreviewResolution> {
    const deadlineMs = Date.now() + PREVIEW_RESOLUTION_WAIT_MS;
    let lease = await acquirePreviewResolutionLease(key);
    while (lease.status === "held" && Date.now() < deadlineMs) {
        const cached = await waitForImagePreview(targetUrl.href, deadlineMs);
        if (cached.status === "hit") {
            return { status: "resolved", value: cached.value };
        }
        if (cached.status === "negative") {
            return { status: "not_found" };
        }
        if (cached.status === "blocked") {
            return { status: "blocked" };
        }
        lease = await acquirePreviewResolutionLease(key);
    }
    if (lease.status === "held") {
        return { status: "unresolved" };
    }

    try {
        const outcome = await resolveImagePreviewWithTimeout(targetUrl);
        if (outcome.status === "not_found") {
            await writeCachedNegativePreview(targetUrl.href, "image");
            return { status: "not_found" };
        }
        if (outcome.status === "blocked") {
            // A refused upstream is transient. The record ends the wait of
            // concurrent requests; it is never served as a missing preview.
            await writeCachedBlockedPreview(targetUrl.href);
            return { status: "blocked" };
        }
        return { status: "resolved", value: outcome.value };
    } finally {
        if (lease.status === "acquired") {
            releasePreviewResolutionLease(key, lease.token).catch(
                () => undefined
            );
        }
    }
}

async function resolveImagePreviewWithTimeout(
    targetUrl: URL
): Promise<ImagePreviewOutcome> {
    const { signal, clearTimeout } = abortAfter(FETCH_TIMEOUT_MS);
    try {
        return await resolveImagePreview(targetUrl, signal);
    } finally {
        clearTimeout();
    }
}

async function resolveTikTokImagePreview(
    targetUrl: string,
    oembedUrl: string,
    signal?: AbortSignal
): Promise<ResolvedImage | null> {
    const response = await fetchWithRedirects(
        parseHttpUrl(oembedUrl),
        {
            headers: {
                Accept: MIME_TYPES.json,
                "User-Agent": USER_AGENT,
            },
        },
        signal
    );
    if (!response.ok) {
        log.debug("TikTok oEmbed preview request failed", {
            status: response.status,
            targetUrl,
        });
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 404 || response.status === 410) {
            return null;
        }
        throw new Error(
            `TikTok oEmbed preview request failed with status ${response.status}`
        );
    }

    const thumbnailUrl = tiktokOembedThumbnailUrl(await response.json());
    if (!thumbnailUrl) {
        return null;
    }

    return {
        imageUrl: thumbnailUrl,
        pageUrl: targetUrl,
    };
}

async function proxyImageResponse(
    preview: ResolvedImage,
    targetUrl: URL,
    request: Request
): Promise<Response> {
    const assetEtag = previewAssetETag(preview.imageUrl);
    if (ifNoneMatchSatisfied(request.headers.get("if-none-match"), assetEtag)) {
        // The ETag is derived from the resolved asset URL, so a matching
        // client copy is still current and no upstream fetch is needed.
        return previewNotModifiedResponse(assetEtag, targetUrl.href, "image");
    }

    const imageUrl = parseHttpUrl(preview.imageUrl);
    if (!imageUrl) {
        return textResponse("Preview not found", 404);
    }
    const imageResponse = await fetchAsLinkUnfurler(
        imageUrl,
        {
            Accept: "image/*",
            Referer: preview.pageUrl,
        },
        getUserAgent(targetUrl.href),
        request.signal
    );
    if (!imageResponse) {
        return previewUnavailableResponse();
    }

    return streamImageResponse(
        imageResponse,
        targetUrl.href,
        preview,
        assetEtag
    );
}

async function streamImageResponse(
    imageResponse: Response,
    targetHref: string,
    preview: ResolvedImage,
    assetEtag: string
): Promise<Response> {
    if (!imageResponse.ok) {
        await imageResponse.body?.cancel().catch(() => undefined);
        if (imageResponse.status === 404 || imageResponse.status === 410) {
            replaceCachedImagePreviewWithNegative(targetHref, preview);
            return previewNotFoundResponse(targetHref, "image");
        }
        if (isUpstreamRefusal(imageResponse.status)) {
            // The asset host refused the request. The record stays valid: the
            // asset is there, and the refusal is transient.
            return previewUnavailableResponse();
        }
        return textResponse(
            "Preview not found",
            toSafeUpstreamStatus(imageResponse.status)
        );
    }

    const imageContentType = imageResponse.headers.get("content-type") ?? "";
    if (!isSupportedPreviewImageContentType(imageContentType)) {
        await imageResponse.body?.cancel().catch(() => undefined);
        return textResponse("Unsupported preview", 415);
    }

    if (
        isContentLengthOverLimit(
            imageResponse.headers,
            MAX_IMAGE_CONTENT_LENGTH_BYTES
        )
    ) {
        await imageResponse.body?.cancel().catch(() => undefined);
        return textResponse("Preview too large", 413);
    }

    releaseResponseBodyBudget(imageResponse);
    return new Response(imageResponse.body, {
        headers: {
            "cache-control": PROXY_RESPONSE_CACHE_CONTROL,
            "content-security-policy": PREVIEW_SANDBOX_CSP,
            "content-type": imageContentType,
            etag: assetEtag,
            "x-content-type-options": "nosniff",
            ...buildPreviewCacheHeaders(
                targetHref,
                "image",
                PROXY_RESPONSE_CACHE_CONTROL
            ),
        },
        status: 200,
    });
}

async function redirectToPreview(
    previewUrl: string,
    targetHref: string,
    type: PreviewType
): Promise<Response> {
    const publicPreviewUrl = await parsePublicHttpUrl(previewUrl);
    if (!publicPreviewUrl) {
        return textResponse("Preview not found", 404);
    }
    // The contract only allows redirecting to absolute https asset URLs.
    if (publicPreviewUrl.protocol !== "https:") {
        return textResponse("Preview not found", 404);
    }

    const headers = new Headers();
    const cacheControl = redirectCacheControl(
        getSignedUrlLifetimeSeconds(publicPreviewUrl.href)
    );
    headers.set("cache-control", cacheControl);
    headers.set("location", publicPreviewUrl.href);
    setPreviewCacheHeaders(headers, targetHref, type, cacheControl);

    return new Response(null, {
        headers,
        status: 307,
    });
}

async function resolveVideoPreview(
    targetUrl: URL,
    request: Request,
    delivery: PreviewDelivery
): Promise<Response> {
    const { signal } = request;
    if (signal.aborted) {
        return ABORTED_RESPONSE;
    }

    try {
        const videoResult = await resolveVideoWithCoordination(
            targetUrl,
            signal
        );
        if (!videoResult?.videoUrl) {
            if (
                videoResult?.errorCode === PREVIEW_RESOLUTION_TIMEOUT_ERROR_CODE
            ) {
                return textResponse(
                    "Video preview temporarily unavailable",
                    503
                );
            }
            const { classifyCobaltError } = await loadCobaltService();
            const errorCategory = classifyCobaltError(videoResult?.errorCode);
            if (errorCategory === "rate_limited") {
                return textResponse(
                    "Video preview temporarily unavailable due to rate limiting",
                    429
                );
            }
            if (errorCategory === "fetch_failed") {
                return textResponse(
                    "Video preview temporarily unavailable",
                    503
                );
            }
            if (errorCategory === "not_found") {
                writeCachedNegativePreview(targetUrl.href, "video");
                return previewNotFoundResponse(targetUrl.href, "video");
            }
            return previewNotFoundResponse(targetUrl.href, "video");
        }

        if (delivery === "redirect") {
            return redirectToPreview(
                videoResult.videoUrl,
                targetUrl.href,
                "video"
            );
        }

        return proxyVideoResponse(videoResult.videoUrl, targetUrl, request);
    } catch (error) {
        return handlePreviewError(
            error,
            "resolve video preview",
            { message: "Video preview not found", status: 404 },
            { targetUrl: targetUrl.href }
        );
    }
}

async function resolveVideo(
    targetUrl: URL,
    signal?: AbortSignal
): Promise<{ errorCode: string | null; videoUrl: string | null }> {
    const targetHref = targetUrl.href;
    const { resolveCobaltPreview } = await loadCobaltService();
    const result = await resolveCobaltPreview(targetHref, signal);
    if (result.status === "SUCCESS" && result.videoPreviewUrl) {
        writeCachedVideoPreview(targetHref, result.videoPreviewUrl);
        return { errorCode: null, videoUrl: result.videoPreviewUrl };
    }

    const errorCode = result.status === "ERROR" ? result.errorCode : null;
    log.debug("Cobalt preview did not return video", {
        errorCode,
        status: result.status,
        targetUrl: targetHref,
    });

    return { errorCode, videoUrl: null };
}

function resolveVideoWithCoordination(
    targetUrl: URL,
    externalSignal?: AbortSignal
): Promise<{ errorCode: string | null; videoUrl: string | null }> {
    const key = previewRecordKey(targetUrl.href, "video");
    const inFlight = inFlightVideoPreviewResolutions.get(key);
    if (inFlight) {
        return awaitSharedResolution(inFlight, externalSignal, () => ({
            errorCode: PREVIEW_RESOLUTION_TIMEOUT_ERROR_CODE,
            videoUrl: null,
        }));
    }

    const resolution = trackInFlightResolution(
        inFlightVideoPreviewResolutions,
        key,
        resolveVideoAfterLease(key, targetUrl)
    );
    return awaitSharedResolution(resolution, externalSignal, () => ({
        errorCode: PREVIEW_RESOLUTION_TIMEOUT_ERROR_CODE,
        videoUrl: null,
    }));
}

async function resolveVideoAfterLease(
    key: string,
    targetUrl: URL
): Promise<{ errorCode: string | null; videoUrl: string | null }> {
    const deadlineMs = Date.now() + PREVIEW_RESOLUTION_WAIT_MS;
    let lease = await acquirePreviewResolutionLease(key);
    while (lease.status === "held" && Date.now() < deadlineMs) {
        const cached = await waitForVideoPreview(targetUrl.href, deadlineMs);
        if (cached.status === "preview") {
            return { errorCode: null, videoUrl: cached.videoUrl };
        }
        if (cached.status === "negative") {
            return { errorCode: null, videoUrl: null };
        }
        if (cached.status === "failure") {
            return { errorCode: cached.errorCode, videoUrl: null };
        }
        lease = await acquirePreviewResolutionLease(key);
    }
    if (lease.status === "held") {
        return {
            errorCode: PREVIEW_RESOLUTION_TIMEOUT_ERROR_CODE,
            videoUrl: null,
        };
    }

    try {
        const result = await resolveVideoWithTimeout(targetUrl);
        if (!result.videoUrl) {
            await writePreviewRecord(targetUrl.href, "video", {
                errorCode: result.errorCode,
                kind: "video-error",
            });
        }
        return result;
    } finally {
        if (lease.status === "acquired") {
            releasePreviewResolutionLease(key, lease.token).catch(
                () => undefined
            );
        }
    }
}

async function resolveVideoWithTimeout(
    targetUrl: URL
): Promise<{ errorCode: string | null; videoUrl: string | null }> {
    const { signal, clearTimeout } = abortAfter(FETCH_TIMEOUT_MS);
    try {
        return await resolveVideo(targetUrl, signal);
    } finally {
        clearTimeout();
    }
}

async function proxyVideoResponse(
    videoUrl: string,
    targetUrl: URL,
    request: Request
): Promise<Response> {
    try {
        const assetEtag = previewAssetETag(videoUrl);
        if (
            ifNoneMatchSatisfied(
                request.headers.get("if-none-match"),
                assetEtag
            )
        ) {
            // If-None-Match takes precedence over Range (RFC 9110), so the
            // 304 is decided before any Range handling below.
            return previewNotModifiedResponse(
                assetEtag,
                targetUrl.href,
                "video"
            );
        }

        const rangeRequest = parseRangeHeader(request.headers.get("range"));

        const tunnelResponse = await fetchWithRedirects(
            parseHttpUrl(videoUrl),
            {
                headers: {
                    Accept: "video/*",
                    ...(rangeRequest ? { Range: rangeRequest.header } : {}),
                    "User-Agent": USER_AGENT,
                },
            },
            request.signal
        );

        if (!tunnelResponse.ok) {
            await tunnelResponse.body?.cancel().catch(() => undefined);
            return textResponse(
                "Video not available",
                toSafeUpstreamStatus(tunnelResponse.status)
            );
        }

        const contentType = tunnelResponse.headers.get("content-type") ?? "";
        if (!isSupportedVideoContentType(contentType)) {
            await tunnelResponse.body?.cancel().catch(() => undefined);
            return textResponse("Unsupported video preview", 415);
        }

        if (
            isContentLengthOverLimit(
                tunnelResponse.headers,
                MAX_VIDEO_CONTENT_LENGTH_BYTES
            )
        ) {
            await tunnelResponse.body?.cancel().catch(() => undefined);
            return textResponse("Video preview too large", 413);
        }

        const isPartialResponse = tunnelResponse.status === 206;
        const headers = new Headers();
        headers.set("content-type", contentType);
        const contentLength = tunnelResponse.headers.get("content-length");
        if (contentLength) {
            headers.set("content-length", contentLength);
        }
        // Only a 206 body is known to start at rangeRequest.startByte; a 200
        // means the upstream ignored the Range and returned the full body,
        // which must never be described with a synthesized Content-Range.
        const contentRange =
            tunnelResponse.headers.get("content-range") ??
            (isPartialResponse
                ? createContentRangeHeader(rangeRequest, contentLength)
                : null);
        if (contentRange) {
            headers.set("content-range", contentRange);
        }
        headers.set("accept-ranges", "bytes");
        headers.set("content-security-policy", PREVIEW_SANDBOX_CSP);
        headers.set("etag", assetEtag);
        headers.set("x-content-type-options", "nosniff");
        // A byte range is only valid for the request that produced it: never
        // let a shared cache store a 206 under the bare URL.
        const cacheControl = isPartialResponse
            ? NO_STORE_HEADER
            : PROXY_RESPONSE_CACHE_CONTROL;
        headers.set("cache-control", cacheControl);
        setPreviewCacheHeaders(headers, targetUrl.href, "video", cacheControl);

        releaseResponseBodyBudget(tunnelResponse);
        return new Response(tunnelResponse.body, {
            headers,
            status: tunnelResponse.status,
        });
    } catch (error) {
        return handlePreviewError(
            error,
            "proxy video response",
            { message: "Video preview not found", status: 404 },
            { videoUrl }
        );
    }
}

async function fetchWithRedirects(
    initialUrl: URL | null,
    init: RequestInit | undefined,
    signal?: AbortSignal
): Promise<Response> {
    if (!initialUrl) {
        throw new Error("Preview fetch requires a parsed HTTP URL");
    }

    const result = await fetchPublicRedirect(initialUrl, {
        headers: init?.headers,
        maxRedirects: MAX_REDIRECTS,
        method: init?.method,
        signal,
        timeoutMs: FETCH_TIMEOUT_MS,
    });

    if (result.status === "response") {
        return result.response;
    }
    if (result.status === "too_many_redirects") {
        throw new PreviewRedirectLoopError({
            message: "Preview fetch exceeded the redirect limit",
        });
    }
    if (result.status === "blocked") {
        // Local/private/unresolvable host at any hop: fail closed. SSRF blocks
        // are already logged with host context inside fetchPublicRedirect.
        throw new PreviewBlockedHostError({
            message: "Preview fetch blocked by the host policy",
        });
    }
    // A redirect hop without a Location header: the upstream answered, but
    // not with a page.
    throw new Error(`Preview fetch failed: ${result.status}`);
}

/**
 * Tries the caller's identity, then the app identity. The last refused
 * response is returned so the caller can read it; null means no identity got
 * an answer.
 */
async function fetchAsLinkUnfurler(
    url: URL,
    headers: Record<string, string>,
    userAgent: string,
    signal?: AbortSignal
): Promise<Response | null> {
    let refusedResponse: Response | null = null;
    for (const identity of [userAgent, APP_USER_AGENT]) {
        let response: Response;
        try {
            response = await fetchWithRedirects(
                url,
                { headers: { ...headers, "User-Agent": identity } },
                signal
            );
        } catch (error) {
            if (
                isAbortError(error) ||
                PreviewRedirectLoopError.isInstance(error) ||
                PreviewBlockedHostError.isInstance(error)
            ) {
                throw error;
            }
            log.debug("Preview fetch failed", {
                error: error instanceof Error ? error.message : String(error),
                url: url.href,
            });
            continue;
        }
        if (!isUpstreamRefusal(response.status)) {
            await refusedResponse?.body?.cancel().catch(() => undefined);
            return response;
        }
        log.debug("Preview fetch refused", {
            status: response.status,
            url: url.href,
        });
        await refusedResponse?.body?.cancel().catch(() => undefined);
        refusedResponse = response;
    }
    return refusedResponse;
}

function getUserAgent(url: string): string {
    const hostname = tryParseUrl(url)?.hostname.toLowerCase();
    if (
        hostname === INSTAGRAM_HOST ||
        hostname?.endsWith(`.${INSTAGRAM_HOST}`) === true
    ) {
        return GOOGLEBOT_USER_AGENT;
    }
    return USER_AGENT;
}

function isGooglePhotosHost(url: URL): boolean {
    return url.hostname === GOOGLE_PHOTOS_CDN_HOST;
}

/**
 * Proxies a Google Photos CDN image by authenticating the request with the
 * user's Google OAuth access token. Google Photos Picker API baseUrl values
 * require Authorization headers and cannot be fetched anonymously.
 */
async function serveGooglePhotosPreview(
    targetUrl: URL,
    request: Request
): Promise<Response> {
    try {
        const userId = await getSessionUserId();
        if (!userId) {
            return textResponse("Preview not available", 404);
        }

        const accessToken = await resolveProviderAccountAccessToken({
            providerId: "google",
            requiredScope: GOOGLE_PHOTOS_PICKER_SCOPE,
            userId,
        });
        if (!accessToken) {
            log.debug("No Google access token for Google Photos preview", {
                userId,
            });
            return textResponse("Preview not available", 404);
        }

        const imageResponse = await fetchWithTimeout(
            targetUrl.href,
            {
                headers: {
                    Accept: "image/*",
                    Authorization: `Bearer ${accessToken}`,
                    "User-Agent": USER_AGENT,
                },
                redirect: "error",
                signal: request.signal,
            },
            FETCH_TIMEOUT_MS
        );

        if (!imageResponse.ok) {
            log.debug("Google Photos preview upstream failed", {
                status: imageResponse.status,
                targetUrl: targetUrl.href,
            });
            return textResponse("Preview not found", 404);
        }

        const contentType = imageResponse.headers.get("content-type") ?? "";
        if (!isSupportedPreviewImageContentType(contentType)) {
            return textResponse("Unsupported preview", 415);
        }

        if (
            isContentLengthOverLimit(
                imageResponse.headers,
                MAX_IMAGE_CONTENT_LENGTH_BYTES
            )
        ) {
            return textResponse("Preview too large", 413);
        }

        // Do not cache — the upstream URL requires per-request OAuth.
        return new Response(imageResponse.body, {
            headers: {
                "cache-control": "private, no-store",
                "content-security-policy": PREVIEW_SANDBOX_CSP,
                "content-type": contentType,
                "x-content-type-options": "nosniff",
            },
            status: 200,
        });
    } catch (error) {
        return handlePreviewError(
            error,
            "resolve Google Photos preview",
            { message: "Preview not found", status: 404 },
            { targetUrl: targetUrl.href }
        );
    }
}

async function readTextBodyWithLimit(
    response: Response,
    maxBodyBytes: number,
    externalSignal?: AbortSignal
): Promise<string | null> {
    if (isContentLengthOverLimit(response.headers, maxBodyBytes)) {
        await response.body?.cancel().catch(() => undefined);
        return null;
    }

    if (!response.body) {
        return "";
    }

    const { signal, clearTimeout } = abortAfterAny(
        FETCH_TIMEOUT_MS,
        ...(externalSignal ? [externalSignal] : [])
    );
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let body = "";
    let bodyBytes = 0;
    let hasAborted = signal.aborted;

    const onAbort = () => {
        hasAborted = true;
        // Fire-and-forget: a rejecting cancel shouldn't escape and convert a
        // clean abort into a 404 via handlePreviewError.
        reader.cancel("Preview metadata read aborted.").catch(() => undefined);
    };
    if (hasAborted) {
        onAbort();
    } else {
        signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
        for (;;) {
            const { value, done } = await reader.read().catch((error) => {
                // A in-flight cancel can surface as a DOMException other than
                // AbortError, or as a TypeError on already-cancelled readers.
                // Treat any error observed while (or after) we asked for cancel
                // as a benign end-of-stream — otherwise the rejection bubbles
                // through resolveImagePreview and gets surfaced as a 404.
                if (hasAborted || isAbortError(error)) {
                    return { done: true as const, value: undefined };
                }
                throw error;
            });
            if (done || !value) {
                break;
            }

            bodyBytes += value.byteLength;
            if (bodyBytes > maxBodyBytes) {
                const overflow = bodyBytes - maxBodyBytes;
                const allowedSlice = value.subarray(
                    0,
                    value.byteLength - overflow
                );
                if (allowedSlice.byteLength > 0) {
                    body += decoder.decode(allowedSlice, { stream: true });
                }
                // Symmetric with onAbort above: don't let a rejecting cancel
                // escape on this code path either.
                reader
                    .cancel("Preview metadata exceeded size limit.")
                    .catch(() => undefined);
                if (hasAborted) {
                    return null;
                }
                body += decoder.decode();
                return body;
            }

            body += decoder.decode(value, { stream: true });
        }

        if (hasAborted) {
            return null;
        }
        return body + decoder.decode();
    } finally {
        signal.removeEventListener("abort", onAbort);
        clearTimeout();
        reader.releaseLock();
    }
}

async function readFromRedis(key: string): Promise<string | null> {
    try {
        const { getRedisClient } = await loadRedisModule();
        const redis = getRedisClient();
        if (!redis) {
            return null;
        }
        return await redis.get(key);
    } catch (error) {
        log.debug("Redis read failed", {
            error: error instanceof Error ? error.message : String(error),
            key,
        });
        return null;
    }
}

async function writeToRedis(
    key: string,
    value: string,
    ttlSeconds: number
): Promise<void> {
    try {
        const { getRedisClient } = await loadRedisModule();
        const redis = getRedisClient();
        if (!redis) {
            return;
        }
        await redis.set(key, value, { EX: ttlSeconds });
    } catch (error) {
        log.debug("Redis write failed", {
            error: error instanceof Error ? error.message : String(error),
            key,
        });
    }
}

/**
 * Deletes the key only while it still holds `expectedValue` (atomic
 * compare-and-delete), so a lease released after its token expired cannot
 * remove a newer lease acquired by another isolate.
 */
async function deleteFromRedisIfValueMatches(
    key: string,
    expectedValue: string
): Promise<void> {
    const { getRedisClient } = await loadRedisModule();
    const redis = getRedisClient();
    if (!redis) {
        return;
    }
    await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
        { arguments: [expectedValue], keys: [key] }
    );
}

/**
 * One resolution record per (normalized page URL, type): sha256 of the
 * normalized URL plus the type, per the route contract. `delivery` is
 * excluded, so proxy and redirect share one resolution. All record kinds
 * share the key; each write carries its own value and TTL, so the freshest
 * state wins.
 */
function previewRecordKey(targetHref: string, type: PreviewType): string {
    return `preview:${type}:${createHash("sha256").update(targetHref).digest("hex")}`;
}

function previewResolutionLeaseKey(recordKey: string): string {
    return `${recordKey}:lease`;
}

/**
 * Reads the resolution record for (href, type): L1 first, then Redis. Image
 * records whose signed asset URL has expired are misses (and dropped from
 * L1) even while their Redis TTL still runs, because the record can outlive
 * the asset it points at.
 */
async function readPreviewRecord(
    targetHref: string,
    type: PreviewType
): Promise<PreviewRecord | null> {
    const key = previewRecordKey(targetHref, type);
    const memoryRecord = memoryRecordGet(key);
    if (memoryRecord) {
        if (isExpiredImageRecord(memoryRecord)) {
            memoryPreviewRecords.delete(key);
            return null;
        }
        return memoryRecord;
    }

    const cached = await readFromRedis(key);
    if (!cached) {
        return null;
    }
    let parsedJson: unknown;
    try {
        parsedJson = JSON.parse(cached);
    } catch {
        return null;
    }
    const record = parsePreviewRecord(parsedJson);
    if (!record || isExpiredImageRecord(record)) {
        return null;
    }
    memoryRecordSet(key, record);
    return record;
}

/**
 * Writes the record to L1 synchronously and returns the Redis write promise.
 * Lease holders await it before releasing the lease; success writes may leave
 * it running in the background. Redis errors are logged and absorbed.
 */
function writePreviewRecord(
    targetHref: string,
    type: PreviewType,
    record: PreviewRecord,
    ttlSeconds: number = recordRedisTtlSeconds(record)
): Promise<void> {
    const key = previewRecordKey(targetHref, type);
    memoryRecordSet(key, record);
    return writeToRedis(key, JSON.stringify(record), ttlSeconds);
}

async function readCachedVideoPreview(
    targetHref: string
): Promise<CacheLookup<string>> {
    const record = await readPreviewRecord(targetHref, "video");
    if (record?.kind === "video") {
        return { status: "hit", value: record.videoUrl };
    }
    return record?.kind === "negative"
        ? { status: "negative" }
        : { status: "miss" };
}

function writeCachedVideoPreview(targetHref: string, videoUrl: string): void {
    writePreviewRecord(targetHref, "video", { kind: "video", videoUrl });
}

async function readCachedImagePreview(
    targetHref: string
): Promise<ImagePreviewLookup> {
    const record = await readPreviewRecord(targetHref, "image");
    if (record?.kind === "image") {
        return { status: "hit", value: record.preview };
    }
    if (record?.kind === "negative") {
        return { status: "negative" };
    }
    return record?.kind === "blocked"
        ? { status: "blocked" }
        : { status: "miss" };
}

function writeCachedImagePreview(
    targetHref: string,
    preview: ResolvedImage,
    source: ImagePreviewSource
): void {
    const ttlSeconds =
        source === "fallback"
            ? PREVIEW_FALLBACK_IMAGE_CACHE_TTL_SECONDS
            : RECORD_REDIS_TTL_SECONDS.image;
    writePreviewRecord(
        targetHref,
        "image",
        { kind: "image", preview },
        ttlSeconds
    );
}

function writeCachedNegativePreview(
    targetHref: string,
    type: PreviewType
): Promise<void> {
    return writePreviewRecord(targetHref, type, NEGATIVE_PREVIEW_RECORD);
}

function writeCachedBlockedPreview(targetHref: string): Promise<void> {
    return writePreviewRecord(targetHref, "image", BLOCKED_PREVIEW_RECORD);
}

function serializePreviewRecord(record: PreviewRecord): string {
    return JSON.stringify(record);
}

function isExpiredImageRecord(record: PreviewRecord): boolean {
    return (
        record.kind === "image" && isSignedUrlExpired(record.preview.imageUrl)
    );
}

/**
 * Replaces the image record this request just served (upstream 404'd on the
 * proxy) with a negative one. The L1 entry is overwritten unconditionally;
 * Redis compares-and-sets against the stale serialization, so an
 * invalidation decided without a concurrent fresh resolution cannot clobber
 * it — the newer SET wins and stays served.
 */
function replaceCachedImagePreviewWithNegative(
    targetHref: string,
    stalePreview: ResolvedImage
): void {
    const key = previewRecordKey(targetHref, "image");
    memoryRecordSet(key, NEGATIVE_PREVIEW_RECORD);
    replaceStaleRedisRecordWithNegative(
        key,
        serializePreviewRecord({ kind: "image", preview: stalePreview })
    ).catch(() => undefined);
}

async function replaceStaleRedisRecordWithNegative(
    key: string,
    staleValue: string
): Promise<void> {
    try {
        const { getRedisClient } = await loadRedisModule();
        const redis = getRedisClient();
        if (!redis) {
            return;
        }
        await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('set', KEYS[1], ARGV[2], 'EX', ARGV[3]) end return 0",
            {
                arguments: [
                    staleValue,
                    NEGATIVE_PREVIEW_RECORD_JSON,
                    String(PREVIEW_NEGATIVE_CACHE_TTL_SECONDS),
                ],
                keys: [key],
            }
        );
    } catch (error) {
        log.debug("Redis preview record replace failed", {
            error: error instanceof Error ? error.message : String(error),
            key,
        });
    }
}

async function waitForImagePreview(
    targetHref: string,
    deadlineMs: number
): Promise<ImagePreviewLookup> {
    do {
        await wait(
            Math.min(PREVIEW_RESOLUTION_POLL_MS, deadlineMs - Date.now())
        );
        const cached = await readCachedImagePreview(targetHref);
        if (cached.status !== "miss") {
            return cached;
        }
    } while (Date.now() < deadlineMs);
    return { status: "miss" };
}

async function waitForVideoPreview(
    targetHref: string,
    deadlineMs: number
): Promise<VideoPreviewWaitResult> {
    do {
        await wait(
            Math.min(PREVIEW_RESOLUTION_POLL_MS, deadlineMs - Date.now())
        );
        const record = await readPreviewRecord(targetHref, "video");
        if (record?.kind === "video") {
            return { status: "preview", videoUrl: record.videoUrl };
        }
        if (record?.kind === "negative") {
            return { status: "negative" };
        }
        if (record?.kind === "video-error") {
            return { errorCode: record.errorCode, status: "failure" };
        }
    } while (Date.now() < deadlineMs);
    return { status: "miss" };
}

function wait(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, timeoutMs);
    });
}

type PreviewResolutionLease =
    | { status: "acquired"; token: string }
    | { status: "held" }
    | { status: "unavailable" };

async function acquirePreviewResolutionLease(
    cacheKey: string
): Promise<PreviewResolutionLease> {
    try {
        const { getRedisClient } = await loadRedisModule();
        const redis = getRedisClient();
        if (!redis) {
            return { status: "unavailable" };
        }
        const token = randomUUID();
        const result = await redis.set(
            previewResolutionLeaseKey(cacheKey),
            token,
            {
                condition: "NX",
                expiration: {
                    type: "EX",
                    value: PREVIEW_RESOLUTION_LEASE_TTL_SECONDS,
                },
            }
        );
        return result === "OK"
            ? { status: "acquired", token }
            : { status: "held" };
    } catch (error) {
        log.debug("Preview resolution lease unavailable", {
            error: error instanceof Error ? error.message : String(error),
        });
        return { status: "unavailable" };
    }
}

async function releasePreviewResolutionLease(
    cacheKey: string,
    token: string
): Promise<void> {
    try {
        await deleteFromRedisIfValueMatches(
            previewResolutionLeaseKey(cacheKey),
            token
        );
    } catch (error) {
        log.debug("Preview resolution lease release failed", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

function isSignedUrlExpired(imageUrl: string): boolean {
    // Skip URL parsing when the expiry parameter cannot be present.
    if (!imageUrl.includes(SIGNED_URL_EXPIRY_PARAM)) {
        return false;
    }
    const lifetimeSeconds = getSignedUrlLifetimeSeconds(imageUrl);
    if (lifetimeSeconds === null) {
        return false;
    }
    return lifetimeSeconds <= SIGNED_URL_GRACE_SECONDS;
}

// The ETag identifies the resolved asset, not the page: it is derived from
// the record's asset URL so a 304 can be decided without touching upstream.
// Weak, because a proxy cannot promise byte-identical upstream content.
function previewAssetETag(assetUrl: string): string {
    return `W/"${createHash("sha256").update(assetUrl).digest("hex")}"`;
}

/**
 * Weak comparison per RFC 9110 (If-None-Match never uses strong comparison):
 * `W/` prefixes are ignored and `*` matches any current representation.
 */
function ifNoneMatchSatisfied(
    ifNoneMatch: string | null,
    etag: string
): boolean {
    if (!ifNoneMatch) {
        return false;
    }
    const opaqueTag = stripEtagWeakness(etag);
    return ifNoneMatch.split(",").some((candidate) => {
        const trimmed = candidate.trim();
        return trimmed === "*" || stripEtagWeakness(trimmed) === opaqueTag;
    });
}

function stripEtagWeakness(etag: string): string {
    return etag.startsWith("W/") ? etag.slice(2) : etag;
}

function getSignedUrlLifetimeSeconds(
    imageUrl: string | undefined
): number | null {
    if (!imageUrl?.includes(SIGNED_URL_EXPIRY_PARAM)) {
        return null;
    }
    const expirySeconds = tryParseUrl(imageUrl)?.searchParams.get(
        SIGNED_URL_EXPIRY_PARAM
    );
    if (!expirySeconds) {
        return null;
    }
    const expiryMs = Number.parseInt(expirySeconds, 10) * 1000;
    if (!Number.isFinite(expiryMs)) {
        return null;
    }
    return Math.floor((expiryMs - Date.now()) / 1000);
}

function normalizePreviewContentType(contentType: string): string {
    if (getMimeType(contentType) === "application/xhtml+xml") {
        return contentType.replace(XHTML_CONTENT_TYPE_PATTERN, MIME_TYPES.html);
    }
    return contentType;
}

function shouldReadPreviewResponseBody(contentType: string): boolean {
    const mimeType = getMimeType(contentType);
    return !mimeType || mimeType.startsWith("text/");
}

function getMimeType(contentType: string): string {
    return contentType.split(";")[0]?.trim().toLowerCase() ?? "";
}

function parseRangeHeader(
    rangeHeader: string | null
): VideoRangeRequest | null {
    if (!rangeHeader) {
        return null;
    }

    const match = HTTP_SINGLE_RANGE_HEADER_PATTERN.exec(rangeHeader);
    if (!match) {
        return null;
    }

    const startByte = parseRangeByte(match[1]);
    const endByte = parseRangeByte(match[2]);
    if (startByte === null && endByte === null) {
        return null;
    }
    if (startByte !== null && endByte !== null && endByte < startByte) {
        return null;
    }

    return {
        endByte,
        header: rangeHeader,
        startByte,
    };
}

function parseRangeByte(value: string | undefined): number | null {
    if (!value) {
        return null;
    }

    const parsed = Number(value);
    if (!(Number.isInteger(parsed) && parsed >= 0)) {
        return null;
    }

    return parsed;
}

function createContentRangeHeader(
    rangeRequest: VideoRangeRequest | null,
    contentLength: string | null
): string | null {
    if (!(rangeRequest && contentLength && rangeRequest.startByte !== null)) {
        return null;
    }

    const responseBodyByteLength = Number(contentLength);
    if (
        !(
            Number.isInteger(responseBodyByteLength) &&
            responseBodyByteLength > 0
        )
    ) {
        return null;
    }

    const endByte =
        rangeRequest.endByte ??
        rangeRequest.startByte + responseBodyByteLength - 1;
    if (endByte < rangeRequest.startByte) {
        return null;
    }

    return `bytes ${rangeRequest.startByte}-${endByte}/*`;
}

function isSupportedVideoContentType(contentType: string): boolean {
    const mimeType = getMimeType(contentType);
    return SUPPORTED_PREVIEW_VIDEO_MIME_TYPES.has(mimeType);
}

function isSupportedPreviewImageContentType(contentType: string): boolean {
    const mimeType = getMimeType(contentType);
    return SUPPORTED_PREVIEW_IMAGE_MIME_TYPES.has(mimeType);
}

function isContentLengthOverLimit(
    headers: Headers,
    maxContentLengthBytes: number
): boolean {
    const contentLength = headers.get("content-length");
    if (!contentLength) {
        return false;
    }
    const contentLengthBytes = Number(contentLength);
    return (
        Number.isFinite(contentLengthBytes) &&
        contentLengthBytes > maxContentLengthBytes
    );
}

function toSafeUpstreamStatus(status: number): number {
    if (status >= 400 && status <= 599) {
        return status;
    }
    return 502;
}

function previewResponseCacheControl(
    signedUrlLifetimeSeconds: number | null
): string {
    if (signedUrlLifetimeSeconds === null) {
        return UNSIGNED_IMAGE_CACHE_CONTROL_HEADER;
    }
    if (signedUrlLifetimeSeconds <= 0) {
        return NO_STORE_HEADER;
    }
    return `public, max-age=${Math.min(60, signedUrlLifetimeSeconds)}, s-maxage=${signedUrlLifetimeSeconds}`;
}

function redirectCacheControl(signedUrlLifetimeSeconds: number | null): string {
    const maxAgeSeconds =
        signedUrlLifetimeSeconds === null
            ? REDIRECT_CACHE_MAX_AGE_SECONDS
            : Math.max(
                  0,
                  Math.min(
                      signedUrlLifetimeSeconds,
                      REDIRECT_CACHE_MAX_AGE_SECONDS
                  )
              );
    return `public, max-age=${maxAgeSeconds}`;
}

function buildPreviewCacheHeaders(
    targetHref: string,
    type: PreviewType,
    cacheControl: string
) {
    // Video records churn every 5 minutes; keep the edge revalidating on the
    // record cadence even while browsers hold the bytes for the contract
    // lifetime.
    const vercelCacheControl =
        type === "video" && cacheControl === PROXY_RESPONSE_CACHE_CONTROL
            ? VERCEL_CDN_VIDEO_CACHE_CONTROL_HEADER
            : cacheControl;
    return {
        [VERCEL_CDN_CACHE_CONTROL_HEADER_NAME]: vercelCacheControl,
        [VERCEL_CACHE_TAG_HEADER]: previewRecordKey(targetHref, type),
    };
}

function setPreviewCacheHeaders(
    headers: Headers,
    targetHref: string,
    type: PreviewType,
    cacheControl: string
): void {
    for (const [key, value] of Object.entries(
        buildPreviewCacheHeaders(targetHref, type, cacheControl)
    )) {
        headers.set(key, value);
    }
}

function handlePreviewError(
    error: unknown,
    operation: string,
    failure: { message: string; status: number },
    context: Record<string, unknown>
): Response {
    if (isAbortError(error)) {
        return ABORTED_RESPONSE;
    }
    if (PreviewRedirectLoopError.isInstance(error)) {
        return textResponse("Too many redirects", 508);
    }
    if (PreviewBlockedHostError.isInstance(error)) {
        // A blocked host is permanent: report a missing preview, not the
        // transient failure the caller would otherwise return.
        log.warn(`Failed to ${operation}`, {
            error: error.message,
            ...context,
        });
        return textResponse(
            failure.status === 404 ? failure.message : "Preview not found",
            404
        );
    }
    log.warn(`Failed to ${operation}`, {
        error: error instanceof Error ? error.message : String(error),
        ...context,
    });
    return textResponse(failure.message, failure.status);
}

function previewNotFoundResponse(
    targetHref: string,
    type: PreviewType
): Response {
    return new Response("Preview not found", {
        headers: {
            "cache-control": `public, max-age=${PREVIEW_NEGATIVE_CACHE_TTL_SECONDS}, s-maxage=${PREVIEW_NEGATIVE_CACHE_TTL_SECONDS}`,
            "content-type": PLAIN_TEXT_CONTENT_TYPE,
            [VERCEL_CDN_CACHE_CONTROL_HEADER_NAME]: `public, max-age=${PREVIEW_NEGATIVE_CACHE_TTL_SECONDS}`,
            [VERCEL_CACHE_TAG_HEADER]: previewRecordKey(targetHref, type),
        },
        status: 404,
    });
}

/** A transient upstream failure: uncached, so the client can retry. */
function previewUnavailableResponse(): Response {
    return textResponse("Preview temporarily unavailable", 503);
}

function previewNotModifiedResponse(
    etag: string,
    targetHref: string,
    type: PreviewType
): Response {
    const headers = new Headers();
    headers.set("cache-control", PROXY_RESPONSE_CACHE_CONTROL);
    headers.set("etag", etag);
    setPreviewCacheHeaders(
        headers,
        targetHref,
        type,
        PROXY_RESPONSE_CACHE_CONTROL
    );
    return new Response(null, { headers, status: 304 });
}

function textResponse(body: string, status: number): Response {
    return new Response(body, {
        headers: {
            "cache-control": NO_STORE_HEADER,
            "content-type": PLAIN_TEXT_CONTENT_TYPE,
        },
        status,
    });
}
