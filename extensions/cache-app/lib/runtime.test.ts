import { describe, expect, test } from "bun:test";
import {
    cacheAppOriginFromSiteMatch,
    getConfiguredCacheAppOrigin,
    ingestEndpointForSource,
    isCacheSiteUrl,
    isTrustedCacheWebOrigin,
    resolveCacheOrigin,
} from "./runtime";

describe("isCacheSiteUrl", () => {
    test("accepts the app's own hosts", () => {
        expect(isCacheSiteUrl("https://cachd.app/library")).toBe(true);
        expect(isCacheSiteUrl("https://www.cachd.app/library")).toBe(true);
    });

    test("accepts localhost during development", () => {
        expect(isCacheSiteUrl("http://localhost:3000/library")).toBe(true);
    });

    test("rejects cachd.app subdomains served by third parties", () => {
        expect(isCacheSiteUrl("https://docs.cachd.app/")).toBe(false);
        expect(isCacheSiteUrl("https://preview.cachd.app/")).toBe(false);
        expect(isCacheSiteUrl("https://evil.cachd.app/")).toBe(false);
    });

    test("rejects lookalikes and unparsable values", () => {
        expect(isCacheSiteUrl("https://cachd.app.evil.com/")).toBe(false);
        expect(isCacheSiteUrl("https://evilcachd.app/")).toBe(false);
        expect(isCacheSiteUrl("http://cachd.app/")).toBe(false);
        expect(isCacheSiteUrl("not a url")).toBe(false);
        expect(isCacheSiteUrl("")).toBe(false);
    });
});

describe("isTrustedCacheWebOrigin", () => {
    test("accepts the app's own origins", () => {
        expect(isTrustedCacheWebOrigin("https://cachd.app")).toBe(true);
        expect(isTrustedCacheWebOrigin("https://www.cachd.app")).toBe(true);
        expect(isTrustedCacheWebOrigin("http://localhost:8080")).toBe(true);
        expect(isTrustedCacheWebOrigin("http://127.0.0.1:8080")).toBe(true);
    });

    test("rejects a third-party cachd.app subdomain origin", () => {
        expect(isTrustedCacheWebOrigin("https://docs.cachd.app")).toBe(false);
        expect(isTrustedCacheWebOrigin("https://preview.cachd.app")).toBe(
            false
        );
    });
});

describe("cacheAppOriginFromSiteMatch", () => {
    test("resolves an exact HTTPS site match", () => {
        expect(
            cacheAppOriginFromSiteMatch("https://cache.example.com/*"),
        ).toBe("https://cache.example.com");
    });

    test("allows HTTP only for loopback development", () => {
        expect(
            cacheAppOriginFromSiteMatch("http://localhost:3000/*"),
        ).toBe("http://localhost:3000");
        expect(
            cacheAppOriginFromSiteMatch("http://127.0.0.1:3000/*"),
        ).toBe("http://127.0.0.1:3000");
    });

    test("rejects wildcard hosts, paths, and insecure remote origins", () => {
        expect(() =>
            cacheAppOriginFromSiteMatch("https://*.example.com/*"),
        ).toThrow();
        expect(() =>
            cacheAppOriginFromSiteMatch("https://cache.example.com/app/*"),
        ).toThrow();
        expect(() =>
            cacheAppOriginFromSiteMatch("http://cache.example.com/*"),
        ).toThrow();
    });

    test("keeps the cloud origin when no custom site match is configured", () => {
        expect(cacheAppOriginFromSiteMatch(undefined)).toBeNull();
        expect(getConfiguredCacheAppOrigin()).toBe("https://cachd.app");
    });
});

describe("resolveCacheOrigin", () => {
    test("keeps an allowlisted origin", () => {
        expect(resolveCacheOrigin("https://cachd.app")).toBe(
            "https://cachd.app"
        );
        expect(resolveCacheOrigin("https://www.cachd.app/library")).toBe(
            "https://www.cachd.app"
        );
    });

    test("falls back to the app origin for a value outside the allowlist", () => {
        expect(resolveCacheOrigin("https://docs.cachd.app")).toBe(
            "https://cachd.app"
        );
        expect(resolveCacheOrigin("https://evil.cachd.app")).toBe(
            "https://cachd.app"
        );
        expect(resolveCacheOrigin("not a url")).toBe("https://cachd.app");
        expect(resolveCacheOrigin("")).toBe("https://cachd.app");
    });
});

describe("ingestEndpointForSource", () => {
    test("derives a trusted endpoint from a stored value", () => {
        expect(ingestEndpointForSource("https://cachd.app", "chrome")).toBe(
            "https://cachd.app/api/integrations/chrome/sync"
        );
    });

    test("does not upload to a stored third-party cachd.app host", () => {
        expect(
            ingestEndpointForSource("https://docs.cachd.app", "chrome")
        ).toBe("https://cachd.app/api/integrations/chrome/sync");
        expect(
            ingestEndpointForSource("https://evil.cachd.app", "instagram")
        ).toBe("https://cachd.app/api/integrations/instagram/saved");
    });
});
