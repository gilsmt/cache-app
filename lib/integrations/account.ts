import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { createLogger } from "@/lib/common/logs/console/logger";
import { prisma } from "@/prisma";
import {
    compareProviderAccountsForScopePreference,
    getProviderTokenApiErrorCode,
    isSoftProviderTokenResolutionFailure,
} from "./provider-account-resolution";
import { listIntegrationAccountProviderIds } from "./support";

const log = createLogger("integrations:account");

const LINKED_INTEGRATION_ACCOUNT_LIMIT = 50;

/**
 * A resolved provider token plus the local account row it came from.
 *
 * `accountId` is the local `Account.id` primary key — the same identifier
 * better-auth 1.7 expects in `auth.api.getAccessToken({ accountId })` — not
 * the provider-assigned subject stored in `Account.accountId`. It is opaque
 * to callers and safe to round-trip through the client.
 */
export interface ResolvedProviderAccess {
    accessToken: string;
    accountId: string;
}

/**
 * Lists linked OAuth accounts for integrations the app supports.
 *
 * Only returns accounts whose providerId matches a known integration,
 * because the account table may contain auth-only providers (e.g. Google
 * sign-in) that are not treated as content integrations.
 */
export function listLinkedIntegrationAccounts(args: {
    userId: string;
}): Promise<Array<{ providerId: string }>> {
    return prisma.account.findMany({
        select: { providerId: true },
        take: LINKED_INTEGRATION_ACCOUNT_LIMIT,
        where: {
            providerId: {
                in: listIntegrationAccountProviderIds(),
            },
            userId: args.userId,
        },
    });
}

/**
 * Reports whether the user has any linked account for the provider, so
 * callers can distinguish "not connected" from "connected but token
 * unavailable" without pinning an arbitrary account row.
 */
export function hasLinkedProviderAccount(args: {
    providerId: string;
    userId: string;
}): Promise<boolean> {
    return prisma.account
        .count({
            where: {
                providerId: args.providerId,
                userId: args.userId,
            },
        })
        .then((count) => count > 0);
}

async function tryGetAccessToken(
    localAccountId: string
): Promise<string | null> {
    const tokenResponse = await auth.api.getAccessToken({
        body: {
            accountId: localAccountId,
        },
        headers: await headers(),
    });

    return tokenResponse?.accessToken ?? null;
}

async function tryResolveAccountAccess(
    accountId: string,
    providerId: string,
    softFailureMessage: string
): Promise<ResolvedProviderAccess | null> {
    try {
        const accessToken = await tryGetAccessToken(accountId);
        if (!accessToken) {
            return null;
        }
        return { accessToken, accountId };
    } catch (error) {
        if (isSoftProviderTokenResolutionFailure(error)) {
            log.debug(softFailureMessage, {
                accountId,
                code: getProviderTokenApiErrorCode(error),
                providerId,
            });
            return null;
        }
        log.error("Hard failure resolving provider account access", {
            accountId,
            error,
            providerId,
        });
        throw error;
    }
}

/**
 * Resolves a valid access token for an OAuth provider account.
 *
 * {@link args.userId} is always required so pinned accounts are ownership-
 * checked and multi-account scans stay scoped to the session user.
 *
 * When a specific {@link args.accountId} is given, only that account is
 * attempted (after verifying it belongs to {@link args.userId}). Otherwise
 * ALL accounts matching the provider are tried — essential when a user has
 * linked multiple Google accounts via accountLinking, so an arbitrary row
 * isn't picked while another holds a valid token.
 *
 * When {@link args.requiredScope} is set, accounts whose stored scope grants
 * it are tried first. Soft per-account token failures continue to the next
 * account; session/config failures rethrow.
 */
export async function resolveProviderAccountAccess(args: {
    accountId?: string;
    providerId: string;
    requiredScope?: string;
    userId: string;
}): Promise<ResolvedProviderAccess | null> {
    if (args.accountId) {
        const ownedAccount = await prisma.account.findFirst({
            select: { id: true },
            where: {
                id: args.accountId,
                providerId: args.providerId,
                userId: args.userId,
            },
        });
        if (!ownedAccount) {
            log.warn("Pinned account is not owned by user", {
                accountId: args.accountId,
                providerId: args.providerId,
                userId: args.userId,
            });
            return null;
        }

        return tryResolveAccountAccess(
            args.accountId,
            args.providerId,
            "Pinned account access token is unusable"
        );
    }

    for await (const access of eachProviderAccountAccess({
        providerId: args.providerId,
        requiredScope: args.requiredScope,
        userId: args.userId,
    })) {
        return access;
    }

    log.warn("No valid access token found across all accounts", {
        providerId: args.providerId,
        requiredScope: args.requiredScope,
        userId: args.userId,
    });
    return null;
}

/**
 * Yields successfully resolved access tokens for each linked account,
 * preferring accounts that grant {@link args.requiredScope}. Soft token
 * failures skip to the next account; hard auth/config errors rethrow.
 */
export async function* eachProviderAccountAccess(args: {
    providerId: string;
    requiredScope?: string;
    userId: string;
}): AsyncGenerator<ResolvedProviderAccess> {
    const accounts = await prisma.account.findMany({
        orderBy: { id: "asc" },
        select: { id: true, scope: true },
        take: LINKED_INTEGRATION_ACCOUNT_LIMIT,
        where: {
            providerId: args.providerId,
            userId: args.userId,
        },
    });

    const orderedAccounts = args.requiredScope
        ? accounts.toSorted((left, right) =>
              compareProviderAccountsForScopePreference(
                  { id: left.id, scope: left.scope },
                  { id: right.id, scope: right.scope },
                  args.requiredScope
              )
          )
        : accounts;

    for (const account of orderedAccounts) {
        const access = await tryResolveAccountAccess(
            account.id,
            args.providerId,
            "Skipping account with unusable access token"
        );
        if (access) {
            yield access;
        }
    }
}

export async function resolveProviderAccountAccessToken(args: {
    accountId?: string;
    providerId: string;
    requiredScope?: string;
    userId: string;
}): Promise<string | null> {
    const resolved = await resolveProviderAccountAccess(args);
    return resolved?.accessToken ?? null;
}
