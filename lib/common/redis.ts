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

let globalRedisClient: RedisClientType | null = null;
let didWarnRedisUnavailable = false;

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
 * Get a Redis client instance.
 * Returns null in browser environments, when Redis is not configured, or
 * when the underlying socket has not connected yet (including during an
 * automatic reconnection). Callers already handle null throughout the
 * codebase via their existing degraded-path branches.
 *
 * The client auto-reconnects on disconnection. Once the socket is ready
 * again the returned value flips from null back to the client — no
 * instance is lost or re-created.
 *
 * While the client is present but not ready, this logs a WARN once per
 * outage so the degraded state is separable from "no REDIS_URL configured".
 */
export function getRedisClient(): RedisClientType | null {
    if (typeof window !== "undefined") {
        return null;
    }

    if (globalRedisClient) {
        // The client auto-reconnects after disconnection, but commands sent before
        // reconnection completes queue indefinitely (the offline queue is enabled by
        // default). Rather than returning a client that will hang callers, return null
        // so every caller's existing null-handling branch gracefully degrades.
        //
        // Once the underlying socket is ready again the client will be returned on
        // the next call — no client is lost or re-created.
        if (globalRedisClient.isReady) {
            didWarnRedisUnavailable = false;
            return globalRedisClient;
        }
        warnRedisUnavailableOnce();
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

        globalRedisClient.on("error", (error) => {
            log.error("Redis client error", { error });
        });

        globalRedisClient.on("connect", () => {
            log.info("Redis connection established");
        });

        globalRedisClient.on("end", () => {
            log.warn("Redis connection closed");
        });

        globalRedisClient.on("reconnecting", () => {
            log.debug("Redis reconnecting");
        });

        // Kick off connect eagerly so the client is ready by the first data request.
        globalRedisClient.connect().catch((error) => {
            log.error("Redis initial connect failed", { error });
        });

        if (globalRedisClient.isReady) {
            didWarnRedisUnavailable = false;
            return globalRedisClient;
        }
        warnRedisUnavailableOnce();
        return null;
    } catch (error) {
        log.error("Failed to initialize Redis client", { error });
        return null;
    }
}

/**
 * Close the Redis connection gracefully.
 * Important for proper cleanup in serverless environments.
 */
export async function closeRedisConnection(): Promise<void> {
    const client = globalRedisClient;
    globalRedisClient = null;
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
