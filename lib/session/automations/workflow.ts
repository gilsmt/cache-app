import { type ModelCallStreamPart, WorkflowAgent } from "@ai-sdk/workflow";
import { isStepCount } from "ai";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    type AutomationAgentInput,
    automationAgent,
} from "@/lib/session/ai/agents";
import type { GenerationUsage } from "@/lib/session/ai/generate";
import { resolveRegisteredModel } from "@/lib/session/ai/resolver";
import { createAgentRunState } from "@/lib/session/ai/runner";
import { summarizeStepUsage } from "@/lib/session/ai/usage";
import { normalizeGeneratedMarkdown } from "@/lib/session/formatter/markdown";
import type { AutomationAgentSource } from "@/lib/session/tool/web";
import { uniqueSources } from "@/lib/session/tool/web";

const log = createLogger("automations:workflow");

type AutomationRunSources =
    | {
          itemIds: string[];
      }
    | {
          sources: AutomationAgentSource[];
      };

interface AutomationAgentRunResult {
    sources: { sources: AutomationAgentSource[] };
    summaryMarkdown: string;
    usage?: GenerationUsage;
}

interface AutomationProtectionDenial {
    message: string;
    reason: "quota_exceeded" | "forbidden";
}

export async function prepareAutomationRunForWorkflow(args: {
    runId: string;
    workflowRunId: string;
}) {
    "use step";
    const { markAutomationRunRunning } = await import("./service");
    return await markAutomationRunRunning(args);
}

export async function executeReadOnlyAutomationRun(
    ready: AutomationAgentInput
) {
    const instructions = automationAgent.instructions(ready);
    const userMessage = automationAgent.userMessage(ready);

    try {
        const denial = await protectAutomationAgentRun({
            prompt: `${instructions}\n\n${userMessage}`,
            userId: ready.userId,
        });

        if (denial) {
            await finishAutomationRunForWorkflow({
                errorCode: denial.reason,
                errorMessage: denial.message,
                runId: ready.runId,
                status: "failed",
                summaryMarkdown:
                    "This automation was blocked by AI usage protection before it ran.",
            });
            return;
        }

        const result = await runAutomationAgentForWorkflow({
            input: ready,
            instructions,
            userMessage,
        });

        await finishAutomationRunForWorkflow({
            runId: ready.runId,
            sources: result.sources,
            status: "succeeded",
            summaryMarkdown: result.summaryMarkdown,
            usage: result.usage,
        });
    } catch (error) {
        log.error("Automation agent run failed", error);
        await finishAutomationRunForWorkflow({
            errorCode: "agent_failed",
            errorMessage:
                error instanceof Error ? error.message : String(error),
            runId: ready.runId,
            status: "failed",
            summaryMarkdown:
                "This automation failed before producing a result.",
        });
    }
}

async function protectAutomationAgentRun(args: {
    prompt: string;
    userId: string;
}): Promise<AutomationProtectionDenial | null> {
    "use step";

    const { protectGenAiRequest } = await import("@/lib/session/protection");
    const { GenAiProtectionError } = await import("@/lib/session/error");
    const { estimateTokens } = await import("@/lib/session/ai/usage");

    try {
        await protectGenAiRequest({
            feature: automationAgent.feature,
            request: new Request("https://cache.local/internal/automations"),
            requestedTokens: estimateTokens(
                args.prompt,
                automationAgent.outputTokenLimit
            ),
            userId: args.userId,
        });
        return null;
    } catch (error) {
        if (GenAiProtectionError.isInstance(error)) {
            return {
                message: error.data.message,
                reason: error.data.reason,
            };
        }
        throw error;
    }
}

async function runAutomationAgentForWorkflow(args: {
    input: AutomationAgentInput;
    instructions: string;
    userMessage: string;
}): Promise<AutomationAgentRunResult> {
    "use step";

    const state = createAgentRunState();

    const agent = new WorkflowAgent({
        instructions: args.instructions,
        maxOutputTokens: automationAgent.outputTokenLimit,
        model: resolveRegisteredModel(automationAgent.operation),
        temperature: automationAgent.temperature,
        tools: automationAgent.tools({
            input: args.input,
            state,
            userId: args.input.userId,
        }),
    });

    const result = await agent.stream({
        messages: [
            {
                content: args.userMessage,
                role: "user",
            },
        ],
        stopWhen: isStepCount(automationAgent.maxSteps),
        writable: new WritableStream<ModelCallStreamPart>(),
    });

    return {
        sources: uniqueSources(state.sources),
        summaryMarkdown: getFinalStepText(result.steps),
        usage: summarizeStepUsage(result.steps),
    };
}

async function finishAutomationRunForWorkflow(args: {
    errorCode?: string;
    errorMessage?: string;
    runId: string;
    sources?: AutomationRunSources;
    status: "succeeded" | "failed";
    summaryMarkdown?: string;
    usage?: GenerationUsage;
}) {
    "use step";
    const { finishAutomationRun } = await import("./service");
    await finishAutomationRun(args);
}

function getFinalStepText(steps: Array<{ text?: string }>): string {
    const finalText = steps.findLast((step) => step.text?.trim())?.text?.trim();
    if (finalText) {
        const normalized = normalizeGeneratedMarkdown(finalText);
        if (normalized) {
            return normalized;
        }
    }

    return "The automation completed, but it did not produce a text summary.";
}
