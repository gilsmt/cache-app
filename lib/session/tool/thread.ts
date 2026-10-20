import { createAutomationPayloadTools } from "./automation";
import { createLibrarySearchTool } from "./library-search";
import type { AutomationAgentSource } from "./web";
import { createWebAgentTools } from "./web";

export function createThreadAgentTools(args: {
    runId: string | null;
    userId: string;
}) {
    const state: { sources: AutomationAgentSource[] } = { sources: [] };
    const tools = {
        ...createWebAgentTools(state),
        ...(args.runId
            ? createAutomationPayloadTools({
                  runId: args.runId,
                  state,
              })
            : {}),
        search_library: createLibrarySearchTool({ userId: args.userId }),
    };

    return tools;
}
