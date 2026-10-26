const OAUTH_SCOPE_SEPARATOR_PATTERN = /[\s,]+/u;

const SOFT_TOKEN_RESOLUTION_ERROR_CODES = new Set([
    "ACCOUNT_NOT_FOUND",
    "FAILED_TO_GET_ACCESS_TOKEN",
]);

export function accountHasOAuthScope(
    scope: string | null | undefined,
    requiredScope: string
): boolean {
    if (!scope) {
        return false;
    }
    return scope.split(OAUTH_SCOPE_SEPARATOR_PATTERN).includes(requiredScope);
}

/**
 * Orders linked accounts so the most likely usable one comes first.
 *
 * `Account.scope` holds every scope the account was ever granted: better-auth
 * merges scopes on link and keeps the stored value on refresh, even when the
 * refreshed grant is narrower. The stored scope therefore says which account
 * was asked for the scope, not what the live token carries. Accounts are
 * compared by link time so the order is stable and meaningful.
 */
export function compareProviderAccountsForScopePreference(
    left: { createdAt: Date; id: string; scope: string | null },
    right: { createdAt: Date; id: string; scope: string | null },
    requiredScope: string | undefined
): number {
    if (requiredScope) {
        const leftHasScope = accountHasOAuthScope(left.scope, requiredScope);
        const rightHasScope = accountHasOAuthScope(right.scope, requiredScope);
        if (leftHasScope !== rightHasScope) {
            return leftHasScope ? -1 : 1;
        }
    }

    const linkOrder = left.createdAt.getTime() - right.createdAt.getTime();
    if (linkOrder !== 0) {
        return linkOrder;
    }

    return left.id.localeCompare(right.id);
}

export function getProviderTokenApiErrorCode(error: unknown): string | null {
    if (
        typeof error !== "object" ||
        error === null ||
        !("body" in error) ||
        typeof error.body !== "object" ||
        error.body === null ||
        !("code" in error.body) ||
        typeof error.body.code !== "string"
    ) {
        return null;
    }
    return error.body.code;
}

export function isSoftProviderTokenResolutionFailure(error: unknown): boolean {
    const code = getProviderTokenApiErrorCode(error);
    return code !== null && SOFT_TOKEN_RESOLUTION_ERROR_CODES.has(code);
}
