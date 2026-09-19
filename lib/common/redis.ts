import type { RedisClientType } from "redis";
import { createClient } from "redis";
import * as z from "zod";
import { NamedError } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";

const log = createLogger("Redis");

const RedisConnectionError = NamedError.create(
    "RedisConnectionError",
    z.object({
        message: z.string(),
        operation: z.string(),
    })
);
export type RedisConnectionError = InstanceType<typeof RedisConnectionError>;

/**
 * How long an abuse-bounding caller waits for an in-flight connection before
 * it treats a configured Redis as unavailable.
 */
const REDIS_READY_WAIT_TIMEOUT_MS = 1000;

let globalRedisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<void> | null = null;
let didWarnRedisUnavailable = false;
let hasRedisConnected = false;

/**
 * Whether Redis is configured through `REDIS_URL`.
 *
 * Separates "the operator never configured Redis" from "Redis is configured
 * but its socket is not ready yet". Abuse-bounding callers must fail closed
 * for the second state without breaking a deliberately Redis-less setup.
 */
export function isRedisConfigured(): boolean {
    return Boolean(process.env.REDIS_URL);
}

function warnRedisUnavailableOnce(): void {
    if (didWarnRedisUnavailable) {
        return;
    }
    didWarnRedisUnavailable = true;
    log.warn(
        "Redis client not ready (disconnected or reconnecting); callers degrade or fail closed"
    );
}

/**
 * Wait for the connect started by {@link getRedisClient} to settle, up to a
 * bound. A client that is still connecting on a cold start resolves here in
 * milliseconds; a client whose socket cannot connect keeps its connect
 * pending across reconnects, so the timeout keeps the caller from hanging.
 */
function waitForRedisReady(timeoutMs: number): Promise<void> {
    const connecting = redisConnectPromise;
    if (!connecting) {
        return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), timeoutMs);
        connecting.then(
            () => {
                clearTimeout(timer);
                resolve();
            },
            () => {
                clearTimeout(timer);
                resolve();
            }
        );
    });
}

/**
 * Get a Redis client instance.
 * Returns null in browser environments, when Redis is not configured, or
 * when the underlying socket is not ready — which includes both the
 * cold-start connect window and a reconnect after a dropped connection.
 *
 * The client auto-reconnects on disconnection. Once the socket is ready
 * again the returned value flips from null back to the client — no
 * instance is lost or re-created.
 *
 * Abuse-bounding callers use {@link getReadyRedisClient} so the transient
 * cold-start window is not mistaken for an outage.
 */
export function getRedisClient(): RedisClientType | null {
    if (typeof window !== "undefined") {
        return null;
    }

    if (globalRedisClient) {
        // The client auto-reconnects after disconnection, but commands sent before
        // reconnection completes queue indefinitely (the offline queue is enabled by
        // default). Rather than returning a client that will hang callers, return null
        // so every caller can degrade or fail closed.
        //
        // Once the underlying socket is ready again the client will be returned on
        // the next call — no client is lost or re-created.
        if (globalRedisClient.isReady) {
            return globalRedisClient;
        }
        // A dropped connection and a not-yet-established one both leave
        // `isReady` false. Only the first is an outage, so warn only after an
        // established connection has been lost.
        if (hasRedisConnected) {
            warnRedisUnavailableOnce();
        }
        return null;
    }

    const url =
        process.env.REDIS_URL ||
        (process.env.NODE_ENV === "development"
            ? "redis://localhost:6379"
            : undefined);

    if (!url) {
        log.warn("Redis disabled: no REDIS_URL configured");
        return null;
    }

    try {
        globalRedisClient = createClient({ url });
        redisConnectPromise = null;
        hasRedisConnected = false;

        globalRedisClient.on("error", (error) => {
            log.error("Redis client error", { error });
        });

        globalRedisClient.on("ready", () => {
            hasRedisConnected = true;
            didWarnRedisUnavailable = false;
            log.info("Redis connection established");
        });

        globalRedisClient.on("end", () => {
            log.warn("Redis connection closed");
        });

        globalRedisClient.on("reconnecting", () => {
            log.debug("Redis reconnecting");
        });

        // Kick off connect eagerly so the client is ready by the first data request.
        redisConnectPromise = globalRedisClient.connect().then(
            () => undefined,
            (error) => {
                log.error("Redis initial connect failed", { error });
            }
        );

        // The first call creates the client before its socket is ready. Return
        // null now; getReadyRedisClient waits for the connect to settle.
        return null;
    } catch (error) {
        log.error("Failed to initialize Redis client", { error });
        return null;
    }
}

/**
 * Get a Redis client that has finished connecting, for callers that must fail
 * closed when Redis is configured but unreachable.
 *
 * The transient state where a freshly created client is still connecting is
 * waited out, so a cold start is not reported as an outage. A client that is
 * genuinely down (or reconnecting) still reports null after the bounded wait.
 * A deployment with no `REDIS_URL` returns null immediately.
 */
export async function getReadyRedisClient(): Promise<RedisClientType | null> {
    const client = getRedisClient();
    if (client) {
        return client;
    }
    if (!isRedisConfigured()) {
        return null;
    }

    await waitForRedisReady(REDIS_READY_WAIT_TIMEOUT_MS);

    const readyClient = getRedisClient();
    if (!readyClient) {
        warnRedisUnavailableOnce();
    }
    return readyClient;
}

/**
 * Close the Redis connection gracefully.
 * Important for proper cleanup in serverless environments.
 */
export async function closeRedisConnection(): Promise<void> {
    const client = globalRedisClient;
    globalRedisClient = null;
    redisConnectPromise = null;
    hasRedisConnected = false;
    if (!client) {
        return;
    }

    try {
        await client.close();
    } catch (error) {
        log.error("Error closing Redis connection", { error });
        try {
            client.destroy();
        } catch (destroyError) {
            log.debug("Redis destroy fallback failed during close", {
                error: destroyError,
            });
        }
    }
}

/**
 * Perform a health check on the Redis connection.
 * Throws a RedisConnectionError if the client is unavailable or unresponsive.
 */
export async function healthCheck(): Promise<void> {
    const redis = getRedisClient();

    if (!redis) {
        throw new RedisConnectionError({
            message: "Redis client is not available",
            operation: "healthCheck",
        });
    }

    try {
        await redis.ping();
    } catch (error) {
        throw new RedisConnectionError(
            {
                message: "Redis ping failed",
                operation: "healthCheck",
            },
            { cause: error }
        );
    }
}
