import type { ToolSet } from "ai";
import type { AutomationAgentSource } from "../ai/runner";
import { buildAutomationPayloadItemsTool } from "./automation-items";
import { buildAutomationPayloadSummaryTool } from "./automation-summary";
import { buildGitHubRepoTool } from "./github";
import { buildLibrarySearchTool } from "./library";
import { buildWebFetchTool } from "./webfetch";
import { buildWebSearchTool } from "./websearch";

export function buildThreadAgentTools(args: {
    runId: string | null;
    userId: string;
}) {
    const state: { sources: AutomationAgentSource[] } = { sources: [] };
    const tools = {
        github_repo: buildGitHubRepoTool(state),
        web_fetch: buildWebFetchTool(state),
        web_search: buildWebSearchTool(state),
        ...buildAutomationRunTools({ runId: args.runId, state }),
        search_library: buildLibrarySearchTool({ userId: args.userId }),
    };

    return tools;
}

function buildAutomationRunTools(args: {
    runId: string | null;
    state: { sources: AutomationAgentSource[] };
}): ToolSet {
    if (!args.runId) {
        return {};
    }

    return {
        getAutomationPayloadSummary: buildAutomationPayloadSummaryTool({
            runId: args.runId,
        }),
        listAutomationPayloadItems: buildAutomationPayloadItemsTool({
            runId: args.runId,
            state: args.state,
        }),
    };
}
