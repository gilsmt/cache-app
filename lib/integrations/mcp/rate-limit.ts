/**
 * Per-userId rate limiting for the MCP tools.
 *
 * The threat we're guarding against is a stolen MCP Bearer token. Tokens are
 * 30-day HMAC-secret-bound; a leaked grant gives the holder full read+write
 * access to the user's library. Rate limits narrow the blast radius without
 * requiring a revocation surface area we don't have today.
 *
 * Implementation: a fixed-window counter in Redis, keyed by `userId` and
 * the bucket name. We pick fixed window over a sliding log because it stays
 * O(1) per request and gives the operator an easy knob (the `limit`
 * constant). The window is short enough that an attacker can't amortize
 * the burst and long enough not to feel like a quota.
 *
 * Redis is the counter's only home, so the limit cannot be enforced without
 * it. When Redis is configured but unreachable this fails closed
 * (`unavailable`) rather than letting the request through: the counter is
 * the blast-radius control for a stolen token, and letting the request
 * through would remove the only throttle. `getReadyRedisClient` waits out the
 * connect window of a freshly created client, so a cold start is not read as
 * an outage. A deployment with no `REDIS_URL` at all is a deliberate
 * Redis-less setup, so that case stays fail-open; the Redis client logs it
 * separately from an outage.
 *
 * No `import "server-only"` here on purpose: this module's only callers are
 * the MCP route handler (a Next.js server route); pulling in the client
 * import attempt would be caught at the route, not at this leaf. Adding the
 * marker would also keep us from unit-testing the decision helpers without a
 * preload hack.
 */
import { createLogger } from "@/lib/common/logs/console/logger";
import { getReadyRedisClient, isRedisConfigured } from "@/lib/common/redis";

const log = createLogger("mcp.rate-limit");

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

export type McpRateLimitOutcome =
    | { status: "allowed" }
    | { status: "limited"; retryAfterSeconds: number }
    | { status: "unavailable" };

/**
 * Count the request against the user's bucket and decide whether it is over
 * the limit. Counts the request atomically and returns `unavailable` when the
 * counter cannot be read, instead of throwing.
 */
export async function checkMcpRateLimit(
    userId: string,
    bucket: Bucket
): Promise<McpRateLimitOutcome> {
    const redis = await getReadyRedisClient();
    if (!redis) {
        return isRedisConfigured()
            ? { status: "unavailable" }
            : { status: "allowed" };
    }

    try {
        const key = `mcp:rate:${bucket.name}:${userId}`;
        const count = await redis.incr(key);
        if (count === 1) {
            // First request in a fresh window — establish the TTL atomically.
            // `pexpire` is preferred so a partial-second drift doesn't cut the
            // window short; the worst case is we let a request through on the
            // 60.0001-second boundary, which is fine for a defense-in-depth cap.
            await redis.pExpire(key, WINDOW_SECONDS * 1000);
        }
        return count > bucket.limit
            ? { retryAfterSeconds: WINDOW_SECONDS, status: "limited" }
            : { status: "allowed" };
    } catch (error) {
        log.warn("MCP rate limit counter failed; failing closed", {
            bucket: bucket.name,
            error,
            userId,
        });
        return { status: "unavailable" };
    }
}
