import { describe, expect, test } from "bun:test";
import type { AskCacheComposerPatch, AskCacheRequest } from "./ask-cache";
import {
    isNoopComposerPatch,
    normalizeComposerPatchForContext,
    resolveComposerPatchContradictions,
} from "./patch";

function request(overrides: Partial<AskCacheRequest> = {}): AskCacheRequest {
    return {
        composerState: {
            collectionMembershipFilter: "all",
            columnCountMode: "auto",
            domainFilters: [],
            groupBy: "none",
            searchTerms: [],
            selectedCollectionIds: [],
            sortMode: "added-newest",
            sourceFilters: [],
        },
        prompt: "Show my design inspiration.",
        runtimeContext: { surface: "library_composer" },
        visibleContext: {
            availableCollections: [
                { id: "col-1", itemCount: 3, name: "Design" },
            ],
            availableDomains: [
                { domain: "figma.com", itemCount: 2 },
                { domain: "dribbble.com", itemCount: 1 },
            ],
            filteredItemCount: 3,
            totalItemCount: 3,
        },
        ...overrides,
    };
}

function patch(
    overrides: Partial<AskCacheComposerPatch> = {}
): AskCacheComposerPatch {
    return { ...overrides };
}

describe("normalizeComposerPatchForContext", () => {
    test("drops domains and collections outside the visible context", () => {
        const normalized = normalizeComposerPatchForContext(
            patch({
                domainFilters: ["figma.com", "spotify.com"],
                selectedCollectionIds: ["col-1", "col-99"],
            }),
            request()
        );
        expect(normalized.domainFilters).toEqual(["figma.com"]);
        expect(normalized.selectedCollectionIds).toEqual(["col-1"]);
    });

    test("leaves untouched fields alone", () => {
        const normalized = normalizeComposerPatchForContext(
            patch({ groupBy: "domain" }),
            request()
        );
        expect(normalized.domainFilters).toBeUndefined();
        expect(normalized.selectedCollectionIds).toBeUndefined();
        expect(normalized.groupBy).toBe("domain");
    });
});

describe("resolveComposerPatchContradictions", () => {
    test("clears selections when the model excludes in-collection items", () => {
        const resolved = resolveComposerPatchContradictions(
            patch({
                collectionMembershipFilter: "not-in-collections",
                selectedCollectionIds: ["col-1"],
            }),
            request().composerState
        );
        expect(resolved.selectedCollectionIds).toEqual([]);
    });

    test("resets membership to all when the model selects collections", () => {
        const state = request({
            composerState: {
                ...request().composerState,
                collectionMembershipFilter: "not-in-collections",
            },
        }).composerState;
        const resolved = resolveComposerPatchContradictions(
            patch({ selectedCollectionIds: ["col-1"] }),
            state
        );
        expect(resolved.collectionMembershipFilter).toBe("all");
    });

    test("clears contradictory selections in reset patches", () => {
        const resolved = resolveComposerPatchContradictions(
            patch({
                collectionMembershipFilter: "not-in-collections",
                reset: true,
                selectedCollectionIds: ["col-1"],
            }),
            request().composerState
        );
        expect(resolved.reset).toBe(true);
        expect(resolved.collectionMembershipFilter).toBe("not-in-collections");
        expect(resolved.selectedCollectionIds).toEqual([]);
    });

    test("heals contradictory existing state on partial updates", () => {
        const state = request({
            composerState: {
                ...request().composerState,
                collectionMembershipFilter: "not-in-collections",
                selectedCollectionIds: ["col-1"],
            },
        }).composerState;
        const resolved = resolveComposerPatchContradictions(
            patch({ searchTerms: ["poster"] }),
            state
        );
        expect(resolved.selectedCollectionIds).toEqual([]);
        expect(resolved.searchTerms).toEqual(["poster"]);
    });
});

describe("isNoopComposerPatch", () => {
    test("detects unchanged state as a noop", () => {
        expect(
            isNoopComposerPatch(
                patch({ domainFilters: [], groupBy: "none" }),
                request().composerState
            )
        ).toBe(true);
    });

    test("detects field changes as meaningful", () => {
        expect(
            isNoopComposerPatch(
                patch({ groupBy: "domain" }),
                request().composerState
            )
        ).toBe(false);
        expect(
            isNoopComposerPatch(
                patch({ domainFilters: ["figma.com"] }),
                request().composerState
            )
        ).toBe(false);
    });

    test("treats reset as meaningful even when state is pristine", () => {
        expect(
            isNoopComposerPatch(patch({ reset: true }), request().composerState)
        ).toBe(false);
    });

    test("compares arrays order-independently", () => {
        const state = request({
            composerState: {
                ...request().composerState,
                domainFilters: ["figma.com", "dribbble.com"],
            },
        }).composerState;
        expect(
            isNoopComposerPatch(
                patch({ domainFilters: ["dribbble.com", "figma.com"] }),
                state
            )
        ).toBe(true);
    });
});
