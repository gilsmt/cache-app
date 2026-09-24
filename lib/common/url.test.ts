import { describe, expect, test } from "bun:test";
import {
    canonicalBookmarkUrl,
    isHttpUrl,
    parseDisplayUrl,
    parseStandaloneUrl,
    tryParseUrl,
} from "@/lib/common/url";

describe("tryParseUrl", () => {
    test("resolves a relative value against a base", () => {
        expect(tryParseUrl("/path", "https://example.com")?.href).toBe(
            "https://example.com/path"
        );
    });

    test("returns null for invalid input without throwing", () => {
        expect(tryParseUrl("not a url :::")).toBeNull();
    });

    test("falls back to the constructor when URL.parse is missing", () => {
        const originalParse = URL.parse;
        Object.defineProperty(URL, "parse", {
            configurable: true,
            value: undefined,
            writable: true,
        });
        try {
            expect(tryParseUrl("https://example.com/")?.href).toBe(
                "https://example.com/"
            );
            expect(tryParseUrl("not a url :::")).toBeNull();
        } finally {
            Object.defineProperty(URL, "parse", {
                configurable: true,
                value: originalParse,
                writable: true,
            });
        }
    });
});

describe("url helpers use the non-throwing parser", () => {
    test("isHttpUrl keeps its contract", () => {
        expect(isHttpUrl("https://example.com")).toBe(true);
        expect(isHttpUrl("javascript:alert(1)")).toBe(false);
        expect(isHttpUrl("not a url :::")).toBe(false);
    });

    test("parseDisplayUrl keeps its contract", () => {
        expect(parseDisplayUrl("https://www.example.com/x")).toBe(
            "example.com"
        );
        expect(parseDisplayUrl("not a url :::")).toBe("not a url :::");
    });

    test("parseStandaloneUrl still rejects non-http schemes", () => {
        expect(parseStandaloneUrl("javascript:alert(1)")).toBeNull();
        expect(parseStandaloneUrl("https://example.com/article")?.href).toBe(
            "https://example.com/article"
        );
    });

    test("canonicalBookmarkUrl drops tracking params", () => {
        expect(
            canonicalBookmarkUrl("https://www.example.com/a?utm_source=x&b=2")
        ).toBe("example.com/a?b=2");
        expect(canonicalBookmarkUrl("not a url :::")).toBeNull();
    });
});
