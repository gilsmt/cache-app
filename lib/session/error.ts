import * as z from "zod";
import { PRICE_TYPES } from "@/lib/billing/types";
import { TaggedError } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";

const log = createLogger("intelligence:pipeline");

export const GenAiProtectionError = TaggedError.create(
    "GenAiProtectionError",
    z.object({
        feature: z.string(),
        message: z.string(),
        operation: z.string(),
        plan: z.enum(PRICE_TYPES),
        reason: z.enum(["quota_exceeded", "forbidden"]),
        requestedTokens: z.int().positive(),
        userId: z.string(),
    })
);

export const GenAiGenerationError = TaggedError.create(
    "GenAiGenerationError",
    z.object({
        message: z.string(),
        operation: z.string(),
        status: z.number().optional(),
    })
);

export const GenAiConfigurationError = TaggedError.create(
    "GenAiConfigurationError",
    z.object({
        message: z.string(),
        operation: z.string(),
    })
);

/** Thrown when a generation or agent run returns a response without content. */
export const EmptyGenerationOutputError = TaggedError.create(
    "EmptyGenerationOutputError",
    z.object({})
);

/** Failure statuses a generation-backed action can report to the client. */
export type GenerationActionStatus =
    | "ERROR"
    | "FORBIDDEN"
    | "INVALID"
    | "QUOTA_EXCEEDED"
    | "UNAUTHORIZED";

interface GenerationFailure {
    message: string;
    status: "ERROR" | "FORBIDDEN" | "QUOTA_EXCEEDED";
    summary?: string;
}

export function mapGenerationFailure(
    error: unknown,
    args: {
        fallbackMessage: string;
        logLabel: string;
        summaryFallback?: string;
    }
): GenerationFailure {
    if (GenAiProtectionError.isInstance(error)) {
        return {
            message: error.data.message,
            status:
                error.data.reason === "quota_exceeded"
                    ? "QUOTA_EXCEEDED"
                    : "FORBIDDEN",
        };
    }

    if (GenAiGenerationError.isInstance(error)) {
        return {
            message: error.data.message,
            status: "ERROR",
            ...(args.summaryFallback === undefined
                ? {}
                : { summary: args.summaryFallback }),
        };
    }

    log.error(`Failed to ${args.logLabel}`, error);
    return {
        message: args.fallbackMessage,
        status: "ERROR",
        ...(args.summaryFallback === undefined
            ? {}
            : { summary: args.summaryFallback }),
    };
}
