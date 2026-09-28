import { createHmac } from "node:crypto";

function hmacSha256(
    body: string,
    secret: string | Buffer,
    encoding: "hex" | "base64"
): string {
    return createHmac("sha256", secret).update(body, "utf8").digest(encoding);
}

/** For providers sending a hex signature (`X-Hub-Signature-256` etc.); pair with safeCompare. */
export function hmacSha256Hex(body: string, secret: string | Buffer): string {
    return hmacSha256(body, secret, "hex");
}

/** For providers sending base64 straight (Typeform, MS Teams); pair with safeCompare. */
export function hmacSha256Base64(
    body: string,
    secret: string | Buffer
): string {
    return hmacSha256(body, secret, "base64");
}
