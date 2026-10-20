import "server-only";

import { tool } from "ai";
import { resolveAgentViewPage } from "./agent-view";
import {
    type AgentViewPage,
    ASSISTANT_OPERATION_LIMIT,
    type AssistantComposerPatch,
    type AssistantRequest,
    AssistantToolUpdateInputSchema,
    DEFAULT_ASSISTANT_COMPOSER_STATE,
    DefineAgentViewToolInputSchema,
    isNoopComposerPatch,
    normalizeAgentViewQueryForContext,
    normalizeComposerPatchForContext,
    resolveComposerPatchContradictions,
} from "./composer";

/**
 * Each tool owns its policy; changes made during a run are recorded into
 * the run state the runner provides, so the agent can report them back.
 */
export function createComposerTools(args: {
    input: AssistantRequest;
    state: {
        operations: AssistantComposerPatch[];
        operationSummaries: string[];
        view: AgentViewPage | null;
    };
    userId: string;
}) {
    const { state } = args;
    let latestViewSequence = 0;
    let effectiveComposerState = args.input.composerState;

    const tools = {
        define_view: tool({
            description:
                "Define the ephemeral library view for show, find, or filter requests. Prefer this over update_composer for navigation. Returns server-resolved item ids in recency order with a truncated flag. One view per run; the last call wins.",
            execute: async (toolInput) => {
                latestViewSequence += 1;
                const viewSequence = latestViewSequence;
                const normalized = normalizeAgentViewQueryForContext(
                    toolInput.query,
                    {
                        availableCollections:
                            args.input.visibleContext.availableCollections,
                        availableDomains:
                            args.input.visibleContext.availableDomains,
                    }
                );

                const page = normalized.matchesNoItems
                    ? {
                          itemIds: [],
                          nextOffset: null,
                          previewLimited: false,
                          truncated: false,
                      }
                    : await resolveAgentViewPage({
                          query: normalized.query,
                          userId: args.userId,
                      });

                const view = {
                    explanation: toolInput.explanation,
                    itemIds: page.itemIds,
                    nextOffset: page.nextOffset,
                    query: normalized.query,
                    title: toolInput.title,
                    truncated: page.truncated,
                };
                if (viewSequence === latestViewSequence) {
                    state.view = view;
                }

                return {
                    itemCount: view.itemIds.length,
                    ok: true,
                    previewLimited: page.previewLimited,
                    title: view.title,
                    truncated: view.truncated,
                };
            },
            inputSchema: DefineAgentViewToolInputSchema,
        }),
        update_composer: tool({
            description:
                "Apply a validated composer patch. Batch all state changes into one call. Only include fields that differ from the current composer state; noop patches are rejected. Prefer high-confidence concrete filters (domains, collections, sources, entity names) over generic category searchTerms.",
            execute: (toolInput) => {
                if (state.operations.length >= ASSISTANT_OPERATION_LIMIT) {
                    return {
                        ok: false,
                        reason: "operation_limit_reached",
                    };
                }

                const stateBeforePatch = toolInput.patch.reset
                    ? DEFAULT_ASSISTANT_COMPOSER_STATE
                    : effectiveComposerState;
                const patch = resolveComposerPatchContradictions(
                    normalizeComposerPatchForContext(
                        toolInput.patch,
                        args.input
                    ),
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

                effectiveComposerState = applyAssistantComposerPatch(
                    patch,
                    stateBeforePatch
                );
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
        }),
    };

    return tools;
}

function applyAssistantComposerPatch(
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
