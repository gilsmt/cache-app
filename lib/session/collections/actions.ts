"use server";

import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import type { CollectionTemplateOption } from "@/lib/collections/templates";
import { createLogger } from "@/lib/common/logs/console/logger";
import { getCollectionSuggestions as getCollectionSuggestionsService } from "./suggestions";

const log = createLogger("intelligence:smart-collections:actions");

const SUGGESTIONS_ERROR_MESSAGE =
    "We couldn't load collection suggestions right now.";

export type CollectionSuggestionsResult =
    | {
          suggestions: CollectionTemplateOption[];
          status: "SUCCESS";
      }
    | {
          message: string;
          status: "ERROR" | "INVALID" | "UNAUTHORIZED";
      };

export async function getCollectionSuggestions(): Promise<CollectionSuggestionsResult> {
    const actor = await requireActionUserId(
        "Sign in again to view collection suggestions."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const suggestions = await getCollectionSuggestionsService({
            userId: actor.userId,
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
