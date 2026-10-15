const encoder = new TextEncoder();

const MCP_TOKEN_TTL_DAYS = 30;
const MCP_TOKEN_TTL_MS = MCP_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

/** Real tokens are a few hundred chars; anything larger is a hostile input. */
const MCP_TOKEN_MAX_LENGTH = 4096;

/**
 * MCP scopes map onto tool capabilities. Tokens carry one or both; the route
 * checks the relevant scope before executing mutating tools. Adding
 * `library:read-only` would model an audit/summary agent that cannot write.
 */
export const MCP_SCOPES = ["library:read", "library:write"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

/**
 * Tokens issued before the scope segment existed decode as full access so
 * existing clients keep working. New tokens declare their scopes at the mint
 * site instead of inheriting a full-access default.
 */
const LEGACY_DEFAULT_SCOPES: McpScope[] = ["library:read", "library:write"];

function requireSecret(): string {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (!secret) {
        throw new Error(
            "Missing required environment variable: BETTER_AUTH_SECRET"
        );
    }
    return secret;
}

function importKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        encoder.encode(requireSecret()),
        { hash: "SHA-256", name: "HMAC" },
        false,
        ["sign", "verify"]
    );
}

interface TokenPayload {
    expiresAt: number;
    issuedAt: number;
    scopes: McpScope[];
    userId: string;
}

function encodePayload(
    userId: string,
    issuedAt: number,
    expiresAt: number,
    scopes: McpScope[]
): string {
    // Dot-separated so the existing base64 wrap carries it verbatim. An
    // explicitly empty scope list encodes as a trailing `.` and decodes back
    // to empty (no access); only payloads with no fourth segment at all
    // decode as legacy full access. See `decodePayload`.
    return `${userId}.${issuedAt}.${expiresAt}.${scopes.join("+")}`;
}

function decodePayload(payload: string): TokenPayload | null {
    const parts = payload.split(".");
    if (parts.length < 3) {
        return null;
    }
    // Right-anchored parse: the numeric tail fixes field positions even if a
    // future userId format contains dots. A dotted legacy payload without a
    // scope segment misparses the tail as non-numeric and fails closed below.
    const hasScopeSegment = parts.length > 3;
    const userId = hasScopeSegment ? parts.slice(0, -3).join(".") : parts[0];
    const issuedAtRaw = hasScopeSegment ? parts.at(-3) : parts[1];
    const expiresAtRaw = hasScopeSegment ? parts.at(-2) : parts[2];
    const scopesRaw = hasScopeSegment ? parts.at(-1) : undefined;
    if (!(userId && issuedAtRaw && expiresAtRaw)) {
        return null;
    }
    const issuedAt = Number(issuedAtRaw);
    const expiresAt = Number(expiresAtRaw);
    if (!(Number.isFinite(issuedAt) && Number.isFinite(expiresAt))) {
        return null;
    }
    // Tokens issued before the scope segment existed carry only three
    // segments and decode as `library:read+library:write` so existing clients
    // keep working until they re-issue. New tokens always carry an explicit
    // scope list, including an explicitly empty one (no access).
    const scopes: McpScope[] =
        scopesRaw === undefined
            ? LEGACY_DEFAULT_SCOPES
            : normalizeScopes(scopesRaw.split("+"));
    return { expiresAt, issuedAt, scopes, userId };
}

function normalizeScopes(values: readonly string[]): McpScope[] {
    const seen = new Set<McpScope>();
    const result: McpScope[] = [];
    for (const value of values) {
        if (!isMcpScope(value) || seen.has(value)) {
            continue;
        }
        seen.add(value);
        result.push(value);
    }
    return result;
}

export function isMcpScope(value: string): value is McpScope {
    return (MCP_SCOPES as readonly string[]).includes(value);
}

/**
 * Generates a stateless HMAC token for MCP authentication.
 *
 * The token encodes `userId`, `issuedAt`, `expiresAt` (TTL: 30 days) and the
 * granted `scopes`, and signs the joined string with `BETTER_AUTH_SECRET`.
 * `scopes` is required so no caller mints a full-access token by omission.
 *
 * Revocation is server-side: `verifyMcpAuthToken` rejects a token whose signed
 * `issuedAt` predates the user's `mcpTokenMinIssuedAt` point, which
 * `rotateMcpTokens` advances. A leaked grant therefore needs no
 * `BETTER_AUTH_SECRET` rotation.
 */
export async function generateMcpToken(
    userId: string,
    scopes: readonly McpScope[]
): Promise<string> {
    const issuedAt = Date.now();
    const expiresAt = issuedAt + MCP_TOKEN_TTL_MS;
    const normalized = normalizeScopes(scopes);
    if (normalized.length === 0) {
        throw new Error("generateMcpToken requires at least one scope.");
    }
    const payload = encodePayload(userId, issuedAt, expiresAt, normalized);
    const key = await importKey();
    const signature = await crypto.subtle.sign(
        "HMAC",
        key,
        encoder.encode(payload)
    );
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
    const payloadB64 = btoa(payload);
    return `${payloadB64}.${sigB64}`;
}

/** The claims of an MCP token whose signature and expiry both check out. */
export interface VerifiedMcpToken {
    issuedAt: number;
    scopes: McpScope[];
    userId: string;
}

/**
 * Verifies an MCP token. Returns the token's `issuedAt`, granted `scopes` and
 * `userId` if the signature is valid AND the token has not expired, otherwise
 * `null`. The expiry check runs after signature verification so an attacker
 * cannot probe expiry with a forged token. Revocation is a separate server-side
 * check: see `isMcpTokenRevoked`.
 */
export async function verifyMcpToken(
    token: string
): Promise<VerifiedMcpToken | null> {
    if (token.length > MCP_TOKEN_MAX_LENGTH) {
        return null;
    }
    const parts = token.split(".");
    if (parts.length !== 2) {
        return null;
    }

    const [payloadB64, sigB64] = parts;
    if (!(payloadB64 && sigB64)) {
        return null;
    }

    let payload: string;
    let signature: Uint8Array<ArrayBuffer>;
    try {
        payload = atob(payloadB64);
        // TS6 narrows `Uint8Array<ArrayBufferLike>` away from `BufferSource`;
        // copy into a fresh `ArrayBuffer` so `crypto.subtle.verify` accepts it.
        const sigBytes = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
        signature = new Uint8Array(sigBytes);
    } catch {
        return null;
    }

    try {
        const key = await importKey();
        const valid = await crypto.subtle.verify(
            "HMAC",
            key,
            signature,
            encoder.encode(payload)
        );
        if (!valid) {
            return null;
        }
    } catch {
        return null;
    }

    const parsed = decodePayload(payload);
    if (!parsed) {
        return null;
    }

    if (parsed.expiresAt <= Date.now()) {
        return null;
    }

    return {
        issuedAt: parsed.issuedAt,
        scopes: parsed.scopes,
        userId: parsed.userId,
    };
}

/**
 * A token is revoked when it was minted before the user's revocation point.
 * `minIssuedAt` is null until the user rotates their MCP access.
 */
export function isMcpTokenRevoked(
    issuedAt: number,
    minIssuedAt: Date | null
): boolean {
    return minIssuedAt !== null && issuedAt < minIssuedAt.getTime();
}
