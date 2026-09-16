import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import { stripe } from "@better-auth/stripe";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import type {
    GenericOAuthConfig,
    GenericOAuthUserInfo,
} from "better-auth/plugins";
import { genericOAuth, multiSession, oneTap } from "better-auth/plugins";
import * as z from "zod";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/billing/client";
import { getPlanPriceIds } from "@/lib/billing/prices";
import { APP_NAME, BASE_URL, CACHE_EXTENSION_ID } from "@/lib/common/constants";
import { getErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import { fetchWithTimeout } from "@/lib/common/timeout";
import { tryParseUrl } from "@/lib/common/url";
import { GOOGLE_PHOTOS_PICKER_SCOPE } from "@/lib/integrations/google-photos/shared";
import { NOTION_API_VERSION } from "@/lib/integrations/notion/api";
import { prisma } from "@/prisma";
import { i18nPlugin } from "./i18n";

const log = createLogger("Auth:server");

const BASE_AUTH_URL = process.env.BETTER_AUTH_URL ?? BASE_URL;

/** Chrome Web Store extension IDs are 32 chars from a–p. */
const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/;

function isChromeExtensionId(value: string): boolean {
    return CHROME_EXTENSION_ID_PATTERN.test(value);
}

/**
 * better-auth matches non-http(s) origins with startsWith. Reject short or
 * wildcard values so a mis-set env cannot trust every chrome-extension origin.
 */
function isExactTrustedOrigin(origin: string): boolean {
    const parsed = tryParseUrl(origin);
    if (!parsed) {
        return false;
    }
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return origin === parsed.origin;
    }
    if (parsed.protocol === "chrome-extension:") {
        return (
            (parsed.pathname === "" || parsed.pathname === "/") &&
            parsed.search === "" &&
            parsed.hash === "" &&
            isChromeExtensionId(parsed.hostname)
        );
    }
    return false;
}

function resolveChromeExtensionId(): string {
    const override = process.env.CACHE_EXTENSION_ID?.trim();
    if (!override) {
        return CACHE_EXTENSION_ID;
    }
    if (isChromeExtensionId(override)) {
        return override;
    }
    log.warn("Ignoring invalid CACHE_EXTENSION_ID override", {
        length: override.length,
    });
    return CACHE_EXTENSION_ID;
}

const EXTENSION_ID = resolveChromeExtensionId();

const ENV_TRUSTED_ORIGINS = (process.env.TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .filter((origin) => {
        if (isExactTrustedOrigin(origin)) {
            return true;
        }
        log.warn("Ignoring invalid TRUSTED_ORIGINS entry", { origin });
        return false;
    });

const TRUSTED_ORIGINS = [
    BASE_AUTH_URL,
    `chrome-extension://${EXTENSION_ID}`,
    ...ENV_TRUSTED_ORIGINS,
];

const SESSION_COOKIE_CACHE_MAX_AGE_SECONDS = 24 * 60 * 60;
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30;
const SESSION_FRESH_AGE_SECONDS = 60 * 60;
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24;

const OAUTH_USER_FETCH_TIMEOUT_MS = 10_000;

function requiredEnv(name: string): string {
    const value = process.env[name];
    if (value === undefined || value === "") {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function optionalEnv(name: string): string | null {
    const value = process.env[name];
    return value === undefined || value === "" ? null : value;
}

const GOOGLE_CLIENT_ID = requiredEnv("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = requiredEnv("GOOGLE_CLIENT_SECRET");

interface OAuthUserProfile {
    email: string;
    emailVerified: boolean;
    id: string;
    image?: string;
    name?: string;
    [key: string]: unknown;
}

function integrationPlaceholderEmail(providerId: string, id: string): string {
    return `${providerId}.${id}.integration@placeholder.cache`;
}

function oauthCredentials(
    envPrefix: string
): { clientId: string; clientSecret: string } | null {
    const clientId = optionalEnv(`${envPrefix}_CLIENT_ID`);
    const clientSecret = optionalEnv(`${envPrefix}_CLIENT_SECRET`);
    return clientId && clientSecret ? { clientId, clientSecret } : null;
}

async function fetchOAuthUser<T>(
    tokens: OAuth2Tokens,
    providerId: string,
    url: string,
    schema: z.ZodType<T>,
    mapUser: (data: T) => OAuthUserProfile | null,
    extraHeaders: Record<string, string> = {}
): Promise<GenericOAuthUserInfo | null> {
    if (!tokens.accessToken) {
        return null;
    }

    try {
        const response = await fetchWithTimeout(
            url,
            {
                headers: {
                    Authorization: `Bearer ${tokens.accessToken}`,
                    ...extraHeaders,
                },
            },
            OAUTH_USER_FETCH_TIMEOUT_MS
        );
        if (!response.ok) {
            log.warn(`OAuth user fetch failed for ${providerId}`, {
                status: response.status,
                statusText: response.statusText,
                url,
            });
            return null;
        }

        const payload = await response.json().catch(() => null);
        if (payload === null) {
            log.warn(`OAuth user info empty/non-JSON for ${providerId}`, {
                url,
            });
            return null;
        }

        const parseResult = schema.safeParse(payload);
        if (!parseResult.success) {
            log.warn(`OAuth user info parse failed for ${providerId}`, {
                url,
            });
            return null;
        }

        return mapUser(parseResult.data);
    } catch (error) {
        log.error(`OAuth user fetch error for ${providerId}`, {
            error: getErrorMessage(error),
            url,
        });
        return null;
    }
}

interface IntegrationOAuthDef<T> {
    authorizationHeaders?: Record<string, string>;
    authorizationUrl: string;
    authorizationUrlParams?: Record<string, string>;
    envPrefix: string;
    extraHeaders?: Record<string, string>;
    mapUser: (data: T) => { id: string; image?: string; name?: string } | null;
    pkce?: boolean;
    providerId: string;
    schema: z.ZodType<T>;
    scopes?: string[];
    tokenUrl: string;
    userInfoUrl: string;
}

function buildIntegrationOAuthConfig<T>(
    def: IntegrationOAuthDef<T>
): GenericOAuthConfig | null {
    const creds = oauthCredentials(def.envPrefix);
    if (!creds) {
        return null;
    }

    return {
        authentication: "basic",
        authorizationHeaders: def.authorizationHeaders,
        authorizationUrl: def.authorizationUrl,
        authorizationUrlParams: def.authorizationUrlParams,
        ...creds,
        disableSignUp: true,
        getUserInfo: (tokens) =>
            fetchOAuthUser(
                tokens,
                def.providerId,
                def.userInfoUrl,
                def.schema,
                (data) => {
                    const profile = def.mapUser(data);
                    if (!profile) {
                        return null;
                    }
                    return {
                        ...profile,
                        email: integrationPlaceholderEmail(
                            def.providerId,
                            profile.id
                        ),
                        emailVerified: false,
                    };
                },
                def.extraHeaders
            ),
        pkce: def.pkce,
        providerId: def.providerId,
        scopes: def.scopes,
        tokenUrl: def.tokenUrl,
    };
}

const PinterestUserAccountSchema = z.object({
    id: z.string().optional(),
    profile_image: z.string().nullable().optional(),
    username: z.string().optional(),
});

const XUserAccountSchema = z.object({
    data: z
        .object({
            id: z.string().optional(),
            name: z.string().optional(),
            profile_image_url: z.string().optional(),
            username: z.string().optional(),
        })
        .optional(),
});

const GitHubUserAccountSchema = z.object({
    avatar_url: z.string().optional(),
    id: z.number().optional(),
    login: z.string().optional(),
    name: z.string().optional(),
});

const NotionUserSchema = z.object({
    avatar_url: z.string().nullable().optional(),
    id: z.string().optional(),
    name: z.string().nullable().optional(),
});

const genericOAuthConfig = [
    buildIntegrationOAuthConfig({
        authorizationUrl: "https://www.pinterest.com/oauth/",
        envPrefix: "PINTEREST",
        mapUser: (data) => {
            const id = data.id ?? data.username;
            if (!id) {
                return null;
            }
            return {
                id,
                image: data.profile_image ?? undefined,
                name: data.username ?? id,
            };
        },
        pkce: true,
        providerId: "pinterest",
        schema: PinterestUserAccountSchema,
        scopes: ["user_accounts:read", "boards:read", "pins:read"],
        tokenUrl: "https://api.pinterest.com/v5/oauth/token",
        userInfoUrl: "https://api.pinterest.com/v5/user_account",
    }),
    buildIntegrationOAuthConfig({
        authorizationUrl: "https://x.com/i/oauth2/authorize",
        envPrefix: "X",
        extraHeaders: { Accept: "application/json" },
        mapUser: (data) => {
            const id = data.data?.id;
            if (!id) {
                return null;
            }
            return {
                id,
                image: data.data?.profile_image_url,
                name: data.data?.name ?? data.data?.username ?? id,
            };
        },
        pkce: true,
        providerId: "x",
        schema: XUserAccountSchema,
        scopes: ["bookmark.read", "offline.access", "tweet.read", "users.read"],
        tokenUrl: "https://api.twitter.com/2/oauth2/token",
        userInfoUrl:
            "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
    }),
    buildIntegrationOAuthConfig({
        authorizationUrl: "https://github.com/login/oauth/authorize",
        envPrefix: "GITHUB",
        extraHeaders: {
            Accept: "application/vnd.github+json",
            "User-Agent": APP_NAME,
        },
        mapUser: (data) => {
            if (typeof data.id !== "number") {
                return null;
            }
            const id = String(data.id);
            return {
                id,
                image: data.avatar_url,
                name: data.name ?? data.login ?? id,
            };
        },
        providerId: "github",
        schema: GitHubUserAccountSchema,
        scopes: ["read:user", "public_repo"],
        tokenUrl: "https://github.com/login/oauth/access_token",
        userInfoUrl: "https://api.github.com/user",
    }),
    buildIntegrationOAuthConfig({
        authorizationHeaders: {
            "Notion-Version": NOTION_API_VERSION,
        },
        authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
        authorizationUrlParams: {
            owner: "user",
        },
        envPrefix: "NOTION",
        extraHeaders: {
            "Notion-Version": NOTION_API_VERSION,
        },
        mapUser: (data) => {
            if (!data.id) {
                return null;
            }
            return {
                id: data.id,
                image: data.avatar_url ?? undefined,
                name: data.name ?? "Notion",
            };
        },
        providerId: "notion",
        schema: NotionUserSchema,
        tokenUrl: "https://api.notion.com/v1/oauth/token",
        userInfoUrl: "https://api.notion.com/v1/users/me",
    }),
].filter((config): config is GenericOAuthConfig => config !== null);

const trustedProviders = [
    "google",
    ...genericOAuthConfig.map((c) => c.providerId),
];

const planPriceIds = getPlanPriceIds();

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
                    try {
                        const { seedDefaultUserAutomations } = await import(
                            "@/lib/intelligence/automations/service"
                        );
                        await seedDefaultUserAutomations(user.id);
                    } catch (error) {
                        log.error("Failed to seed built-in automations", {
                            error,
                            operation: "seedDefaultUserAutomations",
                            userId: user.id,
                        });
                    }
                },
            },
        },
    },
    plugins: [
        i18nPlugin(),
        multiSession(),
        oneTap({ clientId: GOOGLE_CLIENT_ID }),
        genericOAuth({ config: genericOAuthConfig }),
        stripe({
            createCustomerOnSignUp: true,
            stripeClient: getStripeClient(),
            stripeWebhookSecret: getStripeWebhookSecret(),
            // NOTE: The @better-auth/stripe plugin registers its webhook handler
            // implicitly at /api/auth/stripe/webhook via the catch-all [...all]
            // route in app/api/auth/[...all]/route.ts. Configure the Stripe
            // Dashboard endpoint to exactly: {baseURL}/api/auth/stripe/webhook
            subscription: {
                enabled: true,
                plans: [
                    {
                        annualDiscountPriceId: planPriceIds.yearly,
                        name: "pro",
                        priceId: planPriceIds.monthly,
                    },
                ],
            },
        }),
        nextCookies(),
    ],
    secret: requiredEnv("BETTER_AUTH_SECRET"),
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
        google: {
            accessType: "offline",
            clientId: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
            prompt: "select_account consent",
            scope: ["openid", "email", "profile", GOOGLE_PHOTOS_PICKER_SCOPE],
        },
    },
    trustedOrigins: TRUSTED_ORIGINS,
    user: {
        /**
         * Hard-delete the user row, sessions, and cascading library data
         * when the user explicitly confirms account deletion. OAuth-only
         * sign-in means we rely on `session.freshAge` and the in-product
         * confirmation dialog for authorization instead of a password.
         */
        deleteUser: {
            enabled: true,
        },
    },
});
