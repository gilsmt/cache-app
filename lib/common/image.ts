import { parseHttpUrl } from "@/lib/common/security/ssrf";
import { tryParseUrl } from "@/lib/common/url";

const SAME_ORIGIN_IMAGE_URL_BASE = "https://cache.local";

export function filterValidImageUrls(urls: string[]): string[] {
    return urls.filter(isLoadableHttpImageUrl);
}

function isLoadableHttpImageUrl(url: string): boolean {
    if (parseHttpUrl(url) !== null) {
        return true;
    }

    if (!(url.startsWith("/") && !url.startsWith("//"))) {
        return false;
    }

    const parsed = tryParseUrl(url, SAME_ORIGIN_IMAGE_URL_BASE);
    return parsed?.origin === SAME_ORIGIN_IMAGE_URL_BASE;
}
