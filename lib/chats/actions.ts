"use server";

import * as z from "zod";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import {
    getValidationErrorMessage,
    handleActionError,
} from "@/lib/common/action";
import { ACTION_STATUS } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    CHAT_STANDALONE_MARKDOWN_MAX_LENGTH,
    CHAT_STANDALONE_PROMPT_MAX_LENGTH,
} from "./constants";
import { ChatError } from "./error";
import * as service from "./service";

const log = createLogger("chats:actions");

const SET_CHAT_ARCHIVED_INPUT_SCHEMA = z.object({
    chatId: z.string().trim().min(1, "Choose a chat."),
    isArchived: z.boolean(),
});

type SetChatArchivedResult =
    | { status: typeof ACTION_STATUS.UPDATED }
    | {
          message: string;
          status:
              | typeof ACTION_STATUS.ERROR
              | typeof ACTION_STATUS.INVALID
              | typeof ACTION_STATUS.NOT_FOUND
              | typeof ACTION_STATUS.UNAUTHORIZED;
      };

export async function setChatArchived(input: {
    chatId: string;
    isArchived: boolean;
}): Promise<SetChatArchivedResult> {
    const parsed = SET_CHAT_ARCHIVED_INPUT_SCHEMA.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(parsed, "Choose a chat."),
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId("Sign in again to manage chats.");
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        await service.setChatArchived({
            chatId: parsed.data.chatId,
            isArchived: parsed.data.isArchived,
            userId: auth.userId,
        });

        return { status: ACTION_STATUS.UPDATED };
    } catch (error) {
        return handleActionError({
            codeToStatus: { not_found: ACTION_STATUS.NOT_FOUND },
            error,
            errorFactory: ChatError,
            fallbackMessage: parsed.data.isArchived
                ? "We couldn't archive this chat right now."
                : "We couldn't unarchive this chat right now.",
            log,
        });
    }
}

const CREATE_CHAT_FROM_ASK_CACHE_INPUT_SCHEMA = z.object({
    markdown: z
        .string()
        .trim()
        .min(1, "There is no Ask Cache answer to continue.")
        .max(
            CHAT_STANDALONE_MARKDOWN_MAX_LENGTH,
            "This answer is too long to continue in chat."
        ),
    prompt: z
        .string()
        .trim()
        .min(1, "Enter a valid prompt to continue in chat.")
        .max(
            CHAT_STANDALONE_PROMPT_MAX_LENGTH,
            "This prompt is too long to continue in chat."
        ),
});

type CreateChatFromAskCacheResult =
    | { chatId: string; status: typeof ACTION_STATUS.CREATED }
    | {
          message: string;
          status:
              | typeof ACTION_STATUS.ERROR
              | typeof ACTION_STATUS.INVALID
              | typeof ACTION_STATUS.UNAUTHORIZED;
      };

export async function createChatFromAskCache(input: {
    markdown: string;
    prompt: string;
}): Promise<CreateChatFromAskCacheResult> {
    const parsed = CREATE_CHAT_FROM_ASK_CACHE_INPUT_SCHEMA.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter a valid Ask Cache answer."
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to continue in chat."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const chat = await service.createStandaloneChat({
            markdown: parsed.data.markdown,
            prompt: parsed.data.prompt,
            userId: auth.userId,
        });

        return { chatId: chat.id, status: ACTION_STATUS.CREATED };
    } catch (error) {
        return handleActionError({
            codeToStatus: { invalid_input: ACTION_STATUS.INVALID },
            error,
            errorFactory: ChatError,
            fallbackMessage: "We couldn't start this chat right now.",
            log,
        });
    }
}
