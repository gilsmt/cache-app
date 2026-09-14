import * as z from "zod";
import { abortAfterAny, isAbortError } from "@/lib/common/abort";
import { MIME_TYPES } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    fetchOembed,
    hasOembedSupport,
    OembedSchema,
} from "@/lib/common/oembed";
import { parsePublicHttpUrl } from "@/lib/common/security/ssrf-url";

const log = createLogger("api:oembed");

const CACHE_CONTROL_HEADER =
    "public, max-age=60, s-maxage=300, stale-while-revalidate=60";
const JSON_CONTENT_TYPE = `${MIME_TYPES.json}; charset=utf-8`;
const MAX_TARGET_URL_LENGTH = 4096;
const OEMBED_TIMEOUT_MS = 5000;
const NUMERIC_PATH_SEGMENT_PATTERN = /^\d+$/;
const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
]);
const YOUTUBE_SHORT_HOST = "youtu.be";
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com"]);
const TWITTER_HOSTS = new Set([
    "twitter.com",
    "www.twitter.com",
    "x.com",
    "www.x.com",
]);
const SPOTIFY_HOST = "open.spotify.com";
const SOUNDCLOUD_HOSTS = new Set(["soundcloud.com", "www.soundcloud.com"]);
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com"]);
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
// lib/common/oembed only detects Instagram URLs; its oEmbed response requires
// the Graph API, so Instagram is fetched here via the Graph endpoint instead.
const INSTAGRAM_OEMBED_ENDPOINT =
    "https://graph.facebook.com/v26.0/instagram_oembed";
const CODEPEN_HOST = "codepen.io";
const CODESANDBOX_HOST = "codesandbox.io";
const FIGMA_HOST = "figma.com";
const INSTAGRAM_OEMBED_RESPONSE_SCHEMA = z.object({
    html: z.string().min(1),
    provider_name: z.string().min(1),
    title: z.string().nullable().optional(),
});

type OembedFetch = (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
) => Promise<Response>;

export async function GET(request: Request): Promise<Response> {
    const requestUrl = new URL(request.url);
    const targetUrl = await extractTargetUrl(
        requestUrl.searchParams.get("url")
    );
    if (!targetUrl) {
        return textResponse("Invalid URL", 400);
    }

    if (
        !(isSupportedOembedUrl(targetUrl) && hasOembedSupport(targetUrl.href))
    ) {
        return textResponse("Unsupported oEmbed provider", 404);
    }

    try {
        const fetcher = fetchWithRequestSignal(request.signal);
        const oembed = isInstagramUrl(targetUrl)
            ? await fetchInstagramOembed(targetUrl.href, fetcher)
            : await fetchOembed(targetUrl.href, {
                  fetch: fetcher,
                  timeout: OEMBED_TIMEOUT_MS,
              });
        if (!oembed?.html) {
            if (request.signal.aborted) {
                return textResponse("Request aborted", 499);
            }
            return textResponse("oEmbed not available", 424);
        }

        const parsed = OembedSchema.safeParse({
            html: oembed.html,
            provider: oembed.provider,
            title: oembed.title,
        });
        if (!parsed.success) {
            log.warn("Invalid oEmbed response", {
                issues: parsed.error.issues,
                targetUrl: targetUrl.href,
            });
            return textResponse("Invalid oEmbed response", 502);
        }

        return Response.json(parsed.data, {
            headers: {
                "Cache-Control": CACHE_CONTROL_HEADER,
                "Content-Type": JSON_CONTENT_TYPE,
            },
        });
    } catch (error) {
        if (isAbortError(error)) {
            return textResponse("Request aborted", 499);
        }
        log.error("Failed to resolve oEmbed", {
            error,
            targetUrl: targetUrl.href,
        });
        return textResponse("oEmbed not available", 424);
    }
}

async function fetchInstagramOembed(targetUrl: string, fetcher: OembedFetch) {
    const endpoint = new URL(INSTAGRAM_OEMBED_ENDPOINT);
    endpoint.searchParams.set("url", targetUrl);

    const response = await fetcher(endpoint, {
        headers: { Accept: MIME_TYPES.json },
    });
    if (!response.ok) {
        log.warn("Instagram oEmbed request rejected", {
            status: response.status,
            statusText: response.statusText,
            targetUrl,
        });
        return null;
    }

    const data: unknown = await response.json();
    const parsed = INSTAGRAM_OEMBED_RESPONSE_SCHEMA.safeParse(data);
    if (!parsed.success) {
        log.warn("Invalid Instagram oEmbed response", {
            issues: parsed.error.issues,
            targetUrl,
        });
        return null;
    }

    return {
        html: parsed.data.html,
        provider: "instagram",
        title: parsed.data.title ?? null,
    };
}

function isInstagramUrl(url: URL): boolean {
    return INSTAGRAM_HOSTS.has(url.hostname.toLowerCase());
}

function isSupportedOembedUrl(url: URL): boolean {
    const hostname = url.hostname.toLowerCase();
    if (YOUTUBE_HOSTS.has(hostname)) {
        return url.pathname === "/watch" || url.pathname.startsWith("/embed/");
    }
    if (hostname === YOUTUBE_SHORT_HOST) {
        return firstPathSegment(url) !== null;
    }
    if (VIMEO_HOSTS.has(hostname)) {
        const videoId = firstPathSegment(url);
        return videoId !== null && NUMERIC_PATH_SEGMENT_PATTERN.test(videoId);
    }
    if (TWITTER_HOSTS.has(hostname)) {
        return hasStatusPath(url);
    }
    if (hostname === SPOTIFY_HOST) {
        const pathSegments = pathSegmentsFromUrl(url);
        const resourceType = firstPathSegment(url);
        return (
            pathSegments.length >= 2 &&
            resourceType !== null &&
            ["album", "artist", "playlist", "track"].includes(resourceType)
        );
    }
    if (SOUNDCLOUD_HOSTS.has(hostname)) {
        return pathSegmentsFromUrl(url).length >= 2;
    }
    if (TIKTOK_HOSTS.has(hostname)) {
        const pathSegments = pathSegmentsFromUrl(url);
        const accountSegment = firstPathSegment(url);
        return (
            pathSegments.length >= 3 &&
            accountSegment !== null &&
            accountSegment.startsWith("@") &&
            pathSegments[1] === "video"
        );
    }
    if (INSTAGRAM_HOSTS.has(hostname)) {
        const pathSegments = pathSegmentsFromUrl(url);
        return (
            pathSegments.length >= 2 &&
            (pathSegments[0] === "p" || pathSegments[0] === "reel")
        );
    }
    if (hostname === CODEPEN_HOST) {
        const pathSegments = pathSegmentsFromUrl(url);
        return pathSegments.length >= 3 && pathSegments[1] === "pen";
    }
    if (hostname === CODESANDBOX_HOST) {
        return firstPathSegment(url) === "s";
    }
    if (hostname === FIGMA_HOST) {
        return ["design", "file", "proto"].includes(
            firstPathSegment(url) ?? ""
        );
    }
    return false;
}

function hasStatusPath(url: URL): boolean {
    const pathSegments = pathSegmentsFromUrl(url);
    return pathSegments.length >= 3 && pathSegments[1] === "status";
}

function firstPathSegment(url: URL): string | null {
    return pathSegmentsFromUrl(url)[0] ?? null;
}

function pathSegmentsFromUrl(url: URL): string[] {
    return url.pathname.split("/").filter(Boolean);
}

function fetchWithRequestSignal(requestSignal: AbortSignal) {
    const nextFetch = async (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
    ) => {
        const signals = init?.signal
            ? [requestSignal, init.signal]
            : [requestSignal];
        const { clearTimeout, signal } = abortAfterAny(
            OEMBED_TIMEOUT_MS,
            ...signals
        );
        try {
            return await fetch(input, {
                ...init,
                signal,
            });
        } finally {
            clearTimeout();
        }
    };

    nextFetch.preconnect = fetch.preconnect;
    return nextFetch;
}

async function extractTargetUrl(rawValue: string | null): Promise<URL | null> {
    if (!rawValue || rawValue.length > MAX_TARGET_URL_LENGTH) {
        return null;
    }
    return await parsePublicHttpUrl(rawValue);
}

function textResponse(message: string, status: number): Response {
    return new Response(message, {
        headers: {
            "Content-Type": `${MIME_TYPES.text}; charset=utf-8`,
        },
        status,
    });
}
