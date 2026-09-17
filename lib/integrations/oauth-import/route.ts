import "server-only";

import { requireRouteUserId } from "@/lib/auth/session";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    IntegrationApiError,
    IntegrationConnectionError,
} from "@/lib/integrations/error";
import type { IntegrationId } from "@/lib/integrations/support";
import { scheduleSmartCollections } from "@/lib/intelligence/collections/schedule";
import { runOAuthImportService } from "./service";

const log = createLogger("integrations:oauth-import");

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
