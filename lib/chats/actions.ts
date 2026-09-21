"use server";

import * as z from "zod";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import {
    getValidationErrorMessage,
    handleActionError,
} from "@/lib/common/action";
import { createLogger } from "@/lib/common/logs/console/logger";
import { ChatError } from "./error";
import * as service from "./service";

const log = createLogger("chats:actions");

const STATUS_MAP = {
    invalid_run_state: "INVALID",
    not_found: "NOT_FOUND",
} as const;

const ChatRunIdInputSchema = z.object({
    runId: z.string().trim().min(1),
});

export async function getOrCreateChatForAutomationRun(input: {
    runId: string;
}) {
    const parsed = ChatRunIdInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(parsed, "Choose a run."),
            status: "INVALID" as const,
        };
    }

    const auth = await requireActionUserId("Sign in again to open chats.");
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        return {
            chatId: (
                await service.ensureChatForAutomationRun({
                    runId: parsed.data.runId,
                    userId: auth.userId,
                })
            ).id,
            status: "SUCCESS" as const,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: STATUS_MAP,
            error,
            errorFactory: ChatError,
            fallbackMessage: "We couldn't open this chat.",
            log,
        });
    }
}
