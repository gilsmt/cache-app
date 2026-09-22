/**
 * The app's own web origins, trusted for CORS by every endpoint that accepts
 * browser callers. The extension reads the ingest token from the page origin,
 * so only these hosts are first-party. A wildcard once trusted every cachd.app
 * label, including subdomains delegated to third-party services, which let
 * those hosts read a signed-in user's ingest token.
 */
const TRUSTED_CACHE_WEB_ORIGINS = new Set([
    "https://cachd.app",
    "https://www.cachd.app",
]);

/** Local development serves the app on arbitrary loopback ports. */
const LOCALHOST_ORIGIN_PATTERN = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/;

/** Chrome extension service-worker origins. Extension ids are `[a-p]{32}`. */
const CHROME_EXTENSION_ORIGIN_PATTERN = /^chrome-extension:\/\/[a-p]{32}$/;

export function isTrustedCacheWebOrigin(origin: string): boolean {
    return (
        TRUSTED_CACHE_WEB_ORIGINS.has(origin) ||
        LOCALHOST_ORIGIN_PATTERN.test(origin)
    );
}

export function isChromeExtensionOrigin(origin: string): boolean {
    return CHROME_EXTENSION_ORIGIN_PATTERN.test(origin);
}
