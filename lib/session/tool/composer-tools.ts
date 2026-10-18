import "server-only";

import { tool } from "ai";
import { resolveAgentViewPage } from "./agent-view";
import {
    type AgentViewPage,
    ASSISTANT_OPERATION_LIMIT,
    type AssistantComposerPatch,
    type AssistantRequest,
    AssistantToolUpdateInputSchema,
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

    const tools = {
        define_view: tool({
            description:
                "Define the ephemeral library view for show, find, or filter requests. Prefer this over update_composer for navigation. Returns server-resolved item ids in recency order with a truncated flag. One view per run; the last call wins.",
            execute: async (toolInput) => {
                const query = normalizeAgentViewQueryForContext(
                    toolInput.query,
                    {
                        availableCollections:
                            args.input.visibleContext.availableCollections,
                        availableDomains:
                            args.input.visibleContext.availableDomains,
                    }
                );

                const page = await resolveAgentViewPage({
                    query,
                    userId: args.userId,
                });

                state.view = {
                    explanation: toolInput.explanation,
                    itemIds: page.itemIds,
                    nextOffset: page.nextOffset,
                    query,
                    title: toolInput.title,
                    truncated: page.truncated,
                };

                return {
                    itemCount: state.view.itemIds.length,
                    ok: true,
                    previewLimited: page.previewLimited,
                    title: state.view.title,
                    truncated: state.view.truncated,
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

                const patch = resolveComposerPatchContradictions(
                    normalizeComposerPatchForContext(
                        toolInput.patch,
                        args.input
                    ),
                    args.input.composerState
                );

                if (isNoopComposerPatch(patch, args.input.composerState)) {
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
        }),
    };

    return tools;
}
