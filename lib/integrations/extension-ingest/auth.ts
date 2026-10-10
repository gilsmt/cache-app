import { safeCompare } from "@/lib/common/security/compare";
import { hmacSha256Base64 } from "@/lib/common/security/hmac";

/**
 * Extension ingest tokens are stateless: a base64 claims segment
 * (`userId.issuedAt`) plus its HMAC-SHA256 signature under
 * `BETTER_AUTH_SECRET`. Nothing about a token is stored, so no read of the user
 * table can yield a working credential.
 *
 * Revocation is the per-user cut-off `user.ingestTokenMinIssuedAt`:
 * `isExtensionIngestTokenRevoked` rejects every token minted before it, so
 * `rotateExtensionIngestToken` cuts a leaked token without rotating the app
 * secret.
 */
export interface VerifiedExtensionIngestToken {
    issuedAt: number;
    userId: string;
}

function requireSecret(): string {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) {
        throw new Error(
            "Missing required environment variable: BETTER_AUTH_SECRET"
        );
    }
    return secret;
}

function signClaims(claims: string): string {
    return hmacSha256Base64(claims, requireSecret());
}

function encodeClaims(userId: string, issuedAt: number): string {
    return `${userId}.${issuedAt}`;
}

function decodeClaims(claims: string): VerifiedExtensionIngestToken | null {
    // The user id is opaque, so the issuedAt segment is the part after the
    // last dot.
    const parts = claims.split(".");
    const issuedAtRaw = parts.pop();
    const userId = parts.join(".");
    if (!(userId && issuedAtRaw)) {
        return null;
    }
    const issuedAt = Number(issuedAtRaw);
    if (!Number.isFinite(issuedAt)) {
        return null;
    }
    return { issuedAt, userId };
}

/**
 * Mints a token for the user. Signing stores nothing, so a user can hold one
 * valid token per browser profile and re-minting never cuts an earlier token.
 */
export function mintExtensionIngestToken(userId: string): string {
    const claims = encodeClaims(userId, Date.now());
    // Standard base64 never contains the "." the token splits on.
    const encodedClaims = Buffer.from(claims, "utf8").toString("base64");
    return `${encodedClaims}.${signClaims(claims)}`;
}

/**
 * Returns the claims of a token whose signature checks out, otherwise `null`.
 * Signature verification runs before the claims are read, so a caller never
 * acts on unsigned input.
 */
export function verifyExtensionIngestToken(
    token: string
): VerifiedExtensionIngestToken | null {
    const parts = token.split(".");
    if (parts.length !== 2) {
        return null;
    }

    const [encodedClaims, signature] = parts;
    if (!(encodedClaims && signature)) {
        return null;
    }

    const claims = Buffer.from(encodedClaims, "base64").toString("utf8");
    if (!safeCompare(signature, signClaims(claims))) {
        return null;
    }

    return decodeClaims(claims);
}

/**
 * A token is revoked when it was minted before the user's revocation point.
 * `minIssuedAt` is null until the user rotates their extension link.
 */
export function isExtensionIngestTokenRevoked(
    issuedAt: number,
    minIssuedAt: Date | null
): boolean {
    return minIssuedAt !== null && issuedAt < minIssuedAt.getTime();
}
