import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, multiSession, oneTap } from "better-auth/plugins";
import { serverEnv } from "@/env/server";
import { APP_NAME } from "@/lib/common/constants";
import { listIntegrationAccountProviderIds } from "@/lib/integrations/registry";
import { prisma } from "@/prisma";
import { GOOGLE_CLIENT_ID, GOOGLE_SOCIAL_PROVIDER } from "./plugins/google";
import { i18nPlugin } from "./plugins/i18n";
import {
    genericOAuthConfig,
    INTEGRATION_OAUTH_PROVIDER_IDS,
} from "./plugins/integrations";
import { BASE_AUTH_URL, trustedOrigins } from "./plugins/origins";
import { getStripeAuthPlugin } from "./plugins/stripe";

const trustedProviders = [
    "google",
    ...genericOAuthConfig.map((c) => c.providerId),
];

/**
 * The registry connects an integration through a better-auth provider ID.
 * A provider the auth layer does not know would leave the integration
 * permanently disconnected, so the mismatch fails at boot instead.
 *
 * The check covers the provider IDs the app can authenticate, not the ones
 * with credentials configured: a deployment without the credentials for one
 * provider must still boot.
 */
const knownProviderIds = new Set<string>([
    "google",
    ...Object.values(INTEGRATION_OAUTH_PROVIDER_IDS),
]);

for (const providerId of listIntegrationAccountProviderIds()) {
    if (!knownProviderIds.has(providerId)) {
        throw new Error(
            `Integration provider is unknown to the auth layer: ${providerId}`
        );
    }
}

const stripeAuthPlugin = getStripeAuthPlugin();

export const auth = betterAuth({
    account: {
        accountLinking: {
            allowDifferentEmails: true,
            enabled: true,
            trustedProviders,
        },
    },
    appName: APP_NAME,
    baseURL: BASE_AUTH_URL,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    const { onUserCreated } = await import(
                        "@/lib/accounts/service"
                    );
                    await onUserCreated(user.id);
                },
            },
        },
    },
    plugins: [
        i18nPlugin(),
        multiSession(),
        oneTap({ clientId: GOOGLE_CLIENT_ID }),
        genericOAuth({ config: genericOAuthConfig }),
        ...(stripeAuthPlugin ? [stripeAuthPlugin] : []),
        nextCookies(),
    ],
    secret: serverEnv.BETTER_AUTH_SECRET,
    session: {
        cookieCache: {
            enabled: true,
            maxAge: 24 * 60 * 60,
        },
        expiresIn: 60 * 60 * 24 * 30,
        freshAge: 60 * 60,
        updateAge: 60 * 60 * 24,
    },
    socialProviders: {
        google: GOOGLE_SOCIAL_PROVIDER,
    },
    trustedOrigins,
    user: {
        /**
         * Hard-delete the user row, sessions, and cascading library data
         * when the user explicitly confirms account deletion. OAuth-only
         * sign-in means we rely on `session.freshAge` and the in-product
         * confirmation dialog for authorization instead of a password.
         */
        deleteUser: {
            beforeDelete: async (user) => {
                const { prepareUserDeletion } = await import(
                    "@/lib/accounts/service"
                );
                await prepareUserDeletion(user.id);
            },
            enabled: true,
        },
    },
});
