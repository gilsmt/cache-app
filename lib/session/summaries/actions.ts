"use server";

import { request as getArcjetRequest } from "@arcjet/next";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import { getValidationErrorMessage } from "@/lib/common/action";
import {
    type GenerationActionStatus,
    mapGenerationFailure,
} from "@/lib/session/error";
import {
    type CollectionDescriptionRequest,
    CollectionDescriptionRequestSchema,
    type DescriptionRequest,
    SectionDescriptionRequestSchema,
} from "./schema";
import {
    generateCollectionDescription,
    generateCollectionSummary,
    SECTION_DESCRIPTION_FALLBACK_TEXT,
} from "./service";

export type SectionDescriptionResult =
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

    const actor = await requireActionUserId(
        "Sign in again to generate an overview."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await generateCollectionSummary({
            expanded: parsed.data.expanded ?? false,
            items: parsed.data.items,
            request: await getArcjetRequest(),
            sectionTitle: parsed.data.sectionTitle,
            userId: actor.userId,
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

    const actor = await requireActionUserId(
        "Sign in again to generate a collection description."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await generateCollectionDescription({
            collectionTitle: parsed.data.title,
            request: await getArcjetRequest(),
            userId: actor.userId,
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
