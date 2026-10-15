import { serverEnv } from "@/env/server";
import { GOOGLE_PHOTOS_PICKER_SCOPE } from "@/lib/integrations/google-photos/shared";

function requireGoogleEnv(
    name: "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET"
): string {
    const value = serverEnv[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const GOOGLE_CLIENT_ID = requireGoogleEnv("GOOGLE_CLIENT_ID");

export const GOOGLE_CLIENT_SECRET = requireGoogleEnv("GOOGLE_CLIENT_SECRET");

export const GOOGLE_SOCIAL_PROVIDER = {
    accessType: "offline" as const,
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    prompt: "select_account consent" as const,
    scope: ["openid", "email", "profile", GOOGLE_PHOTOS_PICKER_SCOPE],
};
