import "server-only";

import type { ArcjetNextRequest } from "@arcjet/next";
import {
    isStepCount,
    type LanguageModel,
    ToolLoopAgent,
    type ToolSet,
} from "ai";
import { createLogger } from "@/lib/common/logs/console/logger";
import { EmptyGenerationOutputError } from "../error";
import { normalizeGeneratedMarkdown } from "../formatter/markdown";
import { protectGenAiRequest } from "../protection";
import type { AgentViewPage, AssistantComposerPatch } from "../tool/composer";
import type { AutomationAgentSource } from "../tool/web";
import {
    type GenerationUsage,
    type RawGenerationUsage,
    runGeneration,
} from "./generate";
import { estimateTokens } from "./usage";

const log = createLogger("intelligence:agent");

/** What the tools of one agent run recorded. */
export interface AgentRunState {
    operationSummaries: string[];
    operations: AssistantComposerPatch[];
    sources: AutomationAgentSource[];
    view: AgentViewPage | null;
}

export function createAgentRunState(): AgentRunState {
    return {
        operationSummaries: [],
        operations: [],
        sources: [],
        view: null,
    };
}

/**
 * An agent definition: who an agent is, as data. A record carries every
 * policy decision — limits, instruction builders, and the toolset composed
 * from the tool layer per run — and holds no execution mechanics. Runners
 * consume records; records never know how they are run.
 */
export interface AgentDefinition<Input> {
    defaultErrorMessage: string;
    /** Protection feature label. */
    feature: string;
    id: string;
    instructions: (input: Input) => string;
    maxSteps: number;
    operation: string;
    outputTokenLimit: number;
    temperature?: number;
    timeoutMs?: number;
    tools: (args: {
        input: Input;
        state: AgentRunState;
        userId: string;
    }) => ToolSet;
    userMessage: (input: Input) => string;
}

interface AgentRunResult {
    markdown: string;
    state: AgentRunState;
    usage?: GenerationUsage;
}

/**
 * Runs one agent record to completion: quota protection, one tool-loop
 * generation against the resolved model, then markdown recovery from the
 * steps. The record owns every policy decision; this module owns the
 * mechanics.
 */
export async function runAgent<Input>(args: {
    agent: AgentDefinition<Input>;
    input: Input;
    request: ArcjetNextRequest;
    userId: string;
}): Promise<AgentRunResult> {
    const { agent, input, userId } = args;
    const instructions = agent.instructions(input);
    const userMessage = agent.userMessage(input);
    const state = createAgentRunState();

    await protectGenAiRequest({
        feature: agent.feature,
        request: args.request,
        requestedTokens: estimateTokens(
            `${instructions}\n\n${userMessage}`,
            agent.outputTokenLimit
        ),
        userId,
    });

    try {
        const result = await runGeneration(
            {
                defaultErrorMessage: agent.defaultErrorMessage,
                feature: agent.id,
                logContext: { userId },
                operation: agent.operation,
            },
            (model) =>
                runAgentModel({
                    agent,
                    input,
                    instructions,
                    model,
                    state,
                    userId,
                    userMessage,
                })
        );
        return { markdown: result.output.markdown, state, usage: result.usage };
    } catch (error) {
        log.error("Agent run failed", { agent: agent.id, error, userId });
        throw error;
    }
}

async function runAgentModel<Input>(args: {
    agent: AgentDefinition<Input>;
    input: Input;
    instructions: string;
    model: LanguageModel;
    state: AgentRunState;
    userMessage: string;
    userId: string;
}): Promise<{
    output: { markdown: string };
    usage?: RawGenerationUsage;
}> {
    const { agent, state } = args;
    const loop = new ToolLoopAgent({
        instructions: args.instructions,
        maxOutputTokens: agent.outputTokenLimit,
        model: args.model,
        stopWhen: isStepCount(agent.maxSteps),
        ...(agent.temperature === undefined
            ? {}
            : { temperature: agent.temperature }),
        tools: agent.tools({
            input: args.input,
            state,
            userId: args.userId,
        }),
    });

    const result = await loop.generate({
        messages: [{ content: args.userMessage, role: "user" }],
        ...(agent.timeoutMs === undefined ? {} : { timeout: agent.timeoutMs }),
    });

    const markdown = getFinalMarkdown(result.steps, state.operationSummaries);
    if (!markdown) {
        throw new EmptyGenerationOutputError({});
    }

    return {
        output: { markdown },
        usage: result.usage,
    };
}

/**
 * Recovers the final markdown from an agent run: the last non-empty step,
 * then aggregated step text, then operation summaries. Each candidate is
 * normalized before acceptance because providers occasionally wrap the
 * response in a JSON envelope.
 */
function getFinalMarkdown(
    steps: Array<{ text: string }>,
    operationSummaries: string[]
): string | null {
    const lastStepText = steps.findLast((step) => step.text.trim())?.text;
    const stepTexts: string[] = [];
    for (const step of steps) {
        const text = step.text.trim();
        if (text.length > 0) {
            stepTexts.push(text);
        }
    }
    const aggregatedStepText = stepTexts.join("\n");
    const summaryText =
        operationSummaries.length > 0
            ? operationSummaries.join("\n")
            : undefined;

    for (const candidate of [lastStepText, aggregatedStepText, summaryText]) {
        const normalized = normalizeGeneratedMarkdown(candidate);
        if (normalized) {
            return normalized;
        }
    }

    return null;
}
