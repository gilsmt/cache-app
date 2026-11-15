"use server";

import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import { getValidationErrorMessage } from "@/lib/common/action";
import {
    type GenerationActionStatus,
    mapGenerationFailure,
} from "@/lib/session/ai/error";
import { getCachedCollectionDescription, getCachedOverview } from "./cache";
import {
    type CollectionDescriptionRequest,
    CollectionDescriptionRequestSchema,
    type OverviewRequest,
    OverviewRequestSchema,
} from "./schema";
import { OVERVIEW_FALLBACK_TEXT } from "./service";

export type OverviewResult =
    | {
          status: "SUCCESS";
          summary: string;
      }
    | {
          message: string;
          status: GenerationActionStatus;
          summary?: string;
      };

export type CollectionDescriptionResult =
    | {
          description: string;
          status: "SUCCESS";
      }
    | {
          message: string;
          status: GenerationActionStatus;
      };

export async function getOverview(
    input: OverviewRequest
): Promise<OverviewResult> {
    const parsed = OverviewRequestSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter valid overview context."
            ),
            status: "INVALID",
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to generate an overview."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await getCachedOverview({
            expanded: parsed.data.expanded ?? false,
            items: parsed.data.items,
            sectionTitle: parsed.data.sectionTitle,
            userId: actor.userId,
        });

        if ("error" in result) {
            throw result.error;
        }

        return {
            status: "SUCCESS",
            summary: result.value.summary,
        };
    } catch (error) {
        return mapGenerationFailure(error, {
            fallbackMessage: "We couldn't generate this overview right now.",
            logLabel: "generate library overview",
            summaryFallback: OVERVIEW_FALLBACK_TEXT,
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

    const actor = await requireActionUserId(
        "Sign in again to generate a collection description."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await getCachedCollectionDescription({
            collectionTitle: parsed.data.title,
            userId: actor.userId,
        });

        if ("error" in result) {
            throw result.error;
        }

        const description = result.value.description.trim();
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
