import "server-only";

import {
    isLinkProbeCandidate,
    LINK_REACHABILITY_BATCH_MAX,
    type LibraryQualityItem,
    type LinkReachabilityStatus,
} from "@/lib/collections/library-quality";
import { isAbortError } from "@/lib/common/abort";
import { mapConcurrent } from "@/lib/common/array";
import { createLogger } from "@/lib/common/logs/console/logger";
import { getReadyRedisClient, isRedisConfigured } from "@/lib/common/redis";
import {
    type FetchHttpRedirectResult,
    fetchPublicRedirect,
} from "@/lib/common/security/fetch";
import { prisma } from "@/prisma";
import type { LibraryItemLinkReachability } from "@/prisma/client/client";

const log = createLogger("library:link-reachability");

export interface LinkReachabilityResult {
    checkedAt: string;
    itemId: string;
    status: LinkReachabilityStatus;
}

export interface ProbeLibraryItemsReachabilityOutcome {
    /** True when at least one row was written (fresh probe or skip stamp). */
    didPersist: boolean;
    rateLimited: boolean;
    results: LinkReachabilityResult[];
    retryAfterMs: number;
}

const PROBE_TIMEOUT_MS = 8000;
const PROBE_REDIRECT_LIMIT = 5;
const PROBE_CONCURRENCY = 5;
/** Sustain ~100 checks/min so a 2500-item library finishes in ~25 minutes. */
const PROBE_BUDGET_WINDOW_MS = 60_000;
const PROBE_BUDGET_MAX_PER_WINDOW = 100;
const PROBE_BUDGET_REDIS_KEY_PREFIX = "library:link-probe:budget:";
const PROBE_HEADERS = {
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "User-Agent": "CacheLinkCheck/1.0 (+https://www.cachd.app)",
} as const;

/** Process-local fallback when Redis is unavailable (single-instance only). */
const probeBudgetByUserId = new Map<
    string,
    { count: number; windowStartedAtMs: number }
>();

function localBudgetRetryAfterMs(
    windowStartedAtMs: number,
    now: number
): number {
    return Math.max(1000, PROBE_BUDGET_WINDOW_MS - (now - windowStartedAtMs));
}

function tryConsumeLocalProbeBudget(
    userId: string,
    amount: number
): { allowed: boolean; retryAfterMs: number } {
    if (amount <= 0) {
        return { allowed: true, retryAfterMs: 0 };
    }

    const now = Date.now();
    const current = probeBudgetByUserId.get(userId);
    if (!current || now - current.windowStartedAtMs >= PROBE_BUDGET_WINDOW_MS) {
        if (amount > PROBE_BUDGET_MAX_PER_WINDOW) {
            return { allowed: false, retryAfterMs: PROBE_BUDGET_WINDOW_MS };
        }
        probeBudgetByUserId.set(userId, {
            count: amount,
            windowStartedAtMs: now,
        });
        return { allowed: true, retryAfterMs: 0 };
    }
    if (current.count + amount > PROBE_BUDGET_MAX_PER_WINDOW) {
        return {
            allowed: false,
            retryAfterMs: localBudgetRetryAfterMs(
                current.windowStartedAtMs,
                now
            ),
        };
    }
    current.count += amount;
    return { allowed: true, retryAfterMs: 0 };
}

/**
 * Shared fixed-window budget for outbound probes.
 *
 * Redis holds the shared budget. When it is configured but unreachable the
 * budget cannot be enforced across isolates, so probes are refused rather
 * than fanned out; the client retries after the window. `getReadyRedisClient`
 * waits out the connect window of a freshly created client, so a cold start
 * is not read as an outage. A deployment with no `REDIS_URL` uses the
 * in-process Map, which still bounds a single local isolate.
 */
export async function consumeProbeBudget(
    userId: string,
    amount: number
): Promise<{ allowed: boolean; retryAfterMs: number }> {
    if (amount <= 0) {
        return { allowed: true, retryAfterMs: 0 };
    }

    const redis = await getReadyRedisClient({
        caller: "library:link-reachability",
        probes: amount,
    });
    if (!redis) {
        if (isRedisConfigured()) {
            log.warn("Link probe budget unavailable; refusing probes", {
                amount,
                userId,
            });
            return { allowed: false, retryAfterMs: PROBE_BUDGET_WINDOW_MS };
        }
        return tryConsumeLocalProbeBudget(userId, amount);
    }

    try {
        const key = `${PROBE_BUDGET_REDIS_KEY_PREFIX}${userId}`;
        const count = await redis.incrBy(key, amount);
        if (count === amount) {
            await redis.pExpire(key, PROBE_BUDGET_WINDOW_MS);
        }
        if (count > PROBE_BUDGET_MAX_PER_WINDOW) {
            // Roll back this claim so concurrent batches don't overshoot forever.
            await redis.decrBy(key, amount);
            const ttlMs = await redis.pTTL(key);
            return {
                allowed: false,
                retryAfterMs: Math.max(
                    1000,
                    ttlMs > 0 ? ttlMs : PROBE_BUDGET_WINDOW_MS
                ),
            };
        }
        return { allowed: true, retryAfterMs: 0 };
    } catch (error) {
        if (isRedisConfigured()) {
            log.warn("Link probe Redis budget failed; refusing probes", {
                amount,
                error,
                userId,
            });
            return { allowed: false, retryAfterMs: PROBE_BUDGET_WINDOW_MS };
        }
        log.warn("Link probe Redis budget failed; using local fallback", {
            error,
            userId,
        });
        return tryConsumeLocalProbeBudget(userId, amount);
    }
}

function classifyHttpStatus(status: number): LinkReachabilityStatus {
    if (status === 404 || status === 410) {
        return "unreachable";
    }
    if (status >= 200 && status < 400) {
        return "reachable";
    }
    if (status === 401 || status === 403 || status === 407 || status === 429) {
        return "ambiguous";
    }
    if (status >= 500) {
        return "ambiguous";
    }
    return "ambiguous";
}

function toPrismaReachability(
    status: LinkReachabilityStatus
): LibraryItemLinkReachability {
    return status;
}

async function probeHttpUrl(url: string): Promise<LinkReachabilityStatus> {
    let result: FetchHttpRedirectResult;
    try {
        result = await fetchPublicRedirect(url, {
            headers: PROBE_HEADERS,
            maxRedirects: PROBE_REDIRECT_LIMIT,
            method: "GET",
            timeoutMs: PROBE_TIMEOUT_MS,
        });
    } catch (error) {
        // Timeouts and transport failures are often transient; do not
        // treat them as confirmed dead links, but log for observability.
        log.warn("Link reachability probe transport failed", {
            aborted: isAbortError(error),
            error,
            url,
        });
        return "ambiguous";
    }

    if (result.status !== "response") {
        return "ambiguous";
    }

    await result.response.body?.cancel().catch(() => undefined);
    return classifyHttpStatus(result.response.status);
}

async function persistReachability(
    userId: string,
    itemId: string,
    status: LinkReachabilityStatus,
    checkedAt: Date
): Promise<void> {
    await prisma.libraryItem.updateMany({
        data: {
            linkCheckedAt: checkedAt,
            linkReachability: toPrismaReachability(status),
        },
        where: {
            deletedAt: null,
            id: itemId,
            userId,
        },
    });
}

export async function probeLibraryItemsReachability({
    itemIds,
    userId,
}: {
    itemIds: readonly string[];
    userId: string;
}): Promise<ProbeLibraryItemsReachabilityOutcome> {
    const uniqueIds = [...new Set(itemIds)].slice(
        0,
        LINK_REACHABILITY_BATCH_MAX
    );
    if (uniqueIds.length === 0) {
        return {
            didPersist: false,
            rateLimited: false,
            results: [],
            retryAfterMs: 0,
        };
    }

    const rows = await prisma.libraryItem.findMany({
        select: {
            id: true,
            kind: true,
            linkCheckedAt: true,
            linkReachability: true,
            source: true,
            url: true,
        },
        where: {
            deletedAt: null,
            id: { in: uniqueIds },
            userId,
        },
    });

    const rowById = new Map(rows.map((row) => [row.id, row]));
    const checkedAt = new Date();
    const checkedAtIso = checkedAt.toISOString();

    type WorkItem =
        | {
              itemId: string;
              kind: "already_checked";
              status: LinkReachabilityStatus;
              checkedAtIso: string;
          }
        | {
              itemId: string;
              kind: "skip";
              status: "skipped";
          }
        | {
              itemId: string;
              kind: "probe";
              url: string;
          };

    const work: WorkItem[] = uniqueIds.map((itemId) => {
        const row = rowById.get(itemId);
        if (!row) {
            return { itemId, kind: "skip", status: "skipped" };
        }

        if (row.linkCheckedAt !== null && row.linkReachability !== null) {
            return {
                checkedAtIso: row.linkCheckedAt.toISOString(),
                itemId,
                kind: "already_checked",
                status: row.linkReachability,
            };
        }

        const qualityItem: LibraryQualityItem = {
            id: row.id,
            kind: row.kind,
            source: row.source,
            url: row.url,
        };

        if (!isLinkProbeCandidate(qualityItem)) {
            return { itemId, kind: "skip", status: "skipped" };
        }

        return { itemId, kind: "probe", url: row.url };
    });

    const probeCount = work.filter((entry) => entry.kind === "probe").length;
    const budget = await consumeProbeBudget(userId, probeCount);
    if (!budget.allowed) {
        return {
            didPersist: false,
            rateLimited: true,
            results: [],
            retryAfterMs: budget.retryAfterMs,
        };
    }

    let didPersist = false;
    const results = await mapConcurrent(
        work,
        async (entry): Promise<LinkReachabilityResult> => {
            if (entry.kind === "already_checked") {
                return {
                    checkedAt: entry.checkedAtIso,
                    itemId: entry.itemId,
                    status: entry.status,
                };
            }

            if (entry.kind === "skip") {
                // Only stamp rows that exist for this user (missing ids no-op).
                if (rowById.has(entry.itemId)) {
                    await persistReachability(
                        userId,
                        entry.itemId,
                        "skipped",
                        checkedAt
                    );
                    didPersist = true;
                }
                return {
                    checkedAt: checkedAtIso,
                    itemId: entry.itemId,
                    status: "skipped",
                };
            }

            const status = await probeHttpUrl(entry.url);
            await persistReachability(userId, entry.itemId, status, checkedAt);
            didPersist = true;
            return {
                checkedAt: checkedAtIso,
                itemId: entry.itemId,
                status,
            };
        },
        PROBE_CONCURRENCY
    );

    return {
        didPersist,
        rateLimited: false,
        results,
        retryAfterMs: 0,
    };
}
