import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

interface RedisStub {
    incr: (key: string) => Promise<number>;
    pExpire: (key: string, ms: number) => Promise<number>;
}

let redisClient: RedisStub | null = null;
let redisConfigured = false;

beforeEach(() => {
    redisClient = null;
    redisConfigured = false;
    mock.module("@/lib/common/redis", () => ({
        getReadyRedisClient: () => Promise.resolve(redisClient),
        isRedisConfigured: () => redisConfigured,
    }));
});

afterEach(() => {
    mock.restore();
});

const { checkMcpRateLimit, MCP_RATE_BUCKETS } = await import(
    "@/lib/integrations/mcp/rate-limit"
);

describe("checkMcpRateLimit", () => {
    test("fails closed when Redis is configured but unreachable", async () => {
        redisConfigured = true;
        expect(
            await checkMcpRateLimit("user-1", MCP_RATE_BUCKETS.read)
        ).toEqual({ status: "unavailable" });
    });

    test("stays open when Redis was never configured", async () => {
        redisConfigured = false;
        expect(
            await checkMcpRateLimit("user-1", MCP_RATE_BUCKETS.read)
        ).toEqual({ status: "allowed" });
    });

    test("allows requests within the bucket", async () => {
        redisConfigured = true;
        redisClient = {
            incr: () => Promise.resolve(5),
            pExpire: () => Promise.resolve(1),
        };
        expect(
            await checkMcpRateLimit("user-1", MCP_RATE_BUCKETS.read)
        ).toEqual({ status: "allowed" });
    });

    test("limits requests over the bucket and reports the window", async () => {
        redisConfigured = true;
        redisClient = {
            incr: () => Promise.resolve(121),
            pExpire: () => Promise.resolve(1),
        };
        expect(
            await checkMcpRateLimit("user-1", MCP_RATE_BUCKETS.read)
        ).toEqual({ retryAfterSeconds: 60, status: "limited" });
    });

    test("fails closed when the counter command throws", async () => {
        redisConfigured = true;
        redisClient = {
            incr: () => Promise.reject(new Error("connection reset")),
            pExpire: () => Promise.resolve(1),
        };
        expect(
            await checkMcpRateLimit("user-1", MCP_RATE_BUCKETS.write)
        ).toEqual({ status: "unavailable" });
    });
});
