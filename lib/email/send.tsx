import "server-only";
import type { EmailAttachment } from "@opencoredev/email-sdk";
import { renderEmail } from "@opencoredev/email-sdk/react";
import type * as React from "react";
import { serverEnv } from "@/env/server";
import { getErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import { buildEmailClient } from "@/lib/email/client";
import { EmailError } from "@/lib/email/error";

const log = createLogger("email:send");

interface SendEmailOptions {
    attachments?: readonly EmailAttachment[];
    body: React.ReactElement;
    cc?: readonly string[];
    from?: string;
    scheduledAt?: Date | string;
    subject: string;
    to: string | string[];
}

export async function sendEmail({
    to,
    subject,
    body,
    from: fromParam,
    cc,
    attachments,
    scheduledAt,
}: SendEmailOptions) {
    const from = fromParam ?? serverEnv.EMAIL_FROM;
    if (!from) {
        throw new EmailError({
            message: "Missing sender email address",
            operation: "sendEmail",
        });
    }

    const sendAt = resolveSendAt(scheduledAt);

    try {
        const { html, text } = await renderEmail(body);
        const email = buildEmailClient();
        await email.send(
            {
                attachments:
                    attachments && attachments.length > 0
                        ? attachments
                        : undefined,
                cc: cc && cc.length > 0 ? cc : undefined,
                from,
                html,
                sendAt,
                subject,
                text,
                to,
            },
            attachments?.length || sendAt
                ? { fallback: { adapters: [] } }
                : undefined
        );
    } catch (error) {
        if (EmailError.isInstance(error)) {
            throw error;
        }
        log.error("Failed to send email", error);
        throw new EmailError(
            {
                message: getErrorMessage(error, "Failed to send email"),
                operation: "sendEmail",
            },
            { cause: error }
        );
    }
}

function resolveSendAt(scheduledAt: Date | string | undefined) {
    if (!scheduledAt) {
        return;
    }
    const sendAt =
        scheduledAt instanceof Date ? scheduledAt : new Date(scheduledAt);
    if (Number.isNaN(sendAt.getTime())) {
        throw new EmailError({
            message: `Invalid scheduledAt: "${String(scheduledAt)}"`,
            operation: "sendEmail",
        });
    }
    return sendAt;
}
