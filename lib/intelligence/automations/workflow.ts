import { type ModelCallStreamPart, WorkflowAgent } from "@ai-sdk/workflow";
import { isStepCount } from "ai";
import { createLogger } from "@/lib/common/logs/console/logger";
import { summarizeStepUsage } from "@/lib/intelligence/classify";
import type { GenerationUsage } from "@/lib/intelligence/generation";
import {
    DEFAULT_REGISTERED_MODEL,
    type RegisteredModel,
} from "@/lib/intelligence/providers/model-registry";
import { resolveRegisteredModel } from "@/lib/intelligence/providers/model-resolver";
import {
    type AutomationAgentSource,
    createAutomationAgentTools,
} from "../tools/agent-tools";
import { AUTOMATION_INSPECTED_ITEM_COUNT_MAX } from "./constants";

const AUTOMATION_OUTPUT_TOKEN_LIMIT = 8192;

const log = createLogger("automations:workflow");

interface ReadyAutomationRun {
    modelId: RegisteredModel | null;
    payloadScope: string;
    prompt: string;
    runId: string;
    scheduledForUtc: string;
    templateKey: string | null;
    userId: string;
}

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
interface GenAiProtectionErrorData {
    data: {
        message: string;
        reason: "quota_exceeded" | "forbidden";
    };
}

export async function prepareAutomationRunForWorkflow(args: {
    runId: string;
    workflowRunId: string;
}) {
    "use step";
    const { markAutomationRunRunning } = await import("./service");
    return await markAutomationRunRunning(args);
}

export async function executeReadOnlyAutomationRun(ready: ReadyAutomationRun) {
    const instructions = buildAutomationInstructions(ready);
    const userMessage = buildAutomationUserMessage(ready);

    try {
        await protectAutomationAgentRun({
            prompt: `${instructions}\n\n${userMessage}`,
            userId: ready.userId,
        });

        const result = await runAutomationAgentForWorkflow({
            instructions,
            modelId: ready.modelId,
            runId: ready.runId,
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
        if (isGenAiProtectionErrorData(error)) {
            await finishAutomationRunForWorkflow({
                errorCode: error.data.reason,
                errorMessage: error.data.message,
                runId: ready.runId,
                status: "failed",
                summaryMarkdown:
                    "This automation was blocked by AI usage protection before it ran.",
            });
            return;
        }

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
}) {
    "use step";

    const { protectGenAiRequest } = await import(
        "@/lib/intelligence/protection"
    );
    const { estimateTokens } = await import("@/lib/intelligence/usage");

    await protectGenAiRequest({
        feature: "automation_agent",
        request: new Request("https://cache.local/internal/automations"),
        requestedTokens: estimateTokens(
            args.prompt,
            AUTOMATION_OUTPUT_TOKEN_LIMIT
        ),
        userId: args.userId,
    });
}

async function runAutomationAgentForWorkflow(args: {
    instructions: string;
    modelId: RegisteredModel | null;
    runId: string;
    userMessage: string;
}): Promise<AutomationAgentRunResult> {
    "use step";

    const { getSources, tools } = createAutomationAgentTools({
        runId: args.runId,
    });

    const agent = new WorkflowAgent({
        instructions: args.instructions,
        maxOutputTokens: AUTOMATION_OUTPUT_TOKEN_LIMIT,
        model: resolveRegisteredModel(
            args.modelId ?? DEFAULT_REGISTERED_MODEL,
            "executeReadOnlyAutomationRun"
        ),
        temperature: 0.3,
        tools,
    });

    const result = await agent.stream({
        messages: [
            {
                content: args.userMessage,
                role: "user",
            },
        ],
        stopWhen: isStepCount(6),
        writable: new WritableStream<ModelCallStreamPart>(),
    });

    return {
        sources: getSources(),
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

function isGenAiProtectionErrorData(
    error: unknown
): error is GenAiProtectionErrorData {
    if (typeof error !== "object" || error === null || !("data" in error)) {
        return false;
    }

    const { data } = error;
    if (typeof data !== "object" || data === null) {
        return false;
    }

    return (
        "message" in data &&
        typeof data.message === "string" &&
        "reason" in data &&
        (data.reason === "quota_exceeded" || data.reason === "forbidden")
    );
}

function buildAutomationInstructions(ready: ReadyAutomationRun): string {
    return [
        "You are Cache's scheduled automation agent.",
        "You help users make saved content useful without mutating their library.",
        "Use the payload tools to inspect saved items. Do not claim to inspect items you did not retrieve.",
        `Inspect at most ${AUTOMATION_INSPECTED_ITEM_COUNT_MAX} saved items. If the payload is larger, disclose that the result is based on a bounded sample.`,
        "Use web_search and web_fetch only when current public context is useful. Use github_repo for stats on a specific public GitHub repository.",
        "Return concise markdown. Include practical next steps when relevant.",
        `Scheduled run time: ${ready.scheduledForUtc}`,
        `Payload scope: ${ready.payloadScope}`,
    ].join("\n");
}

function buildAutomationUserMessage(prepared: ReadyAutomationRun): string {
    return [
        "Run this saved-content automation:",
        "",
        prepared.prompt,
        "",
        "Return the final result as concise markdown.",
    ].join("\n");
}

function getFinalStepText(steps: Array<{ text?: string }>): string {
    const finalText = steps.findLast((step) => step.text?.trim())?.text?.trim();
    if (finalText) {
        return finalText;
    }

    return "The automation completed, but it did not produce a text summary.";
}
