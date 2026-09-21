import { describe, expect, test } from "bun:test";
import {
    isChromeExtensionOrigin,
    isTrustedCacheWebOrigin,
} from "@/lib/integrations/extension-ingest/origins";

describe("isTrustedCacheWebOrigin", () => {
    test("accepts the app's own hosts", () => {
        expect(isTrustedCacheWebOrigin("https://cachd.app")).toBe(true);
        expect(isTrustedCacheWebOrigin("https://www.cachd.app")).toBe(true);
    });

    test("accepts localhost on any port", () => {
        expect(isTrustedCacheWebOrigin("http://localhost:3000")).toBe(true);
        expect(isTrustedCacheWebOrigin("http://localhost:8080")).toBe(true);
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
