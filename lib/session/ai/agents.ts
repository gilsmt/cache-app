import {
    buildAssistantInstructions,
    buildAssistantUserMessage,
} from "../instructions/assistant";
import {
    buildAutomationInstructions,
    buildAutomationUserMessage,
} from "../instructions/automations";
import { createAutomationPayloadTools } from "../tool/automation";
import type { AssistantRequest } from "../tool/composer";
import { createComposerTools } from "../tool/composer";
import { createLibrarySearchTool } from "../tool/library-search";
import { createWebAgentTools } from "../tool/web";
import type { AgentDefinition } from "./runner";

export const assistantAgent: AgentDefinition<AssistantRequest> = {
    defaultErrorMessage: "We couldn't ask the assistant right now.",
    feature: "assistant_agent",
    id: "assistant",
    instructions: buildAssistantInstructions,
    maxSteps: 12,
    operation: "runAssistant",
    outputTokenLimit: 8192,
    timeoutMs: 60_000,
    tools: ({ input, state, userId }) => ({
        ...createWebAgentTools(state),
        search_library: createLibrarySearchTool({ userId }),
        ...createComposerTools({ input, state, userId }),
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
    instructions: buildAutomationInstructions,
    maxSteps: 6,
    operation: "executeReadOnlyAutomationRun",
    outputTokenLimit: 8192,
    temperature: 0.3,
    tools: ({ input, state }) => ({
        ...createWebAgentTools(state),
        ...createAutomationPayloadTools({ runId: input.runId, state }),
    }),
    userMessage: buildAutomationUserMessage,
};
