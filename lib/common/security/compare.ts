import { createHmac, timingSafeEqual } from "node:crypto";

const HMAC_KEY = "safeCompare";

/** Hashing normalizes inputs to equal length, so the comparison stays constant-time across lengths. */
export function safeCompare(a: string, b: string): boolean {
    const hashedA = createHmac("sha256", HMAC_KEY).update(a).digest();
    const hashedB = createHmac("sha256", HMAC_KEY).update(b).digest();
    return timingSafeEqual(hashedA, hashedB);
}
