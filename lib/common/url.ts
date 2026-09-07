import { sanitizeUrl } from "@braintree/sanitize-url";
import { FALLBACK_URL } from "@/lib/common/constants";

const URL_WHITESPACE_RE = /\s/;
const URL_ONLY_PROTOCOLS = new Set(["http:", "https:"]);
const PROTOCOL_PREFIX_RE = /^[a-zA-Z]+:\/\//;

export const parseValidUrl = (url: string): URL | null => {
    try {
        return new URL(url);
    } catch {
        return null;
    }
};

export const normalizeURL = (link: string | null | undefined) => {
    if (typeof link !== "string") {
        return FALLBACK_URL;
    }
    const trimmed = link.trim();
    return trimmed ? sanitizeUrl(trimmed) : trimmed;
};

export function getSafeOrigin() {
    if (typeof window === "undefined") {
        return null;
    }
    const origin = window.location.origin;
    return origin === "null" ? null : origin;
}

const toUrl = (link: string): URL | null => {
    const trimmed = link.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith("/")) {
        const origin = getSafeOrigin();
        if (typeof origin !== "string") {
            return null;
        }
        return parseValidUrl(`${origin}${trimmed}`);
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return parseValidUrl(normalizeURL(trimmed));
    }

    if (trimmed.includes("://")) {
        const replaced = trimmed.replace(PROTOCOL_PREFIX_RE, "");
        return parseValidUrl(normalizeURL(replaced));
    }

    return parseValidUrl(normalizeURL(`https://${trimmed}`));
};

export const toValidUrl = (link: string): string =>
    toUrl(link)?.href ?? FALLBACK_URL;

export const parseStandaloneUrl = (input: string): URL | null => {
    const trimmedInput = input.trim();

    if (trimmedInput.length === 0 || URL_WHITESPACE_RE.test(trimmedInput)) {
        return null;
    }

    const url = toUrl(trimmedInput);
    if (!(url && URL_ONLY_PROTOCOLS.has(url.protocol))) {
        return null;
    }

    return url;
};

const WWW_REG = /^www\./i;

export const parseDisplayUrl = (url: string): string => {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(WWW_REG, "") || parsed.hostname;
    } catch {
        return url;
    }
};

export function isHttpUrl(value: string | null | undefined): value is string {
    if (!value) {
        return false;
    }
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch {
        return false;
    }
}

export function normalizePathname(pathname: string): string {
    if (pathname.length > 1 && pathname.endsWith("/")) {
        return pathname.slice(0, -1);
    }
    return pathname || "/";
}

const TRACKING_QUERY_PARAMS = new Set([
    "_ga",
    "_gl",
    "fbclid",
    "gbraid",
    "gclid",
    "igshid",
    "mc_cid",
    "mc_eid",
    "mkt_tok",
    "msclkid",
    // bare `ref` is often content-bearing; only strip known tracking variants
    "ref_src",
    "ref_url",
    "si",
    "spm",
    "twclid",
    "vero_id",
    "wbraid",
    "wickedid",
    "yclid",
    "ysclid",
]);

function isTrackingQueryParam(name: string): boolean {
    const lower = name.toLowerCase();
    if (TRACKING_QUERY_PARAMS.has(lower)) {
        return true;
    }
    return (
        lower.startsWith("utm_") ||
        lower.startsWith("mtm_") ||
        lower.startsWith("pk_")
    );
}

/**
 * Stable content key for “same link” matching across sources.
 * Drops scheme, `www.`, trailing slash, fragment, and common tracking params.
 * Returns null when the input is not an http(s) URL.
 */
export function canonicalBookmarkUrl(
    url: string | null | undefined
): string | null {
    if (typeof url !== "string") {
        return null;
    }

    const trimmed = url.trim();
    if (!trimmed) {
        return null;
    }

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        return null;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return null;
    }

    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) {
        host = host.slice(4);
    }
    if (!host) {
        return null;
    }

    if (parsed.port) {
        const isDefaultPort =
            (parsed.protocol === "http:" && parsed.port === "80") ||
            (parsed.protocol === "https:" && parsed.port === "443");
        if (!isDefaultPort) {
            host = `${host}:${parsed.port}`;
        }
    }

    const pathname = normalizePathname(parsed.pathname || "/");

    const keptParams = [...parsed.searchParams.entries()]
        .filter(([name]) => !isTrackingQueryParam(name))
        .sort(([aName, aValue], [bName, bValue]) => {
            const byName = aName.localeCompare(bName);
            if (byName !== 0) {
                return byName;
            }
            return aValue.localeCompare(bValue);
        });

    let canonical = `${host}${pathname}`;
    if (keptParams.length > 0) {
        const query = new URLSearchParams(keptParams).toString();
        canonical = `${canonical}?${query}`;
    }

    return canonical;
}

export function openExternalUrl(url: string) {
    if (typeof window === "undefined") {
        return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
}
