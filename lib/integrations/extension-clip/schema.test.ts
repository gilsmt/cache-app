import { describe, expect, test } from "bun:test";
import * as z from "zod";
import {
    extensionClipBodySchema,
    extensionClipExternalId,
    extensionCreateCollectionBodySchema,
} from "@/lib/integrations/extension-clip/schema";

describe("extensionClipBodySchema", () => {
    test("accepts url with empty collectionIds by default", () => {
        const parsed = extensionClipBodySchema.safeParse({
            url: "https://example.com/a",
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.collectionIds).toEqual([]);
            expect(parsed.data.url).toBe("https://example.com/a");
        }
    });

    test("accepts caption and multiple collection ids", () => {
        const parsed = extensionClipBodySchema.safeParse({
            caption: "Title",
            collectionIds: ["c1", "c2"],
            url: "https://example.com",
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.data.collectionIds).toEqual(["c1", "c2"]);
            expect(parsed.data.caption).toBe("Title");
        }
    });

    test("rejects missing url", () => {
        expect(
            z.validate(extensionClipBodySchema, {
                collectionIds: [],
            })
        ).toBe(false);
    });
});

describe("extensionCreateCollectionBodySchema", () => {
    test("requires name within 64 chars", () => {
        expect(
            z.validate(extensionCreateCollectionBodySchema, { name: "Reading" })
        ).toBe(true);
        expect(
            z.validate(extensionCreateCollectionBodySchema, { name: "" })
        ).toBe(false);
        expect(
            z.validate(extensionCreateCollectionBodySchema, {
                name: "x".repeat(65),
            })
        ).toBe(false);
    });

    test("allows optional description up to 1024", () => {
        expect(
            z.validate(extensionCreateCollectionBodySchema, {
                description: "Notes",
                name: "Reading",
            })
        ).toBe(true);

        expect(
            z.validate(extensionCreateCollectionBodySchema, {
                description: "x".repeat(1025),
                name: "Reading",
            })
        ).toBe(false);
    });
});

describe("extensionClipExternalId", () => {
    test("is stable for the same canonical url", () => {
        const a = extensionClipExternalId("example.com/path");
        const b = extensionClipExternalId("example.com/path");
        expect(a).toBe(b);
        expect(a).toHaveLength(64);
    });

    test("differs across distinct urls", () => {
        expect(extensionClipExternalId("example.com/a")).not.toBe(
            extensionClipExternalId("example.com/b")
        );
    });
});
