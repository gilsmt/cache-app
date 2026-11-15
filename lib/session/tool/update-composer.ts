import { tool } from "ai";
import {
    ASSISTANT_OPERATION_LIMIT,
    type AssistantComposerPatch,
    type AssistantRequest,
    AssistantToolUpdateInputSchema,
    DEFAULT_ASSISTANT_COMPOSER_STATE,
    isNoopComposerPatch,
    normalizeComposerPatchForContext,
    resolveComposerPatchContradictions,
} from "./composer";

export function buildUpdateComposerTool(args: {
    input: AssistantRequest;
    state: {
        operations: AssistantComposerPatch[];
        operationSummaries: string[];
    };
}) {
    const { state } = args;
    return tool({
        description: `Apply a validated composer patch. Batch all state changes into one call. Only include fields that differ from the current composer state; noop patches are rejected. At most ${ASSISTANT_OPERATION_LIMIT} changes apply per run; later calls are rejected. Prefer high-confidence concrete filters (domains, collections, sources, entity names) over generic category searchTerms.`,
        execute: (toolInput) => {
            if (state.operations.length >= ASSISTANT_OPERATION_LIMIT) {
                return {
                    ok: false,
                    reason: "operation_limit_reached",
                };
            }

            let composerState = args.input.composerState;
            for (const operation of state.operations) {
                composerState = applyPatch(
                    operation,
                    operation.reset
                        ? DEFAULT_ASSISTANT_COMPOSER_STATE
                        : composerState
                );
            }
            const stateBeforePatch = toolInput.patch.reset
                ? DEFAULT_ASSISTANT_COMPOSER_STATE
                : composerState;
            const patch = resolveComposerPatchContradictions(
                normalizeComposerPatchForContext(toolInput.patch, args.input),
                stateBeforePatch
            );

            if (isNoopComposerPatch(patch, stateBeforePatch)) {
                return {
                    ok: false,
                    reason: "patch_is_noop",
                    validationNote:
                        "All proposed changes already match the current composer state. Update only fields that differ.",
                };
            }

            state.operations.push(patch);
            state.operationSummaries.push(toolInput.summary);
            return {
                appliedOperationCount: state.operations.length,
                ok: true,
                patch,
                summary: toolInput.summary,
            };
        },
        inputSchema: AssistantToolUpdateInputSchema,
    });
}

function applyPatch(
    patch: AssistantComposerPatch,
    state: AssistantRequest["composerState"]
): AssistantRequest["composerState"] {
    return {
        collectionMembershipFilter:
            patch.collectionMembershipFilter ??
            state.collectionMembershipFilter,
        columnCountMode: patch.columnCountMode ?? state.columnCountMode,
        domainFilters: patch.domainFilters ?? state.domainFilters,
        groupBy: patch.groupBy ?? state.groupBy,
        searchTerms: patch.searchTerms ?? state.searchTerms,
        selectedCollectionIds:
            patch.selectedCollectionIds ?? state.selectedCollectionIds,
        sortMode: patch.sortMode ?? state.sortMode,
        sourceFilters: patch.sourceFilters ?? state.sourceFilters,
    };
}
