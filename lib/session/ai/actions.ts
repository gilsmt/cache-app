"use server";

import { request as getArcjetRequest } from "@arcjet/next";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import { getValidationErrorMessage } from "@/lib/common/action";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    type GenerationActionStatus,
    mapGenerationFailure,
} from "@/lib/session/error";
import type { AssistantComposerPatch } from "../tool/composer";
import {
    type AgentViewPage,
    type AgentViewPageRequest,
    AgentViewPageRequestSchema,
    type AssistantRequest,
    AssistantRequestSchema,
    resolveAgentViewPage,
} from "../tool/composer";
import { assistantAgent } from "./agents";
import { runAgent } from "./runner";

const log = createLogger("intelligence:assistant");

export type AssistantResult =
    | {
          markdown: string;
          operations: AssistantComposerPatch[];
          status: "SUCCESS";
          view?: AgentViewPage | null;
      }
    | {
          markdown?: string;
          message: string;
          status: GenerationActionStatus;
      };

export async function runAssistant(
    input: AssistantRequest
): Promise<AssistantResult> {
    const parsed = AssistantRequestSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter a valid assistant request."
            ),
            status: "INVALID",
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to use the assistant."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const result = await runAgent({
            agent: assistantAgent,
            input: parsed.data,
            request: await getArcjetRequest(),
            userId: actor.userId,
        });

        return {
            markdown: result.markdown,
            operations: result.state.operations,
            status: "SUCCESS",
            view: result.state.view ?? null,
        };
    } catch (error) {
        const failure = mapGenerationFailure(error, {
            fallbackMessage: "We couldn't ask the assistant right now.",
            logLabel: "run the assistant",
        });

        return failure.status === "ERROR"
            ? {
                  markdown:
                      "The assistant could not complete that request. Please try again.",
                  ...failure,
              }
            : failure;
    }
}

export type AgentViewPageActionResult =
    | {
          itemIds: string[];
          nextOffset: number | null;
          status: "SUCCESS";
          truncated: boolean;
      }
    | {
          message: string;
          status: "ERROR" | "INVALID" | "UNAUTHORIZED";
      };

export async function getAgentViewPage(
    input: AgentViewPageRequest
): Promise<AgentViewPageActionResult> {
    const parsed = AgentViewPageRequestSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter a valid view page request."
            ),
            status: "INVALID",
        };
    }

    const actor = await requireActionUserId(
        "Sign in again to use the assistant."
    );
    if (isUnauthenticated(actor)) {
        return actor;
    }

    try {
        const page = await resolveAgentViewPage({
            offset: parsed.data.offset,
            query: parsed.data.query,
            userId: actor.userId,
        });

        return {
            itemIds: page.itemIds,
            nextOffset: page.nextOffset,
            status: "SUCCESS",
            truncated: page.truncated,
        };
    } catch (error) {
        log.error("Failed to resolve agent view page", error);
        return {
            message: "We couldn't load more results right now.",
            status: "ERROR",
        };
    }
}
