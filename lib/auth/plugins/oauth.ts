import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import type {
    GenericOAuthConfig,
    GenericOAuthUserInfo,
} from "better-auth/plugins";
import type * as z from "zod";
import { getErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import { fetchWithTimeout } from "@/lib/common/timeout";

const log = createLogger("auth:oauth");

const OAUTH_USER_FETCH_TIMEOUT_MS = 10_000;

interface OAuthUserProfile {
    email: string;
    emailVerified: boolean;
    id: string;
    image?: string;
    name?: string;
    [key: string]: unknown;
}

interface IntegrationOAuthDef<T> {
    accessTokenExpiresIn?: number;
    authentication?: "basic" | "post";
    authorizationHeaders?: Record<string, string>;
    authorizationUrl: string;
    authorizationUrlParams?: Record<string, string>;
    clientId?: string;
    clientSecret?: string;
    extraHeaders?: Record<string, string>;
    mapUser: (data: T) => { id: string; image?: string; name?: string } | null;
    providerId: string;
    schema: z.ZodType<T>;
    scopes?: string[];
    tokenUrl: string;
    userInfoUrl: string;
}

function integrationPlaceholderEmail(providerId: string, id: string): string {
    return `${providerId}.${id}.integration@placeholder.invalid`;
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

export function buildIntegrationOAuthConfig<T>(
    def: IntegrationOAuthDef<T>
): GenericOAuthConfig | null {
    if (!(def.clientId && def.clientSecret)) {
        return null;
    }

    return {
        accessTokenExpiresIn: def.accessTokenExpiresIn,
        authentication: def.authentication,
        authorizationHeaders: def.authorizationHeaders,
        authorizationUrl: def.authorizationUrl,
        authorizationUrlParams: def.authorizationUrlParams,
        clientId: def.clientId,
        clientSecret: def.clientSecret,
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
        providerId: def.providerId,
        scopes: def.scopes,
        tokenUrl: def.tokenUrl,
    };
}
