import { type ModelCallStreamPart, WorkflowAgent } from "@ai-sdk/workflow";
import { isStepCount, tool } from "ai";
import { createLogger } from "@/lib/common/logs/console/logger";
import { summarizeStepUsage } from "@/lib/intelligence/classify";
import type { GenerationUsage } from "@/lib/intelligence/generation";
import {
    DEFAULT_MODEL_REF,
    type ModelRef,
} from "@/lib/intelligence/providers/model-refs";
import { resolveLanguageModel } from "@/lib/intelligence/providers/resolve-model";
import { AUTOMATION_INSPECTED_ITEM_COUNT_MAX } from "./constants";
import {
    AutomationPayloadItemsInputSchema,
    AutomationWebFetchInputSchema,
    AutomationWebSearchInputSchema,
    EmptyAutomationToolInputSchema,
} from "./tool-inputs";

const AUTOMATION_OUTPUT_TOKEN_LIMIT = 1200;

const log = createLogger("automations:workflow");

interface ReadyAutomationRun {
    modelId: ModelRef | null;
    payloadScope: string;
    prompt: string;
    runId: string;
    scheduledForUtc: string;
    templateKey: string | null;
    userId: string;
}

type AutomationRunSource = Record<string, string>;
type AutomationRunSources =
    | {
          itemIds: string[];
      }
    | {
          sources: AutomationRunSource[];
      };
interface AutomationAgentRunResult {
    sources: { sources: AutomationRunSource[] };
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

    const { estimateGenAiTokens, protectGenAiRequest } = await import(
        "@/lib/intelligence/protection"
    );

    await protectGenAiRequest({
        feature: "automation_agent",
        request: new Request("https://cache.local/internal/automations"),
        requestedTokens: estimateGenAiTokens(
            args.prompt,
            AUTOMATION_OUTPUT_TOKEN_LIMIT
        ),
        userId: args.userId,
    });
}

async function runAutomationAgentForWorkflow(args: {
    instructions: string;
    modelId: ModelRef | null;
    runId: string;
    userMessage: string;
}): Promise<AutomationAgentRunResult> {
    "use step";

    const sources: AutomationRunSource[] = [];

    const agent = new WorkflowAgent({
        instructions: args.instructions,
        maxOutputTokens: AUTOMATION_OUTPUT_TOKEN_LIMIT,
        model: resolveLanguageModel(
            args.modelId ?? DEFAULT_MODEL_REF,
            "executeReadOnlyAutomationRun"
        ),
        temperature: 0.3,
        tools: {
            getAutomationPayloadSummary: tool({
                description:
                    "Return the total size and scope of the saved-content payload available to this automation run.",
                execute: async () => {
                    const { getAutomationPayloadSummary } = await import(
                        "./payload"
                    );
                    return await getAutomationPayloadSummary({
                        runId: args.runId,
                    });
                },
                inputSchema: EmptyAutomationToolInputSchema,
            }),
            listAutomationPayloadItems: tool({
                description:
                    "Page through saved items available to this automation run. Use this before writing the final summary.",
                execute: async (input) => {
                    const { listAutomationPayloadItems } = await import(
                        "./payload"
                    );
                    const result = await listAutomationPayloadItems({
                        cursor: input.cursor,
                        limit: input.limit,
                        runId: args.runId,
                        search: input.search,
                    });
                    for (const item of result.items) {
                        sources.push({
                            id: item.id,
                            title: item.caption ?? item.url,
                            type: "library_item",
                            url: item.url,
                        });
                    }
                    return result;
                },
                inputSchema: AutomationPayloadItemsInputSchema,
            }),
            web_fetch: tool({
                description:
                    "Fetch a public http(s) URL with SSRF protections and a bounded response body.",
                execute: async (input) => {
                    const { automationWebFetch } = await import("./payload");
                    const result = await automationWebFetch({
                        url: input.url,
                    });
                    if (typeof result.url === "string") {
                        sources.push({
                            type: "web",
                            url: result.url,
                        });
                    }
                    return result;
                },
                inputSchema: AutomationWebFetchInputSchema,
            }),
            web_search: tool({
                description:
                    "Search the web for current public information using Tavily.",
                execute: async (input) => {
                    const { automationWebSearch } = await import(
                        "./web-search"
                    );
                    const result = await automationWebSearch(input);
                    for (const webResult of result.results) {
                        sources.push({
                            title: webResult.title,
                            type: "web",
                            url: webResult.url,
                        });
                    }
                    return result;
                },
                inputSchema: AutomationWebSearchInputSchema,
            }),
        },
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
        sources: uniqueSources(sources),
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
        "Use web_search and web_fetch only when current public context is useful.",
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

function uniqueSources(sources: AutomationRunSource[]) {
    const byKey = new Map<string, AutomationRunSource>();
    for (const source of sources) {
        let tag: string | null;
        if ("id" in source) {
            tag = source.id;
        } else if ("url" in source) {
            tag = source.url;
        } else {
            tag = null;
        }
        if (tag === null) {
            continue;
        }
        const key = `${source.type}:${tag}`;
        if (!byKey.has(key)) {
            byKey.set(key, source);
        }
    }
    return {
        sources: [...byKey.values()].slice(0, 100),
    };
}

function getFinalStepText(steps: Array<{ text?: string }>): string {
    const finalText = steps.findLast((step) => step.text?.trim())?.text?.trim();
    if (finalText) {
        return finalText;
    }

    return "The automation completed, but it did not produce a text summary.";
}
