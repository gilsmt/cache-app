import { afterAll, describe, expect, mock, test } from "bun:test";

type RedisHandler = (...args: unknown[]) => void;

const handlers = new Map<string, RedisHandler>();
let resolveInitialConnect: (() => void) | null = null;

const redisClient = {
    connect: () =>
        new Promise<void>((resolve) => {
            resolveInitialConnect = resolve;
        }),
    destroy: () => undefined,
    isReady: false,
    on(event: string, handler: RedisHandler) {
        handlers.set(event, handler);
        return redisClient;
    },
    ping: () => Promise.resolve("PONG"),
};

mock.module("redis", () => ({
    createClient: () => redisClient,
}));

process.env.REDIS_URL = "redis://localhost:6379";

// `mock.module` is process-wide and sibling test files mock this module's
// path, so load a private copy to test the real implementation.
const redis: typeof import("./redis") = await import(
    `${import.meta.dir}/redis.ts?isolation`
);

afterAll(() => {
    mock.restore();
    delete process.env.REDIS_URL;
});

describe("getReadyRedisClient", () => {
    test("waits for the cold-start connect instead of reporting an outage", async () => {
        const pending = redis.getReadyRedisClient();

        let didSettle = false;
        pending.then(() => {
            didSettle = true;
        });
        await Promise.resolve();
        expect(didSettle).toBe(false);

        redisClient.isReady = true;
        handlers.get("ready")?.();
        resolveInitialConnect?.();

        expect((await pending)?.isReady).toBe(true);
    });

    test("reports unavailable once an established connection is lost", async () => {
        redisClient.isReady = false;

        expect(await redis.getReadyRedisClient()).toBeNull();
    });
});
