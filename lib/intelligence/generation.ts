import "server-only";

import {
    type FilePart,
    generateText,
    type LanguageModelUsage,
    Output,
    type TextPart,
} from "ai";
import type * as z from "zod";
import { createLogger } from "@/lib/common/logs/console/logger";
import { classifyGenerationError } from "./classify";
import { GenAiGenerationError } from "./error";
import type { ModelRef } from "./providers/model-refs";
import {
    resolveLanguageModel,
    resolveModelRefChain,
} from "./providers/resolve-model";

const log = createLogger("intelligence:generation");

/**
 * Retries per model attempt. The AI SDK retries transient provider failures
 * with exponential backoff before the error reaches the fallback chain.
 */
const GENERATION_MAX_RETRIES = 2;

export type GenerationContent = Array<TextPart | FilePart>;

export interface GenerationUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

export interface GenerationResult<T> {
    output: T;
    usage: GenerationUsage | undefined;
}

interface ModelChainInput {
    /** Message reported when every model in the chain fails without a classification. */
    defaultErrorMessage?: string;
    /** Feature label used for logging, spans, and error context. */
    feature: string;
    logContext?: Record<string, unknown>;
    operation: string;
}

export interface StructuredGenerationInput<T> extends ModelChainInput {
    maxOutputTokens: number;
    parts?: GenerationContent;
    prompt: string;
    schema: z.ZodType<T>;
    system?: string;
    temperature?: number;
    timeoutMs: number;
}

/**
 * Runs a structured generation against the model fallback chain.
 *
 * Resolves each vendor-qualified model reference, retries transient provider
 * failures, and validates output against the schema. Falls through to the
 * next model on empty or invalid output and on server-side failures, and
 * stops immediately on quota and configuration errors.
 */
export function generateStructured<T>(
    input: StructuredGenerationInput<T>
): Promise<GenerationResult<T>> {
    return runModelChain(input, async (model) => {
        const result = await generateText({
            maxOutputTokens: input.maxOutputTokens,
            maxRetries: GENERATION_MAX_RETRIES,
            model,
            ...(input.parts
                ? {
                      messages: [
                          {
                              content: [
                                  {
                                      text: input.prompt,
                                      type: "text" as const,
                                  },
                                  ...input.parts,
                              ],
                              role: "user" as const,
                          },
                      ],
                  }
                : { prompt: input.prompt }),
            output: Output.object({ schema: input.schema }),
            ...(input.temperature === undefined
                ? {}
                : { temperature: input.temperature }),
            ...(input.system ? { system: input.system } : {}),
            timeout: input.timeoutMs,
        });
        return { output: result.output, usage: result.usage };
    });
}

export async function runModelChain<T>(
    input: ModelChainInput,
    call: (
        model: Awaited<ReturnType<typeof resolveLanguageModel>>,
        modelRef: ModelRef
    ) => Promise<{
        output: T;
        usage?: Pick<
            LanguageModelUsage,
            "inputTokens" | "outputTokens" | "totalTokens"
        >;
    }>
): Promise<GenerationResult<T>> {
    const span = log.time(input.feature, {
        ...input.logContext,
        operation: input.operation,
    });

    let lastError: unknown;
    try {
        for (const modelRef of resolveModelRefChain()) {
            try {
                const model = resolveLanguageModel(modelRef, input.operation);
                const result = await call(model, modelRef);
                return {
                    output: result.output,
                    usage: normalizeUsage(result.usage),
                };
            } catch (error) {
                lastError = error;
                const classification = classifyGenerationError(error);
                log.warn("Generation attempt failed", {
                    ...input.logContext,
                    canFallback: classification.canFallback,
                    error:
                        error instanceof Error ? error.message : String(error),
                    errorClassification: classification.message,
                    feature: input.feature,
                    modelRef,
                });
                if (!classification.canFallback) {
                    break;
                }
            }
        }
    } finally {
        span.stop();
    }

    const classification = classifyGenerationError(lastError);
    throw new GenAiGenerationError(
        {
            message: input.defaultErrorMessage ?? classification.message,
            operation: input.operation,
            status: classification.status,
        },
        { cause: lastError instanceof Error ? lastError : undefined }
    );
}

function normalizeUsage(
    usage:
        | Pick<
              LanguageModelUsage,
              "inputTokens" | "outputTokens" | "totalTokens"
          >
        | undefined
): GenerationUsage | undefined {
    if (!usage) {
        return undefined;
    }
    return {
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
    };
}
