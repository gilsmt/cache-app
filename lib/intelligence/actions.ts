"use server";

import { request as getArcjetRequest } from "@arcjet/next";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import type { CollectionTemplateOption } from "@/lib/collections/templates";
import { getValidationErrorMessage } from "@/lib/common/action";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    type AskCacheRequest,
    AskCacheRequestSchema,
    type AskCacheResult,
} from "./composer/ask-cache";
import { runAskCacheAgent } from "./composer/service";
import { GenAiGenerationError, GenAiProtectionError } from "./error";
import {
    type CollectionDescriptionRequest,
    CollectionDescriptionRequestSchema,
    type DescriptionRequest,
    SECTION_DESCRIPTION_FALLBACK_TEXT,
    SectionDescriptionRequestSchema,
} from "./overview";
import {
    generateCollectionDescription,
    generateCollectionSummary,
    getCollectionSuggestions as getCollectionSuggestionsService,
} from "./service";

const log = createLogger("intelligence:actions");

export type SectionDescriptionResult =
    | {
          status: "SUCCESS";
          summary: string;
      }
    | {
          message: string;
          status:
              | "ERROR"
              | "FORBIDDEN"
              | "INVALID"
              | "QUOTA_EXCEEDED"
              | "UNAUTHORIZED";
          summary?: string;
      };

export type CollectionDescriptionResult =
    | {
          description: string;
          status: "SUCCESS";
      }
    | {
          message: string;
          status:
              | "ERROR"
              | "FORBIDDEN"
              | "INVALID"
              | "QUOTA_EXCEEDED"
              | "UNAUTHORIZED";
      };

export async function getSectionDescription(
    input: DescriptionRequest
): Promise<SectionDescriptionResult> {
    const parsed = SectionDescriptionRequestSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter valid overview context."
            ),
            status: "INVALID",
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to generate an overview."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const result = await generateCollectionSummary({
            expanded: parsed.data.expanded ?? false,
            items: parsed.data.items,
            request: await getArcjetRequest(),
            sectionTitle: parsed.data.sectionTitle,
            userId: auth.userId,
        });

        return {
            status: "SUCCESS",
            summary: result.summary,
        };
    } catch (error) {
        return mapGenerationFailure(error, {
            fallbackMessage: "We couldn't generate this overview right now.",
            logLabel: "generate library overview",
            summaryFallback: SECTION_DESCRIPTION_FALLBACK_TEXT,
        });
    }
}

export async function getCollectionDescription(
    input: CollectionDescriptionRequest
): Promise<CollectionDescriptionResult> {
    const parsed = CollectionDescriptionRequestSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter a valid collection title."
            ),
            status: "INVALID",
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to generate a collection description."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const result = await generateCollectionDescription({
            collectionTitle: parsed.data.title,
            request: await getArcjetRequest(),
            userId: auth.userId,
        });

        const description = result.description.trim();
        if (!description.length) {
            return {
                message:
                    "We couldn't generate a collection description right now.",
                status: "ERROR",
            };
        }

        return {
            description,
            status: "SUCCESS",
        };
    } catch (error) {
        return mapGenerationFailure(error, {
            fallbackMessage:
                "We couldn't generate a collection description right now.",
            logLabel: "generate collection description",
        });
    }
}

export async function askCache(
    input: AskCacheRequest
): Promise<AskCacheResult> {
    const parsed = AskCacheRequestSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter a valid Ask Cache request."
            ),
            status: "INVALID",
        };
    }

    const auth = await requireActionUserId("Sign in again to ask Cache.");
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const result = await runAskCacheAgent({
            input: parsed.data,
            request: await getArcjetRequest(),
            userId: auth.userId,
        });

        return {
            markdown: result.markdown,
            operations: result.operations,
            status: "SUCCESS",
        };
    } catch (error) {
        const failure = mapGenerationFailure(error, {
            fallbackMessage: "We couldn't ask Cache right now.",
            logLabel: "ask Cache",
        });

        return failure.status === "ERROR"
            ? {
                  markdown:
                      "Ask Cache could not complete that request. Please try again.",
                  ...failure,
              }
            : failure;
    }
}

export type CollectionSuggestionsResult =
    | {
          suggestions: CollectionTemplateOption[];
          status: "SUCCESS";
      }
    | {
          message: string;
          status: "ERROR" | "INVALID" | "UNAUTHORIZED";
      };

const SUGGESTIONS_ERROR_MESSAGE =
    "We couldn't load collection suggestions right now.";

export async function getCollectionSuggestions(): Promise<CollectionSuggestionsResult> {
    const auth = await requireActionUserId(
        "Sign in again to view collection suggestions."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const suggestions = await getCollectionSuggestionsService({
            userId: auth.userId,
        });

        return {
            status: "SUCCESS",
            suggestions,
        };
    } catch (error) {
        log.error("Failed to fetch collection suggestions", { error });
        return {
            message: SUGGESTIONS_ERROR_MESSAGE,
            status: "ERROR",
        };
    }
}

interface GenerationFailure {
    message: string;
    status: "ERROR" | "FORBIDDEN" | "QUOTA_EXCEEDED";
    summary?: string;
}

/**
 * Maps generation pipeline failures to action result payloads. Protection
 * denials map to quota or forbidden statuses with the protection message;
 * generation errors carry the classified message; unknown failures log and
 * fall back to generic copy.
 */
function mapGenerationFailure(
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
