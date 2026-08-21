"use server";

import * as z from "zod";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import { extractNamedErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    hasLinkedProviderAccount,
    resolveProviderAccountAccessToken,
} from "@/lib/integrations/account";
import {
    IntegrationApiError,
    IntegrationUserError,
} from "@/lib/integrations/error";
import {
    sendCollectionToNotion as sendCollectionToNotionService,
    sendNoteToNotion as sendNoteToNotionService,
} from "@/lib/integrations/notion/service";

const log = createLogger("integrations:notion:actions");

const NOTION_PROVIDER_ID = "notion";
const NOTE_CONTENT_HTML_MAX_LENGTH = 100_000;
const NOTE_TITLE_MAX_LENGTH = 120;

const SendCollectionToNotionInputSchema = z.object({
    collectionId: z.string().trim().min(1),
});

const SendNoteToNotionInputSchema = z.object({
    contentHtml: z.string().max(NOTE_CONTENT_HTML_MAX_LENGTH),
    title: z.string().trim().min(1).max(NOTE_TITLE_MAX_LENGTH),
});

export type NotionSendResult =
    | {
          pageUrl: string;
          status: "SUCCESS";
      }
    | {
          message: string;
          status:
              | "ERROR"
              | "INVALID"
              | "NOT_CONNECTED"
              | "NOT_FOUND"
              | "UNAUTHORIZED";
      };

export async function sendCollectionToNotion(input: {
    collectionId: string;
}): Promise<NotionSendResult> {
    const parsed = SendCollectionToNotionInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message:
                parsed.error.issues[0]?.message ??
                "Choose a collection to send to Notion.",
            status: "INVALID",
        };
    }

    return await sendToNotion(async ({ accessToken, userId }) =>
        sendCollectionToNotionService({
            accessToken,
            collectionId: parsed.data.collectionId,
            userId,
        })
    );
}

export async function sendNoteToNotion(input: {
    contentHtml: string;
    title: string;
}): Promise<NotionSendResult> {
    const parsed = SendNoteToNotionInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message:
                parsed.error.issues[0]?.message ??
                "Choose a note to send to Notion.",
            status: "INVALID",
        };
    }

    return await sendToNotion(async ({ accessToken, userId }) =>
        sendNoteToNotionService({
            accessToken,
            contentHtml: parsed.data.contentHtml,
            title: parsed.data.title,
            userId,
        })
    );
}

async function sendToNotion(
    fn: (args: { accessToken: string; userId: string }) => Promise<{
        pageUrl: string;
    }>
): Promise<NotionSendResult> {
    const auth = await requireActionUserId("Sign in again to send to Notion.");
    if (isUnauthenticated(auth)) {
        return auth;
    }

    if (
        !(await hasLinkedProviderAccount({
            providerId: NOTION_PROVIDER_ID,
            userId: auth.userId,
        }))
    ) {
        return {
            message: "Connect Notion before sending content there.",
            status: "NOT_CONNECTED",
        };
    }

    const accessToken = await resolveProviderAccountAccessToken({
        providerId: NOTION_PROVIDER_ID,
        userId: auth.userId,
    });
    if (!accessToken) {
        return {
            message: "Reconnect Notion before sending content there.",
            status: "NOT_CONNECTED",
        };
    }

    try {
        const result = await fn({ accessToken, userId: auth.userId });
        return {
            pageUrl: result.pageUrl,
            status: "SUCCESS",
        };
    } catch (error) {
        const details = extractNamedErrorMessage(error);

        if (IntegrationUserError.isInstance(error)) {
            return {
                message: details.message,
                status:
                    error.data.resource === "collection"
                        ? "NOT_FOUND"
                        : "INVALID",
            };
        }

        if (IntegrationApiError.isInstance(error)) {
            log.error("Notion API send failure", {
                error,
                userId: auth.userId,
            });
            return {
                message: details.message,
                status: "ERROR",
            };
        }

        log.error("Unexpected Notion send failure", {
            error,
            userId: auth.userId,
        });
        return {
            message: "We couldn't send this to Notion right now.",
            status: "ERROR",
        };
    }
}
