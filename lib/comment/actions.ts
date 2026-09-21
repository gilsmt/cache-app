"use server";

import * as z from "zod";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import {
    getValidationErrorMessage,
    handleActionError,
} from "@/lib/common/action";
import { ACTION_STATUS } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { CommentError } from "./error";
import * as service from "./service";
import { COMMENT_TEXT_MAX_LENGTH, normalizeCommentText } from "./utils";

const log = createLogger("comments:actions");

const LibraryItemCommentIdSchema = z.object({
    libraryItemId: z.string().trim().min(1).max(64),
});

const LibraryItemCommentUpdateSchema = z.object({
    contentText: z.string().trim().max(COMMENT_TEXT_MAX_LENGTH),
    itemId: z.string().trim().min(1).max(64),
});

export type CommentActionResult =
    | {
          contentText: string | null;
          status: typeof ACTION_STATUS.SUCCESS;
      }
    | {
          message: string;
          status:
              | typeof ACTION_STATUS.ERROR
              | typeof ACTION_STATUS.INVALID
              | typeof ACTION_STATUS.NOT_FOUND
              | typeof ACTION_STATUS.UNAUTHORIZED;
      };

export async function getLibraryItemComment(
    libraryItemId: string
): Promise<CommentActionResult> {
    const parsed = LibraryItemCommentIdSchema.safeParse({ libraryItemId });
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Select a saved item to load its comment."
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId("Sign in again to load comments.");
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const comment = await service.getCommentForItem({
            itemId: parsed.data.libraryItemId,
            userId: auth.userId,
        });

        return {
            contentText: comment?.contentText ?? null,
            status: ACTION_STATUS.SUCCESS,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: {
                invalid_kind: ACTION_STATUS.INVALID,
                not_found: ACTION_STATUS.NOT_FOUND,
            },
            error,
            errorFactory: CommentError,
            fallbackMessage: "We couldn't load this comment right now.",
            log,
        });
    }
}

export async function updateLibraryItemComment(input: {
    contentText: string;
    itemId: string;
}): Promise<CommentActionResult> {
    const parsed = LibraryItemCommentUpdateSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter a valid comment to save."
            ),
            status: ACTION_STATUS.INVALID,
        };
    }

    const auth = await requireActionUserId("Sign in again to save comments.");
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        await service.saveCommentForItem({
            contentText: parsed.data.contentText,
            itemId: parsed.data.itemId,
            userId: auth.userId,
        });

        return {
            contentText: normalizeCommentText(parsed.data.contentText),
            status: ACTION_STATUS.SUCCESS,
        };
    } catch (error) {
        return handleActionError({
            codeToStatus: {
                invalid_kind: ACTION_STATUS.INVALID,
                not_found: ACTION_STATUS.NOT_FOUND,
                too_long: ACTION_STATUS.INVALID,
            },
            error,
            errorFactory: CommentError,
            fallbackMessage: "We couldn't save this comment right now.",
            log,
        });
    }
}
