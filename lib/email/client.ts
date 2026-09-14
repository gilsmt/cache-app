import "server-only";
import { createEmailClient, type EmailAdapter } from "@opencoredev/email-sdk";
import { resend } from "@opencoredev/email-sdk/resend";
import { smtp } from "@opencoredev/email-sdk/smtp";
import { serverEnv } from "@/env/server";
import { createLogger } from "@/lib/common/logs/console/logger";
import { EmailError } from "@/lib/email/error";

const log = createLogger("email:client");

const DEFAULT_SMTP_PORT = 587;
const SMTPS_PORT = 465;

function resolveResendApiKey() {
    if (serverEnv.RESEND_API_KEY) {
        return serverEnv.RESEND_API_KEY;
    }
    if (!serverEnv.EMAIL_SERVER_HOST && serverEnv.EMAIL_SERVER_PASSWORD) {
        return serverEnv.EMAIL_SERVER_PASSWORD;
    }
}

function resolveSmtpPort() {
    const raw = serverEnv.EMAIL_SERVER_PORT;
    if (!raw) {
        return DEFAULT_SMTP_PORT;
    }
    const port = Number.parseInt(raw, 10);
    if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
        throw new EmailError({
            message: `Invalid EMAIL_SERVER_PORT: "${raw}"`,
            operation: "buildEmailClient",
        });
    }
    return port;
}

export function buildEmailClient() {
    const resendApiKey = resolveResendApiKey();
    const smtpHost = serverEnv.EMAIL_SERVER_HOST;

    if (!(resendApiKey || smtpHost)) {
        throw new EmailError({
            message:
                "Email is not configured. Set RESEND_API_KEY or EMAIL_SERVER_HOST.",
            operation: "buildEmailClient",
        });
    }

    const adapters: EmailAdapter[] = [];
    if (resendApiKey) {
        adapters.push(resend({ apiKey: resendApiKey }));
    }
    if (smtpHost) {
        const port = resolveSmtpPort();
        const user = serverEnv.EMAIL_SERVER_USER;
        const pass = serverEnv.EMAIL_SERVER_PASSWORD;
        adapters.push(
            smtp({
                auth: user && pass ? { pass, user } : undefined,
                host: smtpHost,
                port,
                secure: port === SMTPS_PORT,
            })
        );
    }

    // Resend stays the default route. SMTP acts as fallback when both exist.
    const defaultAdapter = resendApiKey ? "resend" : "smtp";
    const fallback =
        resendApiKey && smtpHost ? { adapters: ["smtp"] as const } : undefined;

    log.debug("Email client configured", { defaultAdapter, fallback });

    return createEmailClient({
        adapters,
        defaultAdapter,
        ...(fallback ? { fallback } : {}),
        telemetry: false,
    });
}
