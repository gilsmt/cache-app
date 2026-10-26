import { describe, expect, test } from "bun:test";
import {
    isChromeExtensionOrigin,
    isExactWebOrigin,
    isTrustedCacheWebOrigin,
    parseExactWebOrigins,
} from "@/lib/common/security/origins";

describe("isTrustedCacheWebOrigin", () => {
    test("accepts the app's own hosts", () => {
        expect(isTrustedCacheWebOrigin("https://cachd.app")).toBe(true);
        expect(isTrustedCacheWebOrigin("https://www.cachd.app")).toBe(true);
    });

    test("accepts loopback on any port", () => {
        expect(isTrustedCacheWebOrigin("http://localhost:3000")).toBe(true);
        expect(isTrustedCacheWebOrigin("http://localhost:8080")).toBe(true);
        expect(isTrustedCacheWebOrigin("http://127.0.0.1:3000")).toBe(true);
    });

    test("rejects cachd.app subdomains served by third parties", () => {
        expect(isTrustedCacheWebOrigin("https://docs.cachd.app")).toBe(false);
        expect(isTrustedCacheWebOrigin("https://preview.cachd.app")).toBe(
            false
        );
    });

    test("rejects unassigned cachd.app labels and lookalikes", () => {
        expect(isTrustedCacheWebOrigin("https://api.cachd.app")).toBe(false);
        expect(isTrustedCacheWebOrigin("https://cachd.app.evil.com")).toBe(
            false
        );
        expect(isTrustedCacheWebOrigin("https://evilcachd.app")).toBe(false);
        expect(isTrustedCacheWebOrigin("http://cachd.app")).toBe(false);
    });
});

describe("isChromeExtensionOrigin", () => {
    test("accepts a chrome extension origin", () => {
        expect(
            isChromeExtensionOrigin(
                "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
            )
        ).toBe(true);
    });

    test("rejects other origins", () => {
        expect(isChromeExtensionOrigin("https://cachd.app")).toBe(false);
        expect(isChromeExtensionOrigin("chrome-extension://not-an-id")).toBe(
            false
        );
    });
});

describe("parseExactWebOrigins", () => {
    test("accepts exact HTTP and HTTPS origins", () => {
        expect(
            parseExactWebOrigins(
                "https://cache.example.com, http://localhost:3000"
            )
        ).toEqual(["https://cache.example.com", "http://localhost:3000"]);
    });

    test("rejects paths, wildcards, and non-web origins", () => {
        expect(
            parseExactWebOrigins(
                "https://cache.example.com/app, https://*.example.com, chrome-extension://abcdefghijklmnopabcdefghijklmnop"
            )
        ).toEqual([]);
    });
});

describe("isExactWebOrigin", () => {
    test("accepts an exact HTTP or HTTPS origin", () => {
        expect(isExactWebOrigin("https://cache.example.com")).toBe(true);
        expect(isExactWebOrigin("http://localhost:3000")).toBe(true);
    });

    test("rejects paths, wildcards, and non-web origins", () => {
        expect(isExactWebOrigin("https://cache.example.com/app")).toBe(false);
        expect(isExactWebOrigin("https://*.example.com")).toBe(false);
        expect(
            isExactWebOrigin(
                "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
            )
        ).toBe(false);
    });
});
