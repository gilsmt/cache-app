import { createHmac, timingSafeEqual } from "node:crypto";

/** Hashing normalizes inputs to equal length, so the comparison stays constant-time across lengths. */
export function safeCompare(a: string, b: string): boolean {
    const key = "safeCompare";
    const hashedA = createHmac("sha256", key).update(a).digest();
    const hashedB = createHmac("sha256", key).update(b).digest();
    return timingSafeEqual(hashedA, hashedB);
}
