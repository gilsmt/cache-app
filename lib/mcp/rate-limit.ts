/**
 * Per-userId rate limiting for the MCP tools.
 *
 * The threat we're guarding against is a stolen MCP Bearer token. A leaked
 * grant gives the holder the user's library access until the user revokes it,
 * which they can do at any time by rotating their MCP tokens
 * (`rotateMcpTokens`). Rate limits bound what the token can do in the window
 * before that revocation lands.
 *
 * Implementation: a fixed-window counter in Redis, keyed by `userId` and
 * the bucket name. We pick fixed window over a sliding log because it stays
 * O(1) per request and gives the operator an easy knob (the `limit`
 * constant). The window is short enough that an attacker can't amortize
 * the burst and long enough not to feel like a quota.
 *
 * When Redis is unavailable, `incrementMcpRateCounter` returns `null`
 * (fail-open) because we'd rather degrade UX than block legitimate user
 * actions during an infrastructure blip. The danger is bounded: stealing
 * a token still gives the user their existing library access; rate-limits
 * are a defense in depth, not the only line.
 *
 * No `import "server-only"` here on purpose: this module's only callers are
 * the MCP route handler (a Next.js server route); pulling in the client
 * import attempt would be caught at the route, not at this leaf. Adding the
 * marker would also keep us from unit-testing the decision helpers without a
 * preload hack.
 */
import { getRedisClient } from "@/lib/common/redis";

const WINDOW_SECONDS = 60;

interface Bucket {
    /** Maximum number of operations allowed per window. */
    readonly limit: number;
    /** Name used to namespace the Redis counter so read and write budgets are separate. */
    readonly name: string;
}

export const MCP_RATE_BUCKETS = {
    read: { limit: 120, name: "read" },
    write: { limit: 30, name: "write" },
} as const satisfies Record<string, Bucket>;

export interface RateLimitDecision {
    count: number;
    limit: number;
    retryAfterSeconds: number;
}

/**
 * Atomically increment the counter for the user's bucket and return the new
 * count. Returns `null` when Redis isn't reachable so callers can decide
 * whether to fail-open or surface the error.
 */
export async function incrementMcpRateCounter(
    userId: string,
    bucket: Bucket
): Promise<RateLimitDecision | null> {
    const redis = getRedisClient();
    if (!redis) {
        return null;
    }
    const key = `mcp:rate:${bucket.name}:${userId}`;
    const count = await redis.incr(key);
    if (count === 1) {
        // First request in a fresh window — establish the TTL atomically.
        // `pexpire` is preferred so a partial-second drift doesn't cut the
        // window short; the worst case is we let a request through on the
        // 60.0001-second boundary, which is fine for a defense-in-depth cap.
        await redis.pExpire(key, WINDOW_SECONDS * 1000);
    }
    const retryAfterSeconds = count > bucket.limit ? WINDOW_SECONDS : 0;
    return {
        count,
        limit: bucket.limit,
        retryAfterSeconds,
    };
}

/**
 * Centralized gate. `null` means Redis is absent — fall through and let the
 * tool run. A `decision` with `count > limit` means fail-closed at this call.
 */
export function isOverLimit(
    decision: RateLimitDecision | null,
    bucket: Bucket
): boolean {
    if (!decision) {
        return false;
    }
    return decision.count > bucket.limit;
}
