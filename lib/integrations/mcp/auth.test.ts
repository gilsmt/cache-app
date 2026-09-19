import { describe, expect, test } from "bun:test";
import {
    generateMcpToken,
    isMcpTokenRevoked,
    verifyMcpToken,
} from "@/lib/integrations/mcp/auth";

const SECRET = "test-mcp-secret";
process.env.BETTER_AUTH_SECRET = SECRET;

const encoder = new TextEncoder();

/**
 * Signs an arbitrary payload with the same HMAC the module uses, so tests can
 * forge tokens with a controlled `issuedAt`/`expiresAt`/scope segment.
 */
async function signPayload(payload: string): Promise<string> {
    const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(SECRET),
        { hash: "SHA-256", name: "HMAC" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(payload)
    );
    return `${btoa(payload)}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

describe("generateMcpToken", () => {
    test("round-trips the userId, issuedAt and requested scopes", async () => {
        const token = await generateMcpToken("user_1", ["library:read"]);
        const verified = await verifyMcpToken(token);

        expect(verified?.userId).toBe("user_1");
        expect(verified?.scopes).toEqual(["library:read"]);
        expect(verified?.issuedAt).toBeLessThanOrEqual(Date.now());
    });

    test("dedupes repeated scopes", async () => {
        const token = await generateMcpToken("user_1", [
            "library:read",
            "library:read",
            "library:write",
        ]);

        expect((await verifyMcpToken(token))?.scopes).toEqual([
            "library:read",
            "library:write",
        ]);
    });
});

describe("verifyMcpToken", () => {
    test("rejects a token whose payload was edited to escalate scopes", async () => {
        const token = await generateMcpToken("user_1", ["library:read"]);
        const [payloadB64, signatureB64] = token.split(".");
        const forgedPayload = atob(payloadB64).replace(
            "library:read",
            "library:write"
        );

        expect(
            await verifyMcpToken(`${btoa(forgedPayload)}.${signatureB64}`)
        ).toBeNull();
    });

    test("rejects an expired token", async () => {
        const issuedAt = Date.now() - 1000;
        const token = await signPayload(
            `user_1.${issuedAt}.${issuedAt + 10}.library:read`
        );

        expect(await verifyMcpToken(token)).toBeNull();
    });

    test("drops unknown scopes at decode time", async () => {
        const issuedAt = Date.now();
        const token = await signPayload(
            `user_1.${issuedAt}.${issuedAt + 60_000}.library:read+bogus`
        );

        expect((await verifyMcpToken(token))?.scopes).toEqual(["library:read"]);
    });

    test("decodes an unscoped legacy token as full access", async () => {
        const issuedAt = Date.now();
        const token = await signPayload(
            `user_1.${issuedAt}.${issuedAt + 60_000}`
        );

        expect((await verifyMcpToken(token))?.scopes).toEqual([
            "library:read",
            "library:write",
        ]);
    });
});

describe("isMcpTokenRevoked", () => {
    test("keeps tokens valid until a revocation point exists", () => {
        expect(isMcpTokenRevoked(1000, null)).toBe(false);
    });

    test("revokes tokens minted before the cutoff, keeps the rest", () => {
        expect(isMcpTokenRevoked(999, new Date(1000))).toBe(true);
        expect(isMcpTokenRevoked(1000, new Date(1000))).toBe(false);
        expect(isMcpTokenRevoked(1001, new Date(1000))).toBe(false);
    });
});
