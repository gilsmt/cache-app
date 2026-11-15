import {
    ASSISTANT_SYSTEM_PROMPT,
    buildAssistantUserMessage,
} from "../instructions/assistant";
import {
    AUTOMATION_SYSTEM_PROMPT,
    buildAutomationUserMessage,
} from "../instructions/automations";
import { buildAutomationPayloadItemsTool } from "../tool/automation-items";
import { buildAutomationPayloadSummaryTool } from "../tool/automation-summary";
import type { AssistantRequest } from "../tool/composer";
import { buildDefineViewTool } from "../tool/define-view";
import { buildGitHubRepoTool } from "../tool/github";
import { buildLibrarySearchTool } from "../tool/library";
import { buildUpdateComposerTool } from "../tool/update-composer";
import { buildWebFetchTool } from "../tool/webfetch";
import { buildWebSearchTool } from "../tool/websearch";
import type { AgentDefinition } from "./runner";

export const assistantAgent: AgentDefinition<AssistantRequest> = {
    defaultErrorMessage: "We couldn't ask the assistant right now.",
    feature: "assistant_agent",
    id: "assistant",
    instructions: ASSISTANT_SYSTEM_PROMPT,
    maxSteps: 12,
    operation: "runAssistant",
    outputTokenLimit: 8192,
    timeoutMs: 60_000,
    tools: ({ input, state, userId }) => ({
        define_view: buildDefineViewTool({ input, state, userId }),
        github_repo: buildGitHubRepoTool(state),
        search_library: buildLibrarySearchTool({ userId }),
        update_composer: buildUpdateComposerTool({ input, state }),
        web_fetch: buildWebFetchTool(state),
        web_search: buildWebSearchTool(state),
    }),
    userMessage: buildAssistantUserMessage,
};

export interface AutomationAgentInput {
    payloadScope: string;
    prompt: string;
    runId: string;
    scheduledForUtc: string;
    templateKey: string | null;
    userId: string;
}

export const automationAgent: AgentDefinition<AutomationAgentInput> = {
    defaultErrorMessage: "This automation failed before producing a result.",
    feature: "automation_agent",
    id: "automation",
    instructions: AUTOMATION_SYSTEM_PROMPT,
    maxSteps: 6,
    operation: "executeReadOnlyAutomationRun",
    outputTokenLimit: 8192,
    temperature: 0.3,
    tools: ({ input, state }) => ({
        getAutomationPayloadSummary: buildAutomationPayloadSummaryTool({
            runId: input.runId,
        }),
        github_repo: buildGitHubRepoTool(state),
        listAutomationPayloadItems: buildAutomationPayloadItemsTool({
            runId: input.runId,
            state,
        }),
        web_fetch: buildWebFetchTool(state),
        web_search: buildWebSearchTool(state),
    }),
    userMessage: buildAutomationUserMessage,
};
