import { z } from "zod";
import { authClient } from "@/lib/auth/client";
import { createLogger } from "@/lib/common/logs/console/logger";

const GOOGLE_CREDENTIAL_SCHEMA = z.object({ credential: z.string().min(1) });
const GOOGLE_IDENTITY_SCHEMA = z.object({
    accounts: z.object({
        id: z.object({
            cancel: z.custom<() => void>(
                (value) => typeof value === "function"
            ),
            initialize: z.custom<(options: GoogleOneTapOptions) => void>(
                (value) => typeof value === "function"
            ),
            prompt: z.custom<() => void>(
                (value) => typeof value === "function"
            ),
        }),
    }),
});

interface GoogleOneTapOptions {
    callback: (response: unknown) => void;
    client_id: string;
    itp_support: boolean;
}

const log = createLogger("auth:one-tap");

export function startGoogleOneTap(
    google: unknown,
    clientId: string
): () => void {
    const identity = GOOGLE_IDENTITY_SCHEMA.parse(google).accounts.id;
    const controller = new AbortController();
    let isSubmitting = false;

    const cancel = () => {
        controller.abort();
        identity.cancel();
    };

    const handleCredential = async (response: unknown) => {
        if (controller.signal.aborted || isSubmitting) {
            return;
        }

        isSubmitting = true;

        try {
            const { credential } = GOOGLE_CREDENTIAL_SCHEMA.parse(response);
            const result = await authClient.$fetch("/one-tap/callback", {
                body: { callbackURL: "/library", idToken: credential },
                method: "POST",
                signal: controller.signal,
            });

            if (controller.signal.aborted) {
                return;
            }

            if (result.error) {
                log.error("Google One Tap sign-in failed", result.error);
                return;
            }

            window.location.assign("/library");
        } catch (error) {
            if (!controller.signal.aborted) {
                log.error("Google One Tap sign-in failed", error);
            }
        }
    };

    try {
        identity.initialize({
            callback: handleCredential,
            client_id: clientId,
            itp_support: true,
        });
        identity.prompt();
    } catch (error) {
        cancel();
        throw error;
    }

    return cancel;
}
