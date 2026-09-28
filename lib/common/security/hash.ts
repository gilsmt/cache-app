import { createHash } from "node:crypto";

type HashInput = string | Uint8Array;

function digest(
    input: HashInput,
    algorithm: "sha1" | "sha256",
    encoding: "hex" | "base64url"
): string {
    const hash = createHash(algorithm);
    if (typeof input === "string") {
        hash.update(input, "utf8");
    } else {
        hash.update(input);
    }
    return hash.digest(encoding);
}

/** Fast SHA-1 digest in hexadecimal; not suitable for security-sensitive uses. */
export function sha1Hex(input: HashInput): string {
    return digest(input, "sha1", "hex");
}

/**
 * Fast digest — safe only for high-entropy input (API keys, encrypted values,
 * digests). Passwords never land here: Better Auth owns the slow KDF.
 */
export function sha256Hex(input: HashInput): string {
    return digest(input, "sha256", "hex");
}

/** PKCE code challenge encoding (RFC 7636) so both sides derive it identically. */
export function sha256Base64Url(input: HashInput): string {
    return digest(input, "sha256", "base64url");
}
