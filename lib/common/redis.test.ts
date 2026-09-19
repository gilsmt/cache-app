import {
    afterAll,
    afterEach,
    beforeEach,
    describe,
    expect,
    mock,
    spyOn,
    test,
} from "bun:test";
import { Logger } from "@/lib/common/logs/console/logger";

const REFUSAL_MESSAGE =
    "Redis not ready after waiting for the connect; caller fails closed";

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

// A second private copy starts with no client, so its connect stays pending
// and the ready wait runs to its bound.
const redisWithPendingConnect: typeof import("./redis") = await import(
    `${import.meta.dir}/redis.ts?isolation-pending`
);

// The test environment drops every log record, so capture the calls the
// module makes to the logger instead of the output.
interface WarnCall {
    message: string;
    meta: unknown;
}

const warnCalls: WarnCall[] = [];
let restoreWarnSpy: () => void;

beforeEach(() => {
    warnCalls.length = 0;
    const spy = spyOn(Logger.prototype, "warn").mockImplementation(
        (message, meta) => {
            warnCalls.push({ message, meta });
        }
    );
    restoreWarnSpy = () => spy.mockRestore();
});

afterEach(() => {
    restoreWarnSpy();
});

afterAll(() => {
    mock.restore();
    delete process.env.REDIS_URL;
});

function refusalCalls(): unknown[] {
    return warnCalls
        .filter((call) => call.message === REFUSAL_MESSAGE)
        .map((call) => call.meta);
}

describe("getReadyRedisClient", () => {
    test("waits for the cold-start connect instead of reporting an outage", async () => {
        const pending = redis.getReadyRedisClient({
            bucket: "read",
            caller: "mcp.rate-limit",
        });

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
        expect(warnCalls).toHaveLength(0);
    });

    test("reports unavailable once an established connection is lost", async () => {
        redisClient.isReady = false;

        expect(
            await redis.getReadyRedisClient({
                bucket: "write",
                caller: "mcp.rate-limit",
            })
        ).toBeNull();
    });

    test("logs the wait outcome when it refuses a caller", async () => {
        // Restore the ready state so the once-per-episode gate reopens.
        redisClient.isReady = true;
        handlers.get("ready")?.();
        redisClient.isReady = false;

        expect(
            await redis.getReadyRedisClient({
                bucket: "write",
                caller: "mcp.rate-limit",
            })
        ).toBeNull();

        const refusals = refusalCalls();
        expect(refusals).toHaveLength(1);
        expect(refusals[0]).toEqual({
            bucket: "write",
            caller: "mcp.rate-limit",
            hasRedisConnected: true,
            waitDurationMs: expect.any(Number),
            waitTimedOut: false,
        });
    });

    test("records the expired wait bound when the connect never settles", async () => {
        const startedAt = Date.now();

        expect(
            await redisWithPendingConnect.getReadyRedisClient({
                caller: "library:link-reachability",
                probes: 12,
            })
        ).toBeNull();

        const waitedMs = Date.now() - startedAt;
        const refusals = refusalCalls();
        expect(refusals).toHaveLength(1);
        expect(refusals[0]).toEqual({
            caller: "library:link-reachability",
            hasRedisConnected: false,
            probes: 12,
            waitDurationMs: expect.any(Number),
            waitTimedOut: true,
        });
        expect(waitedMs).toBeGreaterThanOrEqual(1000);
    });
});
