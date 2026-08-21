const OAUTH_SCOPE_SEPARATOR_PATTERN = /[\s,]+/;

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

export function compareProviderAccountsForScopePreference(
    left: { id: string; scope: string | null },
    right: { id: string; scope: string | null },
    requiredScope: string | undefined
): number {
    if (requiredScope) {
        const leftHasScope = accountHasOAuthScope(left.scope, requiredScope);
        const rightHasScope = accountHasOAuthScope(right.scope, requiredScope);
        if (leftHasScope !== rightHasScope) {
            return leftHasScope ? -1 : 1;
        }
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
