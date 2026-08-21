import { describe, expect, test } from "bun:test";
import {
    accountHasOAuthScope,
    compareProviderAccountsForScopePreference,
    getProviderTokenApiErrorCode,
    isSoftProviderTokenResolutionFailure,
} from "./provider-account-resolution";

describe("accountHasOAuthScope", () => {
    test("matches space-separated scopes", () => {
        expect(
            accountHasOAuthScope(
                "openid email https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
                "https://www.googleapis.com/auth/photospicker.mediaitems.readonly"
            )
        ).toBe(true);
    });

    test("matches comma-separated scopes", () => {
        expect(accountHasOAuthScope("a,b,c", "b")).toBe(true);
    });

    test("rejects missing scope and empty input", () => {
        expect(accountHasOAuthScope("openid email", "photos")).toBe(false);
        expect(accountHasOAuthScope(null, "photos")).toBe(false);
        expect(accountHasOAuthScope(undefined, "photos")).toBe(false);
        expect(accountHasOAuthScope("", "photos")).toBe(false);
    });
});

describe("compareProviderAccountsForScopePreference", () => {
    const withScope = {
        id: "b-account",
        scope: "openid photos",
    };
    const withoutScope = {
        id: "a-account",
        scope: "openid",
    };

    test("prefers accounts that grant the required scope", () => {
        expect(
            compareProviderAccountsForScopePreference(
                withoutScope,
                withScope,
                "photos"
            )
        ).toBeGreaterThan(0);
        expect(
            compareProviderAccountsForScopePreference(
                withScope,
                withoutScope,
                "photos"
            )
        ).toBeLessThan(0);
    });

    test("falls back to id order when scope ties or is unset", () => {
        expect(
            compareProviderAccountsForScopePreference(
                withoutScope,
                withScope,
                undefined
            )
        ).toBe(withoutScope.id.localeCompare(withScope.id));
        expect(
            compareProviderAccountsForScopePreference(
                { id: "z", scope: "photos" },
                { id: "a", scope: "photos" },
                "photos"
            )
        ).toBe("z".localeCompare("a"));
    });

    test("sorts scoped accounts first", () => {
        const ordered = [withoutScope, withScope].toSorted((left, right) =>
            compareProviderAccountsForScopePreference(left, right, "photos")
        );
        expect(ordered.map((account) => account.id)).toEqual([
            "b-account",
            "a-account",
        ]);
    });
});

describe("isSoftProviderTokenResolutionFailure", () => {
    test("treats known Better Auth token codes as soft", () => {
        expect(
            isSoftProviderTokenResolutionFailure({
                body: { code: "ACCOUNT_NOT_FOUND" },
            })
        ).toBe(true);
        expect(
            isSoftProviderTokenResolutionFailure({
                body: { code: "FAILED_TO_GET_ACCESS_TOKEN" },
            })
        ).toBe(true);
    });

    test("rejects unknown codes and malformed errors", () => {
        expect(
            isSoftProviderTokenResolutionFailure({
                body: { code: "SESSION_EXPIRED" },
            })
        ).toBe(false);
        expect(isSoftProviderTokenResolutionFailure(new Error("boom"))).toBe(
            false
        );
        expect(isSoftProviderTokenResolutionFailure(null)).toBe(false);
        expect(getProviderTokenApiErrorCode({ body: { code: 1 } })).toBeNull();
    });
});
