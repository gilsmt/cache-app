import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

let redisConfigured = false;

mock.module("server-only", () => ({}));
mock.module("@/lib/common/redis", () => ({
    getRedisClient: () => null,
    isRedisConfigured: () => redisConfigured,
}));

const { consumeProbeBudget } = await import(
    "@/lib/collections/link-reachability"
);

beforeEach(() => {
    redisConfigured = false;
});

afterEach(() => {
    mock.restore();
});

describe("consumeProbeBudget", () => {
    test("refuses probes when Redis is configured but unreachable", async () => {
        redisConfigured = true;
        expect(await consumeProbeBudget("user-1", 1)).toEqual({
            allowed: false,
            retryAfterMs: 60_000,
        });
    });

    test("uses the local fallback when Redis is not configured", async () => {
        redisConfigured = false;
        expect(await consumeProbeBudget("user-1", 1)).toEqual({
            allowed: true,
            retryAfterMs: 0,
        });
    });

    test("allows a zero-probe batch without touching the fallback", async () => {
        redisConfigured = true;
        expect(await consumeProbeBudget("user-1", 0)).toEqual({
            allowed: true,
            retryAfterMs: 0,
        });
    });
});
