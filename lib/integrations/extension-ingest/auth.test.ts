import { beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
    isExtensionIngestTokenRevoked,
    mintExtensionIngestToken,
    verifyExtensionIngestToken,
} from "@/lib/integrations/extension-ingest/auth";

const SECRET = "test-extension-ingest-secret";

/** 48 characters of nanoid: the shape `user.extensionIngestToken` used to hold. */
const LEGACY_CLEARTEXT_TOKEN =
    "V1StGXR8_Z5jdHi6B-myTq3n4xPfLoK9sDcEiUaQbNk2mA0EzW";

/**
 * Signs arbitrary claims with the same HMAC the module uses, so tests can forge
 * a token whose claims decode differently from anything the module mints.
 */
function signClaims(claims: string): string {
    const signature = createHmac("sha256", SECRET)
        .update(claims, "utf8")
        .digest("base64");
    return `${Buffer.from(claims, "utf8").toString("base64")}.${signature}`;
}

describe("mintExtensionIngestToken", () => {
    beforeEach(() => {
        process.env.BETTER_AUTH_SECRET = SECRET;
    });

    test("round-trips the user id and the mint time", () => {
        const mintedAt = Date.now();
        const verified = verifyExtensionIngestToken(
            mintExtensionIngestToken("user_1")
        );

        expect(verified?.userId).toBe("user_1");
        expect(verified?.issuedAt).toBeGreaterThanOrEqual(mintedAt);
        expect(verified?.issuedAt).toBeLessThanOrEqual(Date.now());
    });

    test("leaves the tokens it minted earlier valid", () => {
        const first = mintExtensionIngestToken("user_1");
        const second = mintExtensionIngestToken("user_1");

        expect(verifyExtensionIngestToken(first)?.userId).toBe("user_1");
        expect(verifyExtensionIngestToken(second)?.userId).toBe("user_1");
        expect(second).not.toBe(mintExtensionIngestToken("user_2"));
    });
});

describe("verifyExtensionIngestToken", () => {
    beforeEach(() => {
        process.env.BETTER_AUTH_SECRET = SECRET;
    });

    test("rejects the cleartext token the stored column used to hold", () => {
        expect(verifyExtensionIngestToken(LEGACY_CLEARTEXT_TOKEN)).toBeNull();
    });

    test("rejects claims edited after signing", () => {
        const token = mintExtensionIngestToken("user_1");
        const signature = token.slice(token.indexOf(".") + 1);
        const editedClaims = Buffer.from("user_2.1000", "utf8").toString(
            "base64"
        );

        expect(
            verifyExtensionIngestToken(`${editedClaims}.${signature}`)
        ).toBeNull();
    });

    test("rejects malformed tokens", () => {
        for (const token of [
            "",
            "no-separator",
            ".",
            "a.b.c",
            "signature-only.",
        ]) {
            expect(verifyExtensionIngestToken(token)).toBeNull();
        }
    });

    test("rejects signed claims without a user id and a mint time", () => {
        expect(
            verifyExtensionIngestToken(signClaims("no-issued-at"))
        ).toBeNull();
        expect(
            verifyExtensionIngestToken(signClaims("user_1.not-a-number"))
        ).toBeNull();
        expect(verifyExtensionIngestToken(signClaims("user_1."))).toBeNull();
        expect(verifyExtensionIngestToken(signClaims(".1000"))).toBeNull();
    });
});

describe("isExtensionIngestTokenRevoked", () => {
    test("treats a null cut-off as no revocation", () => {
        expect(isExtensionIngestTokenRevoked(1000, null)).toBe(false);
    });

    test("revokes a token minted before the cut-off", () => {
        expect(isExtensionIngestTokenRevoked(999, new Date(1000))).toBe(true);
    });

    test("keeps a token minted at or after the cut-off", () => {
        expect(isExtensionIngestTokenRevoked(1000, new Date(1000))).toBe(false);
        expect(isExtensionIngestTokenRevoked(1001, new Date(1000))).toBe(false);
    });
});
