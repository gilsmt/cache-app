import type { GenericOAuthConfig } from "better-auth/plugins";
import * as z from "zod";
import { serverEnv } from "@/env/server";
import { APP_NAME } from "@/lib/common/constants";
import { NOTION_API_VERSION } from "@/lib/integrations/notion/api";
import { REDDIT_USER_AGENT } from "@/lib/integrations/reddit/api";
import { buildIntegrationOAuthConfig } from "./oauth";

/**
 * Notion publishes no `expires_in`, so better-auth cannot age the stored token
 * and never refreshes it. Notion does not publish a lifetime either, so this
 * stays a deliberate underestimate: a needless refresh costs one request, while
 * an overestimate leaves users with a dead connection until they reconnect.
 */
const NOTION_ACCESS_TOKEN_EXPIRES_IN_SECONDS = 30 * 60;

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

/**
 * `/v1/users/me` returns the connection's bot. The authorizing person — the
 * identity that must stay unique per Cache user — sits at `bot.owner.user`.
 */
const NotionUserSchema = z.object({
    bot: z.object({
        owner: z.object({
            user: z.object({
                avatar_url: z.string().nullable().optional(),
                id: z.string(),
                name: z.string().nullable().optional(),
            }),
        }),
    }),
});

/**
 * `/api/v1/me` returns the authorizing Reddit account. `has_verified_email`
 * is ignored: linking uses the account id as the subject, and better-auth
 * mints a placeholder email so account linking stays keyed on that id.
 */
const RedditUserAccountSchema = z.object({
    icon_img: z.string().nullable().optional(),
    id: z.string(),
    name: z.string(),
});

export const genericOAuthConfig = [
    buildIntegrationOAuthConfig({
        authentication: "basic",
        authorizationUrl: "https://www.pinterest.com/oauth/",
        clientId: serverEnv.PINTEREST_CLIENT_ID,
        clientSecret: serverEnv.PINTEREST_CLIENT_SECRET,
        mapUser: (data) => {
            const id = data.id;
            if (!id) {
                return null;
            }
            return {
                id,
                image: data.profile_image ?? undefined,
                name: data.username ?? id,
            };
        },
        providerId: "pinterest",
        schema: PinterestUserAccountSchema,
        scopes: ["user_accounts:read", "boards:read", "pins:read"],
        tokenUrl: "https://api.pinterest.com/v5/oauth/token",
        userInfoUrl: "https://api.pinterest.com/v5/user_account",
    }),
    buildIntegrationOAuthConfig({
        // Reddit requires a descriptive User-Agent on both the token and the
        // userinfo endpoints, so the built-in provider (which hardcodes
        // "better-auth") is not used.
        authentication: "basic",
        authorizationHeaders: {
            "User-Agent": REDDIT_USER_AGENT,
        },
        authorizationUrl: "https://www.reddit.com/api/v1/authorize",
        // A permanent duration makes Reddit issue a refresh token, without
        // which saved items stop being readable after the hour-long access
        // token expires.
        authorizationUrlParams: {
            duration: "permanent",
        },
        clientId: serverEnv.REDDIT_CLIENT_ID,
        clientSecret: serverEnv.REDDIT_CLIENT_SECRET,
        extraHeaders: {
            "User-Agent": REDDIT_USER_AGENT,
        },
        mapUser: (data) => ({
            id: data.id,
            image: data.icon_img?.split("?")[0],
            name: data.name,
        }),
        providerId: "reddit",
        schema: RedditUserAccountSchema,
        // `history` governs /user/{username}/saved. It cannot be isolated
        // from the rest of Reddit's history listings.
        scopes: ["identity", "history"],
        tokenUrl: "https://www.reddit.com/api/v1/access_token",
        userInfoUrl: "https://oauth.reddit.com/api/v1/me",
    }),
    buildIntegrationOAuthConfig({
        authentication: "basic",
        authorizationUrl: "https://x.com/i/oauth2/authorize",
        clientId: serverEnv.X_CLIENT_ID,
        clientSecret: serverEnv.X_CLIENT_SECRET,
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
        providerId: "x",
        schema: XUserAccountSchema,
        scopes: ["bookmark.read", "offline.access", "tweet.read", "users.read"],
        tokenUrl: "https://api.x.com/2/oauth2/token",
        userInfoUrl:
            "https://api.x.com/2/users/me?user.fields=profile_image_url",
    }),
    buildIntegrationOAuthConfig({
        // GitHub reads the client credentials from the request body, so the
        // default `post` method applies and Basic auth must not be requested.
        authentication: "post",
        authorizationUrl: "https://github.com/login/oauth/authorize",
        clientId: serverEnv.GITHUB_CLIENT_ID,
        clientSecret: serverEnv.GITHUB_CLIENT_SECRET,
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
        scopes: ["read:user"],
        tokenUrl: "https://github.com/login/oauth/access_token",
        userInfoUrl: "https://api.github.com/user",
    }),
    buildIntegrationOAuthConfig({
        accessTokenExpiresIn: NOTION_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
        authentication: "basic",
        authorizationHeaders: {
            "Notion-Version": NOTION_API_VERSION,
        },
        authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
        authorizationUrlParams: {
            owner: "user",
        },
        clientId: serverEnv.NOTION_CLIENT_ID,
        clientSecret: serverEnv.NOTION_CLIENT_SECRET,
        extraHeaders: {
            "Notion-Version": NOTION_API_VERSION,
        },
        mapUser: (data) => {
            const { user } = data.bot.owner;
            return {
                id: user.id,
                image: user.avatar_url ?? undefined,
                name: user.name ?? undefined,
            };
        },
        providerId: "notion",
        schema: NotionUserSchema,
        tokenUrl: "https://api.notion.com/v1/oauth/token",
        userInfoUrl: "https://api.notion.com/v1/users/me",
    }),
].filter((config): config is GenericOAuthConfig => config !== null);
