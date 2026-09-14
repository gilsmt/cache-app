import { describe, expect, test } from "bun:test";
import { LibraryItemSource } from "@/prisma/client/enums";
import {
    type DescriptionRequest,
    normalizeExpandedSummary,
    normalizeSummary,
    SectionDescriptionRequestSchema,
    truncateContextItems,
} from "./overview";

function item(
    overrides: Partial<DescriptionRequest["items"][number]> = {}
): DescriptionRequest["items"][number] {
    return {
        kind: "bookmark",
        primaryText: "A guide to building durable systems.",
        source: LibraryItemSource.other,
        title: "Durable Systems",
        ...overrides,
    };
}

describe("normalizeSummary", () => {
    test("trims whitespace and drops a summary prefix", () => {
        expect(normalizeSummary("Summary:   Tools for writing docs.  ")).toBe(
            "Tools for writing docs."
        );
    });

    test("strips surrounding quotes", () => {
        expect(normalizeSummary('"Tools for writing docs."')).toBe(
            "Tools for writing docs."
        );
    });

    test("appends a period to incomplete sentences", () => {
        expect(normalizeSummary("Tools for writing docs")).toBe(
            "Tools for writing docs."
        );
    });

    test("unwraps JSON envelopes produced by providers", () => {
        expect(normalizeSummary('{"summary":"Tools for writing docs."}')).toBe(
            "Tools for writing docs."
        );
    });

    test("truncates long summaries with an ellipsis", () => {
        const long = `${"a".repeat(300)}.`;
        const normalized = normalizeSummary(long);
        expect(normalized?.length).toBeLessThanOrEqual(223);
        expect(normalized?.endsWith("...")).toBe(true);
    });

    test("returns null for empty output", () => {
        expect(normalizeSummary(undefined)).toBeNull();
        expect(normalizeSummary("   ")).toBeNull();
    });
});

describe("normalizeExpandedSummary", () => {
    test("removes markdown code fences and blank lines", () => {
        expect(
            normalizeExpandedSummary(
                "```markdown\n\nFirst line.\n\n- Bullet one.\n\n```"
            )
        ).toBe("First line.\n- Bullet one.");
    });

    test("returns null for empty output", () => {
        expect(normalizeExpandedSummary("```\n```")).toBeNull();
    });
});

describe("truncateContextItems", () => {
    test("keeps all items when the request fits the budget", () => {
        const request = {
            items: [
                item(),
                item({ primaryText: "More text.", title: "Second" }),
            ],
            sectionTitle: "Reading",
        };
        expect(truncateContextItems(request).items).toHaveLength(2);
    });

    test("drops trailing items that exceed the token budget", () => {
        const request = {
            items: Array.from({ length: 20 }, (_, index) =>
                item({
                    primaryText: "Primary text ".repeat(60) + index,
                    title: `Item ${index}`,
                })
            ),
            sectionTitle: "Reading",
        };
        const truncated = truncateContextItems(request);
        expect(truncated.items.length).toBeGreaterThan(0);
        expect(truncated.items.length).toBeLessThan(20);
    });

    test("truncates the fields of a first item that exceeds the budget", () => {
        const request = {
            items: [item({ primaryText: "x".repeat(20_000) })],
            sectionTitle: "Reading",
        };
        const truncated = truncateContextItems(request);
        expect(truncated.items).toHaveLength(1);
        const [only] = truncated.items;
        expect(only?.primaryText.length ?? 0).toBeLessThan(20_000);
        expect(only?.primaryText.length ?? 0).toBeGreaterThan(0);
    });
});

describe("SectionDescriptionRequestSchema", () => {
    test("accepts a minimal valid request", () => {
        const parsed = SectionDescriptionRequestSchema.safeParse({
            items: [item()],
            sectionTitle: "Reading",
        });
        expect(parsed.success).toBe(true);
    });

    test("rejects empty item lists and oversized sections", () => {
        expect(
            SectionDescriptionRequestSchema.safeParse({
                items: [],
                sectionTitle: "Reading",
            }).success
        ).toBe(false);
        expect(
            SectionDescriptionRequestSchema.safeParse({
                items: [item()],
                sectionTitle: "x".repeat(121),
            }).success
        ).toBe(false);
    });
});
