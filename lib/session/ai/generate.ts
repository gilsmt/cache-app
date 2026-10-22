import "server-only";

import {
    APICallError,
    type FilePart,
    generateText,
    type LanguageModel,
    LoadAPIKeyError,
    Output,
    RetryError,
    type TextPart,
} from "ai";
import type * as z from "zod";
import { createLogger } from "@/lib/common/logs/console/logger";
import { isRecord } from "@/lib/common/object";
import {
    EmptyGenerationOutputError,
    GenAiConfigurationError,
    GenAiGenerationError,
} from "../error";
import { resolveRegisteredModel } from "./resolver";

const log = createLogger("intelligence:generation");

interface GenerationErrorClassification {
    message: string;
    status: number;
}

function classifyGenerationError(
    error: unknown
): GenerationErrorClassification {
    const providerError = unwrapProviderError(error);

    if (GenAiConfigurationError.isInstance(providerError)) {
        return {
            message: providerError.data.message,
            status: 500,
        };
    }

    if (LoadAPIKeyError.isInstance(providerError)) {
        return {
            message: "Cache AI provider credentials are missing or invalid.",
            status: 500,
        };
    }

    if (APICallError.isInstance(providerError)) {
        return classifyProviderError(providerError);
    }

    if (EmptyGenerationOutputError.isInstance(error)) {
        return {
            message: "Model returned no output.",
            status: 502,
        };
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes("timeout") || message.includes("abort")) {
            return {
                message: "Request timed out. Please try again.",
                status: 408,
            };
        }
    }

    return {
        message: "Unknown error",
        status: 500,
    };
}

function unwrapProviderError(
    error: unknown,
    seen = new Set<unknown>()
): unknown {
    if (seen.has(error)) {
        return error;
    }
    seen.add(error);

    if (APICallError.isInstance(error) || LoadAPIKeyError.isInstance(error)) {
        return error;
    }

    if (GenAiConfigurationError.isInstance(error)) {
        return error;
    }

    if (RetryError.isInstance(error)) {
        return unwrapProviderError(error.lastError, seen);
    }

    if (!(isRecord(error) && error.cause)) {
        return error;
    }

    return unwrapProviderError(error.cause, seen);
}

function classifyProviderError(
    error: APICallError
): GenerationErrorClassification {
    const statusCode = error.statusCode;
    const message = error.message.toLowerCase();

    if (isCredentialStatusCode(statusCode, message)) {
        return {
            message: "Cache AI provider credentials are missing or invalid.",
            status: 500,
        };
    }
    if (statusCode === 429 || message.includes("quota")) {
        return {
            message: "AI service quota exceeded. Please try again later.",
            status: 429,
        };
    }
    if (
        statusCode === 408 ||
        message.includes("timeout") ||
        message.includes("deadline")
    ) {
        return {
            message: "Request timed out. Please try again.",
            status: 408,
        };
    }
    if (
        statusCode === 400 &&
        (message.includes("safety") || message.includes("content"))
    ) {
        return {
            message: "Content could not be processed due to safety settings.",
            status: 400,
        };
    }
    if (statusCode !== undefined && statusCode >= 500) {
        return {
            message: "AI service temporarily unavailable.",
            status: 502,
        };
    }
    if (statusCode === 404) {
        return {
            message: error.message,
            status: 404,
        };
    }

    return {
        message: error.message,
        status: statusCode ?? 500,
    };
}

function isCredentialStatusCode(
    statusCode: number | undefined,
    message: string
): boolean {
    if (statusCode === 401 || statusCode === 403) {
        return true;
    }
    return (
        statusCode === 400 &&
        (message.includes("api key") ||
            message.includes("apikey") ||
            message.includes("credential") ||
            message.includes("unauthenticated") ||
            message.includes("authentication") ||
            message.includes("permission denied"))
    );
}

export type GenerationContent = Array<TextPart | FilePart>;

export interface GenerationUsage {
    cachedInputTokens: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

/** Usage as callers receive it from the SDK, before normalization. */
export interface RawGenerationUsage {
    inputTokenDetails?: { cacheReadTokens?: number | undefined } | undefined;
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    totalTokens?: number | undefined;
}

interface GenerationResult<T> {
    output: T;
    usage: GenerationUsage | undefined;
}

interface GenerationInput {
    defaultErrorMessage?: string;
    /** Feature label used for logging, spans, and error context. */
    feature: string;
    logContext?: Record<string, unknown>;
    operation: string;
}

interface StructuredGenerationInput<T> extends GenerationInput {
    maxOutputTokens: number;
    parts?: GenerationContent;
    prompt: string;
    schema: z.ZodType<T>;
    system?: string;
    temperature?: number;
    timeoutMs: number;
}

export function generateStructured<T>(
    input: StructuredGenerationInput<T>
): Promise<GenerationResult<T>> {
    return runGeneration(input, async (model) => {
        const result = await generateText({
            maxOutputTokens: input.maxOutputTokens,
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
    call: (model: LanguageModel) => Promise<{
        output: T;
        usage?: RawGenerationUsage;
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
            error,
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
    usage: RawGenerationUsage | undefined
): GenerationUsage | undefined {
    if (!usage) {
        return undefined;
    }
    return {
        cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
    };
}
