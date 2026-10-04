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
    THREAD_STANDALONE_MARKDOWN_MAX_LENGTH,
    THREAD_STANDALONE_PROMPT_MAX_LENGTH,
} from "./constants";
import { ThreadError } from "./error";
import * as service from "./service";

const log = createLogger("threads:actions");

const SET_THREAD_ARCHIVED_INPUT_SCHEMA = z.object({
    isArchived: z.boolean(),
    threadId: z.string().trim().min(1, "Choose a chat."),
});

type SetThreadArchivedResult =
    | { status: typeof ACTION_STATUS.UPDATED }
    | {
          message: string;
          status:
              | typeof ACTION_STATUS.ERROR
              | typeof ACTION_STATUS.INVALID
              | typeof ACTION_STATUS.NOT_FOUND
              | typeof ACTION_STATUS.UNAUTHORIZED;
      };

export async function setThreadArchived(input: {
    isArchived: boolean;
    threadId: string;
}): Promise<SetThreadArchivedResult> {
    const parsed = SET_THREAD_ARCHIVED_INPUT_SCHEMA.safeParse(input);
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
        await service.setThreadArchived({
            isArchived: parsed.data.isArchived,
            threadId: parsed.data.threadId,
            userId: auth.userId,
        });

        return { status: ACTION_STATUS.UPDATED };
    } catch (error) {
        return handleActionError({
            codeToStatus: { not_found: ACTION_STATUS.NOT_FOUND },
            error,
            errorFactory: ThreadError,
            fallbackMessage: parsed.data.isArchived
                ? "We couldn't archive this chat right now."
                : "We couldn't unarchive this chat right now.",
            log,
        });
    }
}

const DELETE_THREAD_INPUT_SCHEMA = z.object({
    threadId: z.string().trim().min(1, "Choose a chat."),
});

type DeleteThreadResult =
    | { status: typeof ACTION_STATUS.DELETED }
    | {
          message: string;
          status:
              | typeof ACTION_STATUS.ERROR
              | typeof ACTION_STATUS.INVALID
              | typeof ACTION_STATUS.NOT_FOUND
              | typeof ACTION_STATUS.UNAUTHORIZED;
      };

export async function deleteThread(input: {
    threadId: string;
}): Promise<DeleteThreadResult> {
    const parsed = DELETE_THREAD_INPUT_SCHEMA.safeParse(input);
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
        await service.deleteThread({
            threadId: parsed.data.threadId,
            userId: auth.userId,
        });

        return { status: ACTION_STATUS.DELETED };
    } catch (error) {
        return handleActionError({
            codeToStatus: { not_found: ACTION_STATUS.NOT_FOUND },
            error,
            errorFactory: ThreadError,
            fallbackMessage: "We couldn't delete this chat right now.",
            log,
        });
    }
}

const CREATE_THREAD_FROM_ASSISTANT_INPUT_SCHEMA = z.object({
    markdown: z
        .string()
        .trim()
        .min(1, "There is no Ask Cache answer to continue.")
        .max(
            THREAD_STANDALONE_MARKDOWN_MAX_LENGTH,
            "This answer is too long to continue in chat."
        ),
    prompt: z
        .string()
        .trim()
        .min(1, "Enter a valid prompt to continue in chat.")
        .max(
            THREAD_STANDALONE_PROMPT_MAX_LENGTH,
            "This prompt is too long to continue in chat."
        ),
});

type CreateThreadFromAssistantResult =
    | { status: typeof ACTION_STATUS.CREATED; threadId: string }
    | {
          message: string;
          status:
              | typeof ACTION_STATUS.ERROR
              | typeof ACTION_STATUS.INVALID
              | typeof ACTION_STATUS.UNAUTHORIZED;
      };

export async function createThreadFromAssistant(input: {
    markdown: string;
    prompt: string;
}): Promise<CreateThreadFromAssistantResult> {
    const parsed = CREATE_THREAD_FROM_ASSISTANT_INPUT_SCHEMA.safeParse(input);
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
        const thread = await service.createStandaloneThread({
            markdown: parsed.data.markdown,
            prompt: parsed.data.prompt,
            userId: auth.userId,
        });

        return { status: ACTION_STATUS.CREATED, threadId: thread.id };
    } catch (error) {
        return handleActionError({
            codeToStatus: { invalid_input: ACTION_STATUS.INVALID },
            error,
            errorFactory: ThreadError,
            fallbackMessage: "We couldn't start this chat right now.",
            log,
        });
    }
}
