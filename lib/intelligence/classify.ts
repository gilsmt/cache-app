import {
    APICallError,
    type LanguageModelUsage,
    LoadAPIKeyError,
    RetryError,
} from "ai";
import { isRecord } from "@/lib/common/object";
import { GenAiConfigurationError } from "./error";

export interface ErrorClassification {
    /** When false, the fallback chain stops and the error surfaces immediately. */
    canFallback: boolean;
    message: string;
    status: number;
}

/**
 * Thrown when a text generation returns a response without content. Drives
 * the fallback chain to the next model.
 */
export class EmptyGenerationOutputError extends Error {
    constructor() {
        super("Model returned no output.");
        this.name = "EmptyGenerationOutputError";
    }
}

/**
 * Classifies AI SDK provider errors for the model fallback chain.
 * Configuration and quota failures cannot improve by switching models;
 * everything else can.
 */
export function classifyGenerationError(error: unknown): ErrorClassification {
    const providerError = unwrapProviderError(error);

    if (GenAiConfigurationError.isInstance(providerError)) {
        return {
            canFallback: false,
            message: providerError.data.message,
            status: 500,
        };
    }

    if (LoadAPIKeyError.isInstance(providerError)) {
        return {
            canFallback: false,
            message: "Cache AI provider credentials are missing or invalid.",
            status: 500,
        };
    }

    if (APICallError.isInstance(providerError)) {
        return classifyProviderError(providerError);
    }

    if (error instanceof EmptyGenerationOutputError) {
        return {
            canFallback: true,
            message: error.message,
            status: 502,
        };
    }

    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes("timeout") || message.includes("abort")) {
            return {
                canFallback: true,
                message: "Request timed out. Please try again.",
                status: 408,
            };
        }
    }

    return {
        canFallback: true,
        message: "Unknown error",
        status: 500,
    };
}

export function summarizeStepUsage(
    steps: Array<{
        usage?: Pick<
            LanguageModelUsage,
            "inputTokens" | "outputTokens" | "totalTokens"
        >;
    }>
):
    | { inputTokens: number; outputTokens: number; totalTokens: number }
    | undefined {
    if (steps.length === 0) {
        return undefined;
    }

    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    for (const step of steps) {
        inputTokens += step.usage?.inputTokens ?? 0;
        outputTokens += step.usage?.outputTokens ?? 0;
        totalTokens += step.usage?.totalTokens ?? 0;
    }

    return { inputTokens, outputTokens, totalTokens };
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

function classifyProviderError(error: APICallError): ErrorClassification {
    const statusCode = error.statusCode;
    const message = error.message.toLowerCase();

    if (isCredentialStatusCode(statusCode, message)) {
        return {
            canFallback: false,
            message: "Cache AI provider credentials are missing or invalid.",
            status: 500,
        };
    }
    if (statusCode === 429 || message.includes("quota")) {
        return {
            canFallback: false,
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
            canFallback: true,
            message: "Request timed out. Please try again.",
            status: 408,
        };
    }
    if (
        statusCode === 400 &&
        (message.includes("safety") || message.includes("content"))
    ) {
        return {
            canFallback: true,
            message: "Content could not be processed due to safety settings.",
            status: 400,
        };
    }
    if (statusCode !== undefined && statusCode >= 500) {
        return {
            canFallback: true,
            message: "AI service temporarily unavailable.",
            status: 502,
        };
    }
    if (statusCode === 404) {
        return {
            canFallback: true,
            message: error.message,
            status: 404,
        };
    }

    return {
        canFallback: statusCode === undefined,
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
