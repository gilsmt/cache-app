import "server-only";

import {
    hasLinkedProviderAccount,
    resolveProviderAccountAccessToken,
} from "@/lib/integrations/account";
import { IntegrationConnectionError } from "@/lib/integrations/error";
import type { IntegrationId } from "@/lib/integrations/support";

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
