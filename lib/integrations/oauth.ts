import "server-only";

import { requireRouteUserId } from "@/lib/auth/session";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    hasLinkedProviderAccount,
    resolveProviderAccountAccessToken,
} from "@/lib/integrations/account";
import {
    IntegrationApiError,
    IntegrationConnectionError,
} from "@/lib/integrations/error";
import type { IntegrationId } from "@/lib/integrations/registry";
import { scheduleSmartCollections } from "@/lib/intelligence/collections/schedule";

const log = createLogger("integrations:oauth-import");

interface OAuthImportResult<T> {
    response: Omit<T, "smartCollectionItemIds">;
    smartCollectionItemIds: string[];
}

/**
 * Resolves a linked provider account, fetches an access token, and runs
 * the provider-specific import.
 *
 * Every linked account for the provider is tried, so a user with multiple
 * linked accounts (e.g. two Google accounts via accountLinking) is served by
 * whichever holds a usable token instead of an arbitrarily pinned row.
 *
 * Throws `IntegrationConnectionError` with `code: "not_connected"` when the
 * user has no linked account, and `code: "token_missing"` when an account
 * is linked but no access token can be issued. Provider-specific HTTP
 * failures (`IntegrationApiError`) and any other error from `importFn`
 * propagate unchanged so the transport layer can map them.
 */
export async function runOAuthImportService<
    T extends {
        smartCollectionItemIds: string[];
    },
>(args: {
    importFn: (args: { accessToken: string; userId: string }) => Promise<T>;
    providerId: IntegrationId;
    userId: string;
}): Promise<OAuthImportResult<T>> {
    if (!(await hasLinkedProviderAccount(args))) {
        throw new IntegrationConnectionError({
            code: "not_connected",
            integrationId: args.providerId,
            message: "Provider account is not connected.",
            operation: "runOAuthImportService",
        });
    }

    const accessToken = await resolveProviderAccountAccessToken({
        providerId: args.providerId,
        userId: args.userId,
    });
    if (!accessToken) {
        throw new IntegrationConnectionError({
            code: "token_missing",
            integrationId: args.providerId,
            message: "Provider access token is unavailable.",
            operation: "runOAuthImportService",
        });
    }

    const { smartCollectionItemIds, ...response } = await args.importFn({
        accessToken,
        userId: args.userId,
    });

    return {
        response,
        smartCollectionItemIds,
    };
}

interface OAuthImportMessages {
    apiError: (error: IntegrationApiError) => string;
    genericError: string;
    noToken: string;
    notConnected: string;
}

interface OAuthImportConfig<T extends { smartCollectionItemIds: string[] }> {
    importFn: (args: { accessToken: string; userId: string }) => Promise<T>;
    messages: OAuthImportMessages;
    providerId: IntegrationId;
}

/**
 * Route adapter for OAuth-based integration imports.
 *
 * Domain failures are kept in the service; this layer is the only place
 * that touches `Request`/`Response` and the session helper.
 */
export async function runOAuthImport<
    T extends {
        smartCollectionItemIds: string[];
    },
>(config: OAuthImportConfig<T>): Promise<Response> {
    const sessionResult = await requireRouteUserId();
    if (sessionResult instanceof Response) {
        return sessionResult;
    }
    const { userId } = sessionResult;

    try {
        const { response, smartCollectionItemIds } =
            await runOAuthImportService({
                importFn: config.importFn,
                providerId: config.providerId,
                userId,
            });
        scheduleSmartCollections(userId, smartCollectionItemIds);
        return Response.json(response);
    } catch (error) {
        if (IntegrationConnectionError.isInstance(error)) {
            if (error.data.code === "not_connected") {
                return Response.json(
                    { error: config.messages.notConnected },
                    { status: 404 }
                );
            }
            if (error.data.code === "token_missing") {
                return Response.json(
                    { error: config.messages.noToken },
                    { status: 403 }
                );
            }
        }

        if (
            IntegrationApiError.isInstance(error) &&
            error.data.integrationId === config.providerId
        ) {
            return Response.json(
                { error: config.messages.apiError(error) },
                { status: error.data.status ?? 500 }
            );
        }

        log.error("OAuth import failed", {
            error,
            providerId: config.providerId,
            userId,
        });
        return Response.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : config.messages.genericError,
            },
            { status: 500 }
        );
    }
}
