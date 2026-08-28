import { createHash, randomUUID } from "node:crypto";
import { getSessionUserId } from "@/lib/auth/session";
import { abortAfterAny, isAbortError } from "@/lib/common/abort";
import { MIME_TYPES } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    fetchPublicRedirect,
    releaseResponseBodyBudget,
} from "@/lib/common/security/fetch";
import { parseHttpUrl } from "@/lib/common/security/ssrf";
import { parsePublicHttpUrl } from "@/lib/common/security/ssrf-url";
import { fetchWithTimeout } from "@/lib/common/timeout";
import { parseStandaloneUrl } from "@/lib/common/url";
import { resolveProviderAccountAccessToken } from "@/lib/integrations/account";
import { isCobaltHost } from "@/lib/integrations/cobalt/utils";
import { GOOGLE_PHOTOS_PICKER_SCOPE } from "@/lib/integrations/google-photos/shared";
import {
    tiktokOembedThumbnailUrl,
    tiktokOembedUrl,
} from "@/lib/integrations/tiktok/oembed";

const log = createLogger("api:library:preview");

const CACHE_CONTROL_HEADER =
    "public, max-age=60, s-maxage=300, stale-while-revalidate=60";
const UNSIGNED_IMAGE_CACHE_CONTROL_HEADER =
    "public, max-age=60, s-maxage=86400, stale-while-revalidate=604800";
const VERCEL_CDN_IMAGE_CACHE_CONTROL_HEADER =
    "public, max-age=86400, stale-while-revalidate=604800";
const VERCEL_CDN_VIDEO_CACHE_CONTROL_HEADER =
    "public, max-age=300, stale-while-revalidate=60";
const VERCEL_CACHE_TAG_HEADER = "Vercel-Cache-Tag";
const VERCEL_CDN_CACHE_CONTROL_HEADER_NAME = "Vercel-CDN-Cache-Control";
const NO_STORE_HEADER = "private, no-store";
const PLAIN_TEXT_CONTENT_TYPE = `${MIME_TYPES.text}; charset=utf-8`;
const SIGNED_URL_EXPIRY_PARAM = "x-expires";
const SIGNED_URL_GRACE_SECONDS = 300;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
const MAX_TARGET_URL_LENGTH = 4096;
const MAX_PREVIEW_METADATA_BODY_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_CONTENT_LENGTH_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_CONTENT_LENGTH_BYTES = 200 * 1024 * 1024;
const COBALT_CACHE_TTL_SECONDS = 5 * 60;
const COBALT_CACHE_KEY_PREFIX = "cobalt-preview:";
// og:image values are effectively static (sites change them on the order of
// weeks), and every cache read re-checks signed-URL expiry via
// isSignedUrlExpired, so a long positive TTL is safe: expired entries re-resolve
// on demand, and an upstream image that dies surfaces only until the next
// negative-cache cycle (60s) triggers a fresh resolution.
const PREVIEW_IMAGE_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
const PREVIEW_IMAGE_CACHE_KEY_PREFIX = "preview-image:";
const PREVIEW_NEGATIVE_CACHE_TTL_SECONDS = 60;
const PREVIEW_NEGATIVE_CACHE_KEY_PREFIX = "preview-negative:";
const PREVIEW_RESOLUTION_LEASE_TTL_SECONDS = 12;
const PREVIEW_RESOLUTION_LEASE_KEY_PREFIX = "preview-resolution:";
const VIDEO_RESOLUTION_ERROR_CACHE_KEY_PREFIX = "preview-video-error:";
const PREVIEW_RESOLUTION_WAIT_MS = 12_000;
const PREVIEW_RESOLUTION_POLL_MS = 250;
// Process-local L1 in front of Redis. Bench (remote Redis ~500ms RTT): cache-hit
// redirect p50 614ms → sub-ms on warm L1; load-test p99 collapses when the same
// URLs repeat within an isolate. Cap entries to bound memory; TTL matches Redis.
const MEMORY_CACHE_MAX_ENTRIES = 256;
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
]);
const SUPPORTED_PREVIEW_VIDEO_MIME_TYPES = new Set<string>([
    "video/mp4",
    "video/quicktime",
    "video/webm",
]);
const USER_AGENT =
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
const GOOGLEBOT_USER_AGENT =
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
// const BROWSER_USER_AGENT =
//     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
const HTTP_SINGLE_RANGE_HEADER_PATTERN = /^bytes=(\d*)-(\d*)$/;
const XHTML_CONTENT_TYPE_PATTERN = /^application\/xhtml\+xml/i;
const ABORTED_RESPONSE = new Response(null, { status: 499 });
const INSTAGRAM_HOSTS = new Set(["instagram.com", ".instagram.com"]);
const GOOGLE_PHOTOS_CDN_HOST = "lh3.googleusercontent.com";

type PreviewType = "image" | "video";

type PreviewDelivery = "proxy" | "redirect";

interface VideoRangeRequest {
    endByte: number | null;
    header: string;
    startByte: number | null;
}

interface ResolvedImage {
    imageUrl: string;
    pageUrl: string;
}

type CacheLookup<T> =
    | { status: "hit"; value: T }
    | { status: "negative" }
    | { status: "miss" };

type VideoPreviewWaitResult =
    | { status: "preview"; videoUrl: string }
    | { status: "negative" }
    | { status: "failure"; errorCode: string | null }
    | { status: "miss" };

interface ResolvedImagePreview {
    imageResponse: Response | null;
    preview: ResolvedImage;
}

type ImagePreviewResolution =
    | { status: "resolved"; value: ResolvedImagePreview }
    | { status: "not_found" }
    | { status: "unresolved" };

// Lazy-loaded only on the HTML cache-miss path (not cache-hit / video).
// On import failure, clear the cached promise so the next request can retry.
let extractPreviewImageUrlsPromise: Promise<
    typeof import("@/lib/og/extract").extractPreviewImageUrls
> | null = null;

function loadExtractPreviewImageUrls() {
    extractPreviewImageUrlsPromise ??= import("@/lib/og/extract")
        .then((mod) => mod.extractPreviewImageUrls)
        .catch((error: unknown) => {
            extractPreviewImageUrlsPromise = null;
            throw error;
        });
    return extractPreviewImageUrlsPromise;
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

// Lazy-loaded on first cache op. Static `redis` import was ~90% of route cold-start
// (p50 62ms → ~6ms without it). First request pays import; subsequent share the module.
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

interface MemoryCacheEntry<T> {
    expiresAtMs: number;
    value: T;
}

// Insertion-order Map as crude LRU: re-set on hit moves to end; evict from front.
const memoryImagePreviewCache = new Map<
    string,
    MemoryCacheEntry<ResolvedImage>
>();
const memoryVideoPreviewCache = new Map<string, MemoryCacheEntry<string>>();
const memoryVideoResolutionErrorCache = new Map<
    string,
    MemoryCacheEntry<{ errorCode: string | null }>
>();
const memoryNegativePreviewCache = new Map<string, MemoryCacheEntry<true>>();
const inFlightImagePreviewResolutions = new Map<
    string,
    Promise<ImagePreviewResolution>
>();
const inFlightVideoPreviewResolutions = new Map<
    string,
    Promise<{ errorCode: string | null; videoUrl: string | null }>
>();

function memoryCacheGet<T>(
    cache: Map<string, MemoryCacheEntry<T>>,
    key: string
): T | null {
    const entry = cache.get(key);
    if (!entry) {
        return null;
    }
    if (Date.now() >= entry.expiresAtMs) {
        cache.delete(key);
        return null;
    }
    // LRU touch
    cache.delete(key);
    cache.set(key, entry);
    return entry.value;
}

function memoryCacheSet<T>(
    cache: Map<string, MemoryCacheEntry<T>>,
    key: string,
    value: T,
    ttlSeconds: number
): void {
    if (cache.has(key)) {
        cache.delete(key);
    } else if (cache.size >= MEMORY_CACHE_MAX_ENTRIES) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) {
            cache.delete(oldestKey);
        }
    }
    cache.set(key, {
        expiresAtMs: Date.now() + ttlSeconds * 1000,
        value,
    });
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
    return {
        imageUrl: value.imageUrl,
        pageUrl: value.pageUrl,
    };
}

export async function GET(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);

    const targetUrl = parseTargetUrlSync(requestUrl.searchParams.get("url"));
    if (!targetUrl) {
        return textResponse("Invalid URL", 400);
    }

    const delivery = parsePreviewDelivery(
        requestUrl.searchParams.get("delivery")
    );
    if (!delivery) {
        return textResponse("Unsupported preview delivery", 400);
    }

    const contentType = parsePreviewType(requestUrl.searchParams.get("type"));
    if (!contentType) {
        return textResponse("Unsupported preview type", 400);
    }

    // Google Photos CDN URLs require OAuth authorization. Only image
    // previews are supported; video and invalid-type responses are handled
    // by the standard checks above.
    if (contentType === "image" && isGooglePhotosHost(targetUrl)) {
        return serveGooglePhotosPreview(targetUrl, request);
    }

    if (contentType === "video") {
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

        const publicTargetUrl = await parsePublicHttpUrl(targetUrl.href);
        if (!publicTargetUrl) {
            return textResponse("Invalid URL", 400);
        }

        const resolution = await resolveImagePreviewWithCoordination(
            publicTargetUrl,
            delivery === "proxy",
            request.signal
        );
        if (resolution.status === "not_found") {
            writeCachedNegativePreview(targetUrl.href, "image");
            return previewNotFoundResponse(targetUrl.href, "image");
        }
        if (resolution.status === "unresolved") {
            return previewNotFoundResponse(targetUrl.href, "image");
        }
        const { value: preview } = resolution;
        if (delivery === "redirect") {
            return redirectToPreview(
                preview.preview.imageUrl,
                publicTargetUrl.href,
                "image"
            );
        }
        if (preview.imageResponse) {
            return streamImageResponse(
                preview.imageResponse,
                publicTargetUrl.href,
                preview.preview.imageUrl
            );
        }
        return proxyImageResponse(preview.preview, publicTargetUrl, request);
    } catch (error) {
        return handlePreviewError(
            error,
            "resolve preview",
            "Preview not found",
            { targetUrl: targetUrl.href }
        );
    }
}

function parseTargetUrlSync(rawValue: string | null): URL | null {
    if (!rawValue || rawValue.length > MAX_TARGET_URL_LENGTH) {
        return null;
    }
    const standaloneUrl = parseStandaloneUrl(rawValue);
    if (!standaloneUrl) {
        return null;
    }
    return parseHttpUrl(standaloneUrl.href);
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

async function resolveImagePreview(
    targetUrl: URL,
    shouldRetainDirectImageResponse: boolean,
    signal?: AbortSignal
): Promise<ResolvedImagePreview | null> {
    const targetHref = targetUrl.href;

    const oembedUrl = tiktokOembedUrl(targetHref);
    if (oembedUrl) {
        const preview = await resolveTikTokImagePreview(
            targetHref,
            oembedUrl,
            signal
        );
        if (preview) {
            writeCachedImagePreview(targetHref, preview);
            return { imageResponse: null, preview };
        }
        return null;
    }

    const pageResponse = await fetchWithRedirects(
        targetUrl,
        {
            headers: {
                Accept: "text/html,application/xhtml+xml,image/*",
                // When this turns out to be a direct image, retaining this
                // response avoids a second request while preserving the
                // referer the former image-proxy fetch supplied.
                Referer: targetHref,
                "User-Agent": getUserAgent(targetHref),
            },
        },
        signal
    );
    if (!pageResponse.ok) {
        log.debug("Preview page request failed", {
            status: pageResponse.status,
            targetUrl: targetHref,
        });
        if (pageResponse.status === 404 || pageResponse.status === 410) {
            return null;
        }
        throw new Error(
            `Preview page request failed with status ${pageResponse.status}`
        );
    }

    const pageContentType = pageResponse.headers.get("content-type") ?? "";
    if (isSupportedPreviewImageContentType(pageContentType)) {
        const result: ResolvedImage = {
            imageUrl: pageResponse.url || targetHref,
            pageUrl: targetHref,
        };
        writeCachedImagePreview(targetHref, result);
        if (shouldRetainDirectImageResponse) {
            return { imageResponse: pageResponse, preview: result };
        }
        // Redirect delivery has no use for the body. Release the connection
        // before returning its location to the client.
        await pageResponse.body?.cancel().catch(() => undefined);
        return { imageResponse: null, preview: result };
    }

    const previewContentType =
        normalizePreviewContentType(pageContentType) || pageContentType;
    const previewBody = shouldReadPreviewResponseBody(previewContentType)
        ? await readTextBodyWithLimit(
              pageResponse,
              MAX_PREVIEW_METADATA_BODY_BYTES,
              signal
          )
        : "";
    if (previewBody === null) {
        if (signal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        return null;
    }

    // extractPreviewImageUrls replaces link-preview-js's cheerio/parse5 DOM
    // parse with an htmlparser2 streaming scan (~10x faster on a 150 KiB page).
    // Lazy-imported so cache-hit / video cold starts skip htmlparser2.
    // baseUrl is the final post-redirect URL (or the original target) so
    // relative og:image/<img> resolve identically.
    const baseUrl = pageResponse.url || targetHref;
    const extractPreviewImageUrls = await loadExtractPreviewImageUrls();
    const imageUrl = getFirstHttpUrl(
        extractPreviewImageUrls(previewBody, baseUrl)
    );
    if (!imageUrl) {
        return null;
    }

    const result = {
        imageUrl,
        pageUrl: parseHttpUrl(baseUrl)?.href ?? targetHref,
    };
    writeCachedImagePreview(targetHref, result);
    return { imageResponse: null, preview: result };
}

async function resolveImagePreviewWithCoordination(
    targetUrl: URL,
    shouldRetainDirectImageResponse: boolean,
    externalSignal?: AbortSignal
): Promise<ImagePreviewResolution> {
    const key = previewImageCacheKey(targetUrl.href);
    const inFlight = inFlightImagePreviewResolutions.get(key);
    if (inFlight) {
        const resolution = await inFlight;
        if (resolution.status !== "resolved") {
            return resolution;
        }
        return {
            status: "resolved",
            value: { imageResponse: null, preview: resolution.value.preview },
        };
    }

    const resolution = resolveImagePreviewAfterLease(
        key,
        targetUrl,
        shouldRetainDirectImageResponse,
        externalSignal
    );
    inFlightImagePreviewResolutions.set(key, resolution);
    try {
        return await resolution;
    } finally {
        inFlightImagePreviewResolutions.delete(key);
    }
}

async function resolveImagePreviewAfterLease(
    key: string,
    targetUrl: URL,
    shouldRetainDirectImageResponse: boolean,
    externalSignal?: AbortSignal
): Promise<ImagePreviewResolution> {
    if (externalSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
    }

    const deadlineMs = Date.now() + PREVIEW_RESOLUTION_WAIT_MS;
    let lease = await acquirePreviewResolutionLease(key);
    while (lease.status === "held" && Date.now() < deadlineMs) {
        if (externalSignal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        const cached = await waitForImagePreview(
            targetUrl.href,
            deadlineMs,
            externalSignal
        );
        if (cached.status === "hit") {
            return {
                status: "resolved",
                value: { imageResponse: null, preview: cached.value },
            };
        }
        if (cached.status === "negative") {
            return { status: "not_found" };
        }
        lease = await acquirePreviewResolutionLease(key);
    }
    if (lease.status === "held") {
        return { status: "unresolved" };
    }

    try {
        const preview = await resolveImagePreviewWithTimeout(
            targetUrl,
            shouldRetainDirectImageResponse,
            externalSignal
        );
        if (!preview) {
            await writeCachedNegativePreview(targetUrl.href, "image");
            return { status: "not_found" };
        }
        return { status: "resolved", value: preview };
    } finally {
        if (lease.status === "acquired") {
            releasePreviewResolutionLease(key, lease.token).catch(
                () => undefined
            );
        }
    }
}

async function resolveImagePreviewWithTimeout(
    targetUrl: URL,
    shouldRetainDirectImageResponse: boolean,
    externalSignal?: AbortSignal
): Promise<ResolvedImagePreview | null> {
    const { signal, clearTimeout } = abortAfterAny(
        FETCH_TIMEOUT_MS,
        ...(externalSignal ? [externalSignal] : [])
    );
    try {
        return await resolveImagePreview(
            targetUrl,
            shouldRetainDirectImageResponse,
            signal
        );
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
    const imageResponse = await fetchWithRedirects(
        parseHttpUrl(preview.imageUrl),
        {
            headers: {
                Accept: "image/*",
                Referer: preview.pageUrl,
                "User-Agent": getUserAgent(targetUrl.href),
            },
        },
        request.signal
    );

    return streamImageResponse(
        imageResponse,
        targetUrl.href,
        imageResponse.url || preview.imageUrl
    );
}

function streamImageResponse(
    imageResponse: Response,
    targetHref: string,
    previewUrl: string
): Response {
    if (!imageResponse.ok) {
        if (imageResponse.status === 404 || imageResponse.status === 410) {
            deleteCachedImagePreview(targetHref);
            writeCachedNegativePreview(targetHref, "image").catch(
                () => undefined
            );
            return previewNotFoundResponse(targetHref, "image");
        }
        return textResponse("Preview not found", 404);
    }

    const imageContentType = imageResponse.headers.get("content-type") ?? "";
    if (!isSupportedPreviewImageContentType(imageContentType)) {
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

    const signedUrlLifetimeSeconds = getSignedUrlLifetimeSeconds(previewUrl);
    releaseResponseBodyBudget(imageResponse);
    return new Response(imageResponse.body, {
        headers: {
            "cache-control": previewResponseCacheControl(
                "image",
                signedUrlLifetimeSeconds
            ),
            "content-type": imageContentType,
            ...buildPreviewCacheHeaders(
                targetHref,
                "image",
                signedUrlLifetimeSeconds
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

    const headers = new Headers();
    const signedUrlLifetimeSeconds = getSignedUrlLifetimeSeconds(
        publicPreviewUrl.href
    );
    headers.set(
        "cache-control",
        previewResponseCacheControl(type, signedUrlLifetimeSeconds)
    );
    headers.set("location", publicPreviewUrl.href);
    setPreviewCacheHeaders(headers, targetHref, type, signedUrlLifetimeSeconds);

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
            "Video preview not found",
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

async function resolveVideoWithCoordination(
    targetUrl: URL,
    externalSignal?: AbortSignal
): Promise<{ errorCode: string | null; videoUrl: string | null }> {
    const key = cobaltCacheKey(targetUrl.href);
    const inFlight = inFlightVideoPreviewResolutions.get(key);
    if (inFlight) {
        return inFlight;
    }

    const resolution = resolveVideoAfterLease(key, targetUrl, externalSignal);
    inFlightVideoPreviewResolutions.set(key, resolution);
    try {
        return await resolution;
    } finally {
        inFlightVideoPreviewResolutions.delete(key);
    }
}

async function resolveVideoAfterLease(
    key: string,
    targetUrl: URL,
    externalSignal?: AbortSignal
): Promise<{ errorCode: string | null; videoUrl: string | null }> {
    if (externalSignal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
    }

    const deadlineMs = Date.now() + PREVIEW_RESOLUTION_WAIT_MS;
    let lease = await acquirePreviewResolutionLease(key);
    while (lease.status === "held" && Date.now() < deadlineMs) {
        if (externalSignal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        const cached = await waitForVideoPreview(
            targetUrl.href,
            deadlineMs,
            externalSignal
        );
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
        return { errorCode: null, videoUrl: null };
    }

    try {
        const result = await resolveVideoWithTimeout(targetUrl, externalSignal);
        if (!result.videoUrl) {
            await writeCachedVideoResolutionError(
                targetUrl.href,
                result.errorCode
            );
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
    targetUrl: URL,
    externalSignal?: AbortSignal
): Promise<{ errorCode: string | null; videoUrl: string | null }> {
    const { signal, clearTimeout } = abortAfterAny(
        FETCH_TIMEOUT_MS,
        ...(externalSignal ? [externalSignal] : [])
    );
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
            return textResponse(
                "Video not available",
                toSafeUpstreamStatus(tunnelResponse.status)
            );
        }

        const contentType = tunnelResponse.headers.get("content-type") ?? "";
        if (!isSupportedVideoContentType(contentType)) {
            return textResponse("Unsupported video preview", 415);
        }

        if (
            isContentLengthOverLimit(
                tunnelResponse.headers,
                MAX_VIDEO_CONTENT_LENGTH_BYTES
            )
        ) {
            return textResponse("Video preview too large", 413);
        }

        const headers = new Headers();
        headers.set("content-type", contentType);
        const contentLength = tunnelResponse.headers.get("content-length");
        if (contentLength) {
            headers.set("content-length", contentLength);
        }
        const contentRange =
            tunnelResponse.headers.get("content-range") ??
            createContentRangeHeader(rangeRequest, contentLength);
        if (contentRange) {
            headers.set("content-range", contentRange);
        }
        headers.set("accept-ranges", "bytes");
        headers.set("cache-control", CACHE_CONTROL_HEADER);
        setPreviewCacheHeaders(headers, targetUrl.href, "video");

        releaseResponseBodyBudget(tunnelResponse);
        return new Response(tunnelResponse.body, {
            headers,
            status: tunnelResponse.status,
        });
    } catch (error) {
        return handlePreviewError(
            error,
            "proxy video response",
            "Video preview not found",
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
        return textResponse("Invalid URL", 400);
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
        return textResponse("Too many redirects", 508);
    }
    // Local/private/unresolvable host at any hop, or a redirect to a
    // non-HTTP(S) target: fail closed.
    if (result.status === "blocked") {
        log.warn("Preview fetch blocked by SSRF policy", {
            targetUrl: initialUrl.href,
        });
    }
    return textResponse("Invalid URL", 400);
}

function getUserAgent(url: string): string {
    try {
        const hostname = new URL(url).hostname.toLowerCase();
        if (INSTAGRAM_HOSTS.has(hostname)) {
            return GOOGLEBOT_USER_AGENT;
        }
    } catch {
        // fall through
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
                "content-type": contentType,
            },
            status: 200,
        });
    } catch (error) {
        return handlePreviewError(
            error,
            "resolve Google Photos preview",
            "Preview not found",
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
function hashTargetUrl(targetHref: string): string {
    return createHash("sha256").update(targetHref).digest("hex").slice(0, 16);
}

function cobaltCacheKey(targetHref: string): string {
    return `${COBALT_CACHE_KEY_PREFIX}${hashTargetUrl(targetHref)}`;
}

function previewImageCacheKey(targetHref: string): string {
    return `${PREVIEW_IMAGE_CACHE_KEY_PREFIX}${hashTargetUrl(targetHref)}`;
}

function previewNegativeCacheKey(
    targetHref: string,
    type: PreviewType
): string {
    return `${PREVIEW_NEGATIVE_CACHE_KEY_PREFIX}${type}:${hashTargetUrl(targetHref)}`;
}

function previewResolutionLeaseKey(cacheKey: string): string {
    return `${PREVIEW_RESOLUTION_LEASE_KEY_PREFIX}${cacheKey}`;
}

function videoResolutionErrorCacheKey(targetHref: string): string {
    return `${VIDEO_RESOLUTION_ERROR_CACHE_KEY_PREFIX}${hashTargetUrl(targetHref)}`;
}

async function readCachedVideoPreview(
    targetHref: string
): Promise<CacheLookup<string>> {
    const key = cobaltCacheKey(targetHref);
    const memoryHit = memoryCacheGet(memoryVideoPreviewCache, key);
    if (memoryHit) {
        return { status: "hit", value: memoryHit };
    }
    const cached = await readFromRedis(key);
    if (cached) {
        memoryCacheSet(
            memoryVideoPreviewCache,
            key,
            cached,
            COBALT_CACHE_TTL_SECONDS
        );
        return { status: "hit", value: cached };
    }
    return readCachedNegativePreview(targetHref, "video");
}

function writeCachedVideoPreview(targetHref: string, videoUrl: string): void {
    const key = cobaltCacheKey(targetHref);
    memoryCacheSet(
        memoryVideoPreviewCache,
        key,
        videoUrl,
        COBALT_CACHE_TTL_SECONDS
    );
    writeToRedis(key, videoUrl, COBALT_CACHE_TTL_SECONDS).catch(
        () => undefined
    );
}

async function readCachedVideoResolutionError(
    targetHref: string
): Promise<{ errorCode: string | null } | null> {
    const key = videoResolutionErrorCacheKey(targetHref);
    const memoryHit = memoryCacheGet(memoryVideoResolutionErrorCache, key);
    if (memoryHit) {
        return memoryHit;
    }
    const cached = await readFromRedis(key);
    if (!cached) {
        return null;
    }
    let errorCode: unknown;
    try {
        errorCode = JSON.parse(cached);
    } catch {
        return null;
    }
    if (!(errorCode === null || typeof errorCode === "string")) {
        return null;
    }
    const result = { errorCode };
    memoryCacheSet(
        memoryVideoResolutionErrorCache,
        key,
        result,
        PREVIEW_RESOLUTION_LEASE_TTL_SECONDS
    );
    return result;
}

async function writeCachedVideoResolutionError(
    targetHref: string,
    errorCode: string | null
): Promise<void> {
    const key = videoResolutionErrorCacheKey(targetHref);
    const result = { errorCode };
    memoryCacheSet(
        memoryVideoResolutionErrorCache,
        key,
        result,
        PREVIEW_RESOLUTION_LEASE_TTL_SECONDS
    );
    await writeToRedis(
        key,
        JSON.stringify(errorCode),
        PREVIEW_RESOLUTION_LEASE_TTL_SECONDS
    );
}

async function readCachedImagePreview(
    targetHref: string
): Promise<CacheLookup<ResolvedImage>> {
    const key = previewImageCacheKey(targetHref);
    const memoryHit = memoryCacheGet(memoryImagePreviewCache, key);
    if (memoryHit) {
        if (isSignedUrlExpired(memoryHit.imageUrl)) {
            memoryImagePreviewCache.delete(key);
            return { status: "miss" };
        }
        return { status: "hit", value: memoryHit };
    }

    const cached = await readFromRedis(key);
    if (cached) {
        let parsedJson: unknown;
        try {
            parsedJson = JSON.parse(cached);
        } catch {
            return { status: "miss" };
        }
        // Lightweight shape check replaces zod on the cache-hit hot path; the
        // schema only required two strings.
        const parsed = parseResolvedImage(parsedJson);
        if (!parsed || isSignedUrlExpired(parsed.imageUrl)) {
            return { status: "miss" };
        }
        memoryCacheSet(
            memoryImagePreviewCache,
            key,
            parsed,
            PREVIEW_IMAGE_CACHE_TTL_SECONDS
        );
        return { status: "hit", value: parsed };
    }
    return readCachedNegativePreview(targetHref, "image");
}

function writeCachedImagePreview(
    targetHref: string,
    preview: ResolvedImage
): void {
    const key = previewImageCacheKey(targetHref);
    memoryCacheSet(
        memoryImagePreviewCache,
        key,
        preview,
        PREVIEW_IMAGE_CACHE_TTL_SECONDS
    );
    // Fire-and-forget Redis write: miss-path p50 was ~1.5s with remote Redis
    // (~500ms write RTT). Response bytes/headers unchanged; a concurrent miss
    // before the write lands re-resolves (same as a cold L1).
    writeToRedis(
        key,
        JSON.stringify({
            imageUrl: preview.imageUrl,
            pageUrl: preview.pageUrl,
        }),
        PREVIEW_IMAGE_CACHE_TTL_SECONDS
    ).catch(() => undefined);
}

async function deleteFromRedis(key: string): Promise<void> {
    try {
        const { getRedisClient } = await loadRedisModule();
        const redis = getRedisClient();
        if (!redis) {
            return;
        }
        await redis.del(key);
    } catch (error) {
        log.debug("Redis delete failed", {
            error: error instanceof Error ? error.message : String(error),
            key,
        });
    }
}

function deleteCachedImagePreview(targetHref: string): void {
    const key = previewImageCacheKey(targetHref);
    memoryImagePreviewCache.delete(key);
    deleteFromRedis(key).catch(() => undefined);
}

async function readCachedNegativePreview<T>(
    targetHref: string,
    type: PreviewType
): Promise<CacheLookup<T>> {
    const key = previewNegativeCacheKey(targetHref, type);
    if (memoryCacheGet(memoryNegativePreviewCache, key)) {
        return { status: "negative" };
    }
    const cached = await readFromRedis(key);
    if (!cached) {
        return { status: "miss" };
    }
    memoryCacheSet(
        memoryNegativePreviewCache,
        key,
        true,
        PREVIEW_NEGATIVE_CACHE_TTL_SECONDS
    );
    return { status: "negative" };
}

function writeCachedNegativePreview(
    targetHref: string,
    type: PreviewType
): Promise<void> {
    const key = previewNegativeCacheKey(targetHref, type);
    memoryCacheSet(
        memoryNegativePreviewCache,
        key,
        true,
        PREVIEW_NEGATIVE_CACHE_TTL_SECONDS
    );
    return writeToRedis(key, "1", PREVIEW_NEGATIVE_CACHE_TTL_SECONDS);
}

async function waitForImagePreview(
    targetHref: string,
    deadlineMs: number,
    externalSignal?: AbortSignal
): Promise<CacheLookup<ResolvedImage>> {
    do {
        if (externalSignal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        await wait(
            Math.min(PREVIEW_RESOLUTION_POLL_MS, deadlineMs - Date.now()),
            externalSignal
        );
        if (externalSignal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        const cached = await readCachedImagePreview(targetHref);
        if (cached.status !== "miss") {
            return cached;
        }
    } while (Date.now() < deadlineMs);
    return { status: "miss" };
}

async function waitForVideoPreview(
    targetHref: string,
    deadlineMs: number,
    externalSignal?: AbortSignal
): Promise<VideoPreviewWaitResult> {
    do {
        if (externalSignal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        await wait(
            Math.min(PREVIEW_RESOLUTION_POLL_MS, deadlineMs - Date.now()),
            externalSignal
        );
        if (externalSignal?.aborted) {
            throw new DOMException("Aborted", "AbortError");
        }
        const cached = await readCachedVideoPreview(targetHref);
        if (cached.status === "hit") {
            return { status: "preview", videoUrl: cached.value };
        }
        if (cached.status === "negative") {
            return cached;
        }
        const cachedError = await readCachedVideoResolutionError(targetHref);
        if (cachedError) {
            return { errorCode: cachedError.errorCode, status: "failure" };
        }
    } while (Date.now() < deadlineMs);
    return { status: "miss" };
}

function wait(timeoutMs: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const id = setTimeout(resolve, timeoutMs);
        if (signal) {
            signal.addEventListener(
                "abort",
                () => {
                    clearTimeout(id);
                    resolve();
                },
                { once: true }
            );
        }
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
        const { getRedisClient } = await loadRedisModule();
        const redis = getRedisClient();
        if (!redis) {
            return;
        }
        await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
            {
                arguments: [token],
                keys: [previewResolutionLeaseKey(cacheKey)],
            }
        );
    } catch (error) {
        log.debug("Preview resolution lease release failed", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

function isSignedUrlExpired(imageUrl: string): boolean {
    // Hot path: most CDN URLs have no signed expiry. Avoid URL parse when the
    // param substring is absent (bench: pure check ~10x cheaper than new URL).
    if (!imageUrl.includes(SIGNED_URL_EXPIRY_PARAM)) {
        return false;
    }
    const lifetimeSeconds = getSignedUrlLifetimeSeconds(imageUrl);
    if (lifetimeSeconds === null) {
        return false;
    }
    return lifetimeSeconds <= SIGNED_URL_GRACE_SECONDS;
}

function getSignedUrlLifetimeSeconds(
    imageUrl: string | undefined
): number | null {
    if (!imageUrl?.includes(SIGNED_URL_EXPIRY_PARAM)) {
        return null;
    }
    try {
        const expirySeconds = new URL(imageUrl).searchParams.get(
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
    } catch {
        return null;
    }
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

function getFirstHttpUrl(urls: readonly string[]): string | null {
    for (const url of urls) {
        const httpUrl = parseHttpUrl(url)?.href;
        if (httpUrl) {
            return httpUrl;
        }
    }
    return null;
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

function buildPreviewCacheTag(targetHref: string, type: PreviewType): string {
    return `preview:${type}:${hashTargetUrl(targetHref)}`;
}

function previewResponseCacheControl(
    type: PreviewType,
    signedUrlLifetimeSeconds: number | null
): string {
    if (type !== "image") {
        return CACHE_CONTROL_HEADER;
    }
    if (signedUrlLifetimeSeconds === null) {
        return UNSIGNED_IMAGE_CACHE_CONTROL_HEADER;
    }
    if (signedUrlLifetimeSeconds <= 0) {
        return NO_STORE_HEADER;
    }
    return `public, max-age=${Math.min(60, signedUrlLifetimeSeconds)}, s-maxage=${signedUrlLifetimeSeconds}`;
}

function buildPreviewCacheHeaders(
    targetHref: string,
    type: PreviewType,
    signedUrlLifetimeSeconds: number | null
) {
    const cacheControl = previewResponseCacheControl(
        type,
        signedUrlLifetimeSeconds
    );
    let vercelCacheControl: string;
    if (cacheControl === NO_STORE_HEADER) {
        vercelCacheControl = NO_STORE_HEADER;
    } else if (type === "image" && signedUrlLifetimeSeconds === null) {
        vercelCacheControl = VERCEL_CDN_IMAGE_CACHE_CONTROL_HEADER;
    } else if (cacheControl === CACHE_CONTROL_HEADER) {
        vercelCacheControl = VERCEL_CDN_VIDEO_CACHE_CONTROL_HEADER;
    } else {
        vercelCacheControl = cacheControl;
    }
    return {
        [VERCEL_CDN_CACHE_CONTROL_HEADER_NAME]: vercelCacheControl,
        [VERCEL_CACHE_TAG_HEADER]: buildPreviewCacheTag(targetHref, type),
    };
}

function setPreviewCacheHeaders(
    headers: Headers,
    targetHref: string,
    type: PreviewType,
    signedUrlLifetimeSeconds: number | null = null
): void {
    for (const [key, value] of Object.entries(
        buildPreviewCacheHeaders(targetHref, type, signedUrlLifetimeSeconds)
    )) {
        headers.set(key, value);
    }
}

function handlePreviewError(
    error: unknown,
    operation: string,
    fallbackMessage: string,
    context: Record<string, unknown>
): Response {
    if (isAbortError(error)) {
        return ABORTED_RESPONSE;
    }
    log.warn(`Failed to ${operation}`, {
        error: error instanceof Error ? error.message : String(error),
        ...context,
    });
    return textResponse(fallbackMessage, 404);
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
            [VERCEL_CACHE_TAG_HEADER]: buildPreviewCacheTag(targetHref, type),
        },
        status: 404,
    });
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
