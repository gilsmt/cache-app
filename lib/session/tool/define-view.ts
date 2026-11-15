import { tool } from "ai";
import { resolveAgentViewPage } from "./agent-view";
import {
    AGENT_VIEW_PAGE_ITEM_LIMIT,
    type AgentViewPage,
    type AssistantRequest,
    DefineAgentViewToolInputSchema,
    normalizeAgentViewQueryForContext,
} from "./composer";

export function buildDefineViewTool(args: {
    input: AssistantRequest;
    state: { view: AgentViewPage | null };
    userId: string;
}) {
    const { state } = args;
    // Tool calls can finish out of order. Only the last invocation owns the view.
    let latestViewSequence = 0;
    return tool({
        description: `Define the ephemeral library view: use it when the user asks to see, narrow, or filter the list, and prefer it over update_composer for navigation. Resolves items on the server in recency order and returns their ids with a truncated flag; one page holds up to ${AGENT_VIEW_PAGE_ITEM_LIMIT} items. One view per run; the last call wins.`,
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
    });
}
