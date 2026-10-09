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
import { resolveRegisteredModel } from "./providers/resolver";

const log = createLogger("intelligence:generation");

/**
 * The AI SDK retries transient provider failures with exponential backoff.
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

interface GenerationInput {
    /** Message reported when generation fails. */
    defaultErrorMessage?: string;
    /** Feature label used for logging, spans, and error context. */
    feature: string;
    logContext?: Record<string, unknown>;
    operation: string;
}

export interface StructuredGenerationInput<T> extends GenerationInput {
    maxOutputTokens: number;
    parts?: GenerationContent;
    prompt: string;
    schema: z.ZodType<T>;
    system?: string;
    temperature?: number;
    timeoutMs: number;
}

/**
 * Runs a structured generation against the configured model.
 *
 * Retries transient provider failures and validates output against the schema.
 */
export function generateStructured<T>(
    input: StructuredGenerationInput<T>
): Promise<GenerationResult<T>> {
    return runGeneration(input, async (model) => {
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

export async function runGeneration<T>(
    input: GenerationInput,
    call: (
        model: Awaited<ReturnType<typeof resolveRegisteredModel>>
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

    try {
        const result = await call(resolveRegisteredModel(input.operation));
        return {
            output: result.output,
            usage: normalizeUsage(result.usage),
        };
    } catch (error) {
        const classification = classifyGenerationError(error);
        log.warn("Generation failed", {
            ...input.logContext,
            error: error instanceof Error ? error.message : String(error),
            errorClassification: classification.message,
            feature: input.feature,
        });
        throw new GenAiGenerationError(
            {
                message: input.defaultErrorMessage ?? classification.message,
                operation: input.operation,
                status: classification.status,
            },
            { cause: error }
        );
    } finally {
        span.stop();
    }
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
