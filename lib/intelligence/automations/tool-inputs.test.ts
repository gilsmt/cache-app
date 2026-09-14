import { describe, expect, test } from "bun:test";
import * as z from "zod";
import {
    AutomationPayloadItemsInputSchema,
    AutomationWebFetchInputSchema,
    AutomationWebSearchInputSchema,
    EmptyAutomationToolInputSchema,
} from "./tool-inputs";

const TOOL_INPUT_SCHEMAS = {
    AutomationPayloadItemsInputSchema,
    AutomationWebFetchInputSchema,
    AutomationWebSearchInputSchema,
    EmptyAutomationToolInputSchema,
} as const;

function collectFormatPaths(node: unknown, path: string): string[] {
    if (Array.isArray(node)) {
        return node.flatMap((item, index) =>
            collectFormatPaths(item, `${path}[${index}]`)
        );
    }
    if (typeof node === "object" && node !== null) {
        return Object.entries(node).flatMap(([key, value]) =>
            key === "format"
                ? [`${path}.${key} (${String(value)})`]
                : collectFormatPaths(value, `${path}.${key}`)
        );
    }
    return [];
}

describe("automation tool input schemas", () => {
    test("emit no format keywords that strict AJV in WorkflowAgent rejects", () => {
        for (const [name, schema] of Object.entries(TOOL_INPUT_SCHEMAS)) {
            const jsonSchema = z.toJSONSchema(schema) as Record<
                string,
                unknown
            >;
            expect(collectFormatPaths(jsonSchema, name)).toEqual([]);
        }
    });

    test("web_fetch accepts http(s) URLs and rejects the rest", () => {
        expect(
            AutomationWebFetchInputSchema.safeParse({
                url: "https://example.com/article",
            }).success
        ).toBe(true);
        expect(
            AutomationWebFetchInputSchema.safeParse({
                url: "http://example.com/article",
            }).success
        ).toBe(true);
        expect(
            AutomationWebFetchInputSchema.safeParse({
                url: "HTTPS://EXAMPLE.COM/ARTICLE",
            }).success
        ).toBe(true);
        expect(
            AutomationWebFetchInputSchema.safeParse({
                url: "  https://example.com/article  ",
            }).success
        ).toBe(true);
        expect(
            AutomationWebFetchInputSchema.safeParse({
                url: "ftp://example.com/file",
            }).success
        ).toBe(false);
        expect(
            AutomationWebFetchInputSchema.safeParse({
                url: "javascript:alert(1)",
            }).success
        ).toBe(false);
        expect(
            AutomationWebFetchInputSchema.safeParse({ url: "not a url" })
                .success
        ).toBe(false);
        expect(
            AutomationWebFetchInputSchema.safeParse({
                url: "example.com/article",
            }).success
        ).toBe(false);
        expect(
            AutomationWebFetchInputSchema.safeParse({
                url: `https://example.com/${"a".repeat(4096)}`,
            }).success
        ).toBe(false);
    });
});
