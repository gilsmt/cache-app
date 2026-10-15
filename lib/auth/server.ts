import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth, multiSession, oneTap } from "better-auth/plugins";
import { serverEnv } from "@/env/server";
import { APP_NAME } from "@/lib/common/constants";
import { prisma } from "@/prisma";
import { GOOGLE_CLIENT_ID, GOOGLE_SOCIAL_PROVIDER } from "./plugins/google";
import { i18nPlugin } from "./plugins/i18n";
import { genericOAuthConfig } from "./plugins/integrations";
import { BASE_AUTH_URL, trustedOrigins } from "./plugins/origins";
import { getStripeAuthPlugin } from "./plugins/stripe";

const SESSION_COOKIE_CACHE_MAX_AGE_SECONDS = 24 * 60 * 60;
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
const SESSION_FRESH_AGE_SECONDS = 60 * 60;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

const trustedProviders = [
    "google",
    ...genericOAuthConfig.map((c) => c.providerId),
];

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
            maxAge: SESSION_COOKIE_CACHE_MAX_AGE_SECONDS,
        },
        expiresIn: SESSION_EXPIRES_IN_SECONDS,
        freshAge: SESSION_FRESH_AGE_SECONDS,
        updateAge: SESSION_UPDATE_AGE_SECONDS,
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
