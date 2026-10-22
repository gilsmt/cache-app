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
 * When Redis is unavailable, `checkMcpRateLimit` reports not-limited
 * (fail-open) because we'd rather degrade UX than block legitimate user
 * actions during an infrastructure blip. The danger is bounded: stealing
 * a token still gives the user their existing library access; rate-limits
 * are a defense in depth, not the only line.
 *
 * No `import "server-only"` here on purpose: this module's only caller is
 * the MCP route handler (a Next.js server route); pulling in the client
 * import attempt would be caught at the route, not at this leaf.
 */
import { createLogger } from "@/lib/common/logs/console/logger";
import { getRedisClient } from "@/lib/common/redis";

const log = createLogger("mcp.rate-limit");

const WINDOW_SECONDS = 60;

interface Bucket {
    readonly limit: number;
    /** Name used to namespace the Redis counter so read and write budgets are separate. */
    readonly name: string;
}

export const MCP_RATE_BUCKETS = {
    read: { limit: 120, name: "read" },
    write: { limit: 30, name: "write" },
} as const satisfies Record<string, Bucket>;

export interface McpRateLimitVerdict {
    limited: boolean;
    retryAfterSeconds: number;
}

export async function checkMcpRateLimit(
    userId: string,
    bucket: Bucket
): Promise<McpRateLimitVerdict> {
    const redis = getRedisClient();
    if (!redis) {
        return { limited: false, retryAfterSeconds: 0 };
    }
    try {
        const key = `mcp:rate:${bucket.name}:${userId}`;
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.pExpire(key, WINDOW_SECONDS * 1000);
        } else {
            // Repair a key left without TTL when a prior expire failed.
            // Without this the counter never resets and blocks the user.
            const ttlMs = await redis.pTTL(key);
            if (ttlMs === -1) {
                await redis.pExpire(key, WINDOW_SECONDS * 1000);
            }
        }
        if (count <= bucket.limit) {
            return { limited: false, retryAfterSeconds: 0 };
        }
        return { limited: true, retryAfterSeconds: WINDOW_SECONDS };
    } catch (error) {
        log.warn("rate-limit store unreachable; failing open", {
            error,
            userId,
        });
        return { limited: false, retryAfterSeconds: 0 };
    }
}
