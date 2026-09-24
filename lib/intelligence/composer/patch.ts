import type { AskCacheComposerPatch, AskCacheRequest } from "./ask-cache";

function arraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    const sortedLeft = left.toSorted((a, b) => a.localeCompare(b));
    const sortedRight = right.toSorted((a, b) => a.localeCompare(b));
    for (let i = 0; i < sortedLeft.length; i += 1) {
        if (sortedLeft[i] !== sortedRight[i]) {
            return false;
        }
    }
    return true;
}

export function normalizeComposerPatchForContext(
    patch: AskCacheComposerPatch,
    request: AskCacheRequest
): AskCacheComposerPatch {
    const collectionIds = new Set(
        request.visibleContext.availableCollections.map(
            (collection) => collection.id
        )
    );
    const domainsByLowerCase = new Map(
        request.visibleContext.availableDomains.map((entry) => [
            entry.domain.toLowerCase(),
            entry.domain,
        ])
    );

    return {
        ...patch,
        ...(patch.domainFilters === undefined
            ? {}
            : {
                  domainFilters: patch.domainFilters
                      .map((domain) =>
                          domainsByLowerCase.get(domain.toLowerCase())
                      )
                      .filter(
                          (domain): domain is string => domain !== undefined
                      ),
              }),
        ...(patch.selectedCollectionIds === undefined
            ? {}
            : {
                  selectedCollectionIds: patch.selectedCollectionIds.filter(
                      (collectionId) => collectionIds.has(collectionId)
                  ),
              }),
    };
}

/**
 * Resolves mutually exclusive collection filters so a valid patch never
 * yields an empty result set. Prefer the field the model set explicitly:
 * `not-in-collections` clears selections; selecting collections resets
 * membership to `all`. Also heals latent contradictory state left by older
 * patches so a partial update (e.g. searchTerms only) does not keep zero results.
 */
export function resolveComposerPatchContradictions(
    patch: AskCacheComposerPatch,
    state: AskCacheRequest["composerState"]
): AskCacheComposerPatch {
    const resultingMembership =
        patch.collectionMembershipFilter ?? state.collectionMembershipFilter;
    const resultingSelectedCollectionIds =
        patch.selectedCollectionIds ?? state.selectedCollectionIds;

    if (
        resultingMembership !== "not-in-collections" ||
        resultingSelectedCollectionIds.length === 0
    ) {
        return patch;
    }

    if (patch.collectionMembershipFilter === "not-in-collections") {
        return { ...patch, selectedCollectionIds: [] };
    }

    if (
        patch.selectedCollectionIds !== undefined &&
        patch.selectedCollectionIds.length > 0
    ) {
        return { ...patch, collectionMembershipFilter: "all" };
    }

    return { ...patch, selectedCollectionIds: [] };
}

export function isNoopComposerPatch(
    patch: AskCacheComposerPatch,
    state: AskCacheRequest["composerState"]
): boolean {
    if (patch.reset) {
        return false;
    }

    const checks: Array<() => boolean> = [
        () =>
            patch.collectionMembershipFilter !== undefined &&
            patch.collectionMembershipFilter !==
                state.collectionMembershipFilter,
        () =>
            patch.columnCountMode !== undefined &&
            patch.columnCountMode !== state.columnCountMode,
        () =>
            patch.domainFilters !== undefined &&
            !arraysEqual(patch.domainFilters, state.domainFilters),
        () => patch.groupBy !== undefined && patch.groupBy !== state.groupBy,
        () =>
            patch.searchTerms !== undefined &&
            !arraysEqual(patch.searchTerms, state.searchTerms),
        () => patch.sortMode !== undefined && patch.sortMode !== state.sortMode,
        () =>
            patch.sourceFilters !== undefined &&
            !arraysEqual(patch.sourceFilters, state.sourceFilters),
        () =>
            patch.selectedCollectionIds !== undefined &&
            !arraysEqual(
                patch.selectedCollectionIds,
                state.selectedCollectionIds
            ),
    ];

    return !checks.some((check) => check());
}
