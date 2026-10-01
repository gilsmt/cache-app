import { describe, expect, test } from "bun:test";
import type { LibraryItemWithCollections } from "@/lib/collections/utils";
import {
    AgentViewPageRequestSchema,
    AgentViewPageSchema,
    appendAgentViewPageIds,
    compileAgentViewQueryToWhere,
    filterItemsToAgentView,
    normalizeAgentViewQueryForContext,
    resolveAgentViewItems,
} from "./view";

const CONTEXT = {
    availableCollections: [{ id: "col-1" }],
    availableDomains: [{ domain: "figma.com" }],
};

function item(id: string): LibraryItemWithCollections {
    return { id } as LibraryItemWithCollections;
}

describe("normalizeAgentViewQueryForContext", () => {
    test("drops collections and domains outside the visible context", () => {
        const normalized = normalizeAgentViewQueryForContext(
            {
                collectionIds: ["col-1", "col-99"],
                domainFilters: ["Figma.com", "spotify.com"],
            },
            CONTEXT
        );
        expect(normalized.collectionIds).toEqual(["col-1"]);
        expect(normalized.domainFilters).toEqual(["figma.com"]);
    });

    test("clears selections when membership excludes in-collection items", () => {
        const normalized = normalizeAgentViewQueryForContext(
            {
                collectionIds: ["col-1"],
                membership: "not-in-collections",
            },
            CONTEXT
        );
        expect(normalized.collectionIds).toEqual([]);
        expect(normalized.membership).toBe("not-in-collections");
    });
});

describe("compileAgentViewQueryToWhere", () => {
    test("always scopes to the user and live items", () => {
        const where = compileAgentViewQueryToWhere("user-1", {});
        expect(where).toMatchObject({
            deletedAt: null,
            userId: "user-1",
        });
    });

    test("never accepts a raw where object from the model", () => {
        const where = compileAgentViewQueryToWhere("user-1", {
            text: "poster",
        });
        expect(where).not.toHaveProperty("OR");
        expect(where.AND).toBeArray();
    });

    test("maps membership to collection existence checks", () => {
        const inCollections = compileAgentViewQueryToWhere("user-1", {
            membership: "in-collections",
        });
        expect(JSON.stringify(inCollections)).toContain("some");

        const notInCollections = compileAgentViewQueryToWhere("user-1", {
            membership: "not-in-collections",
        });
        expect(JSON.stringify(notInCollections)).toContain("none");
    });
});

describe("resolveAgentViewItems", () => {
    test("preserves server order and drops missing ids", () => {
        const items = [item("a"), item("b"), item("c")];
        expect(
            resolveAgentViewItems(items, ["c", "missing", "a"]).map(
                (entry) => entry.id
            )
        ).toEqual(["c", "a"]);
    });
});

describe("appendAgentViewPageIds", () => {
    test("appends new ids while preserving order and deduping", () => {
        expect(appendAgentViewPageIds(["a", "b"], ["b", "c"])).toEqual([
            "a",
            "b",
            "c",
        ]);
    });

    test("returns the same reference when the page adds nothing", () => {
        const existing = ["a", "b"];
        expect(appendAgentViewPageIds(existing, [])).toBe(existing);
        expect(appendAgentViewPageIds(existing, ["a"])).toBe(existing);
    });
});

describe("filterItemsToAgentView", () => {
    test("returns the same reference when no view is active", () => {
        const items = [item("a"), item("b")];
        expect(filterItemsToAgentView(items, null)).toBe(items);
    });

    test("intersects manual results with the agent id set", () => {
        const items = [item("a"), item("b"), item("c")];
        expect(
            filterItemsToAgentView(items, {
                explanation: "Why.",
                itemIds: ["c", "a", "missing"],
                nextOffset: null,
                query: {},
                title: "View",
                truncated: false,
            }).map((entry) => entry.id)
        ).toEqual(["a", "c"]);
    });
});

describe("AgentViewPageRequestSchema", () => {
    test("rejects offsets past the cursor bound", () => {
        expect(
            AgentViewPageRequestSchema.safeParse({
                offset: 10_001,
                query: {},
            }).success
        ).toBe(false);
    });

    test("accepts a page cursor with a nullable next offset", () => {
        const parsed = AgentViewPageSchema.safeParse({
            explanation: "Why these match.",
            itemIds: ["a"],
            nextOffset: null,
            query: {},
            title: "View",
            truncated: false,
        });
        expect(parsed.success).toBe(true);
    });
});
