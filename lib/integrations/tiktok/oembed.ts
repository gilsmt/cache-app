import { parseHttpUrl } from "@/lib/common/security/ssrf";
import { tryParseUrl } from "@/lib/common/url";

const TIKTOK_OEMBED_ENDPOINT = "https://www.tiktok.com/oembed";

const TIKTOK_HOSTS = new Set([
    "m.tiktok.com",
    "tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com",
    "www.tiktok.com",
]);

export function isTikTokUrl(value: string): boolean {
    const parsed = tryParseUrl(value);
    return parsed ? TIKTOK_HOSTS.has(parsed.hostname.toLowerCase()) : false;
}

export function tiktokOembedUrl(targetUrl: string): string | null {
    if (!isTikTokUrl(targetUrl)) {
        return null;
    }

    const url = new URL(TIKTOK_OEMBED_ENDPOINT);
    url.searchParams.set("url", targetUrl);
    return url.href;
}

export function tiktokOembedThumbnailUrl(data: unknown): string | null {
    if (!(typeof data === "object" && data !== null)) {
        return null;
    }

    const thumbnailUrl =
        "thumbnail_url" in data ? data.thumbnail_url : undefined;
    if (typeof thumbnailUrl !== "string") {
        return null;
    }

    return parseHttpUrl(thumbnailUrl.trim())?.href ?? null;
}
