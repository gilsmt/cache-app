import "server-only";

import { abortAfter, isAbortError } from "@/lib/common/abort";
import { HttpError } from "@/lib/common/http";
import { waitForRetry, withRetry } from "@/lib/common/retry";
import {
    crossOriginSafeHeaders,
    fetchPublicHop,
    isRedirectStatus,
    readBodyText,
    resolvePublicHttpUrl,
    resolveRedirectLocation,
} from "@/lib/common/security/fetch";
import { escapeLikePattern, truncateText } from "@/lib/common/string";
import { prisma } from "@/prisma";
import { AutomationPayloadScope } from "@/prisma/client/enums";
import {
    AUTOMATION_ITEM_PAGE_LIMIT_DEFAULT,
    AUTOMATION_ITEM_PAGE_LIMIT_MAX,
    AUTOMATION_TEXT_PREVIEW_LENGTH_MAX,
    AUTOMATION_WEB_FETCH_BODY_LENGTH_MAX,
    AUTOMATION_WEB_FETCH_RETRY_ATTEMPTS,
    AUTOMATION_WEB_FETCH_RETRY_BASE_DELAY_MS,
    AUTOMATION_WEB_FETCH_TIMEOUT_MS,
    AUTOMATION_WEB_FETCH_TOTAL_TIMEOUT_MS,
} from "./constants";

const AUTOMATION_WEB_FETCH_REDIRECT_LIMIT = 5;
const AUTOMATION_WEB_FETCH_CAPTCHA_SCAN_BYTES = 4096;

const AUTOMATION_WEB_FETCH_HEADERS: Record<string, string> = {
    Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8",
    "User-Agent": "CacheAutomationBot/1.0 (+https://www.cachd.app)",
};

function isRetryableStatus(status: number): boolean {
    return status >= 500 || status === 429 || status === 408;
}

function parseRetryAfterMs(response: {
    headers: { get: (key: string) => string | null };
}): number | null {
    const header = response.headers.get("retry-after");
    if (!header) {
        return null;
    }

    const seconds = Number(header);
    if (Number.isFinite(seconds)) {
        return Math.max(0, seconds * 1000);
    }

    const date = new Date(header);
    return Number.isNaN(date.getTime())
        ? null
        : Math.max(0, date.getTime() - Date.now());
}

function isRetryableAutomationError(error: unknown): boolean {
    if (HttpError.isInstance(error)) {
        return error.isRetryable();
    }
    if (error instanceof Error) {
        return (
            error.message.includes("aborted") ||
            error.message.includes("fetch failed")
        );
    }
    return true;
}

function getAutomationRetryDelayMs(
    attemptNumber: number,
    error: unknown
): number {
    if (
        HttpError.isInstance(error) &&
        error.retryAfter !== null &&
        Number.isFinite(error.retryAfter)
    ) {
        return Math.max(0, error.retryAfter);
    }
    return AUTOMATION_WEB_FETCH_RETRY_BASE_DELAY_MS * 2 ** (attemptNumber - 1);
}

function hasCaptchaChallenge(text: string): boolean {
    const scanText = text
        .slice(0, AUTOMATION_WEB_FETCH_CAPTCHA_SCAN_BYTES)
        .toLowerCase();
    return (
        scanText.includes("g-recaptcha") ||
        scanText.includes("h-captcha") ||
        scanText.includes("cf-challenge") ||
        scanText.includes("_cf_chl_opt") ||
        scanText.includes("turnstile") ||
        scanText.includes("just a moment") ||
        scanText.includes("checking your browser") ||
        scanText.includes("please verify you are human") ||
        scanText.includes("challenge-platform")
    );
}

interface AutomationRunPayloadScope {
    collectionIdSnapshot: string | null;
    payloadScopeSnapshot: AutomationPayloadScope;
    userId: string;
}

export async function getAutomationPayloadSummary(args: { runId: string }) {
    "use step";

    const run = await getAutomationRunPayloadScope(args.runId);
    if (!run) {
        return {
            itemCount: 0,
            scope: "missing",
        };
    }

    const itemCount = await prisma.libraryItem.count({
        where: getPayloadWhere(run),
    });

    return {
        itemCount,
        scope:
            run.payloadScopeSnapshot === AutomationPayloadScope.collection
                ? "collection"
                : "all_library_items",
        truncated: false,
    };
}

export async function listAutomationPayloadItems(args: {
    cursor?: string;
    limit?: number;
    runId: string;
    search?: string;
}) {
    "use step";

    const run = await getAutomationRunPayloadScope(args.runId);
    if (!run) {
        return {
            items: [],
            nextCursor: null,
            truncated: false,
        };
    }

    const limit = Math.min(
        args.limit ?? AUTOMATION_ITEM_PAGE_LIMIT_DEFAULT,
        AUTOMATION_ITEM_PAGE_LIMIT_MAX
    );
    const items = await prisma.libraryItem.findMany({
        cursor: args.cursor ? { id: args.cursor } : undefined,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
            caption: true,
            collections: {
                orderBy: {
                    name: "asc",
                },
                select: {
                    id: true,
                    name: true,
                },
            },
            createdAt: true,
            id: true,
            kind: true,
            noteContentText: true,
            postedAt: true,
            source: true,
            updatedAt: true,
            url: true,
        },
        skip: args.cursor ? 1 : 0,
        take: limit + 1,
        where: {
            ...getPayloadWhere(run),
            ...(args.search
                ? {
                      OR: [
                          {
                              caption: {
                                  contains: escapeLikePattern(args.search),
                                  mode: "insensitive",
                              },
                          },
                          {
                              noteContentText: {
                                  contains: escapeLikePattern(args.search),
                                  mode: "insensitive",
                              },
                          },
                          {
                              url: {
                                  contains: escapeLikePattern(args.search),
                                  mode: "insensitive",
                              },
                          },
                      ],
                  }
                : {}),
        },
    });

    const visibleItems = items.slice(0, limit);
    const nextCursor =
        items.length > limit ? (visibleItems.at(-1)?.id ?? null) : null;

    return {
        items: visibleItems.map((item) => ({
            caption: item.caption,
            collectionNames: item.collections.map(
                (collection) => collection.name
            ),
            createdAt: item.createdAt.toISOString(),
            id: item.id,
            kind: item.kind,
            postedAt: item.postedAt?.toISOString() ?? null,
            source: item.source,
            textPreview: item.noteContentText
                ? truncateText(
                      item.noteContentText,
                      AUTOMATION_TEXT_PREVIEW_LENGTH_MAX
                  )
                : null,
            updatedAt: item.updatedAt.toISOString(),
            url: item.url,
        })),
        nextCursor,
        truncated: !!nextCursor,
    };
}

export async function automationWebFetch(args: { url: string }) {
    "use step";

    const totalTimeout = abortAfter(AUTOMATION_WEB_FETCH_TOTAL_TIMEOUT_MS);
    const startedAt = Date.now();

    try {
        let currentUrl = args.url;
        let hopHeaders: HeadersInit = AUTOMATION_WEB_FETCH_HEADERS;
        for (
            let redirectCount = 0;
            redirectCount <= AUTOMATION_WEB_FETCH_REDIRECT_LIMIT;
            redirectCount += 1
        ) {
            const host = await resolvePublicHttpUrl(currentUrl);
            if (!host) {
                return {
                    error: "URL is blocked because it points to a local or private host.",
                    ok: false,
                };
            }

            let response: Response;
            try {
                response = await withRetry(
                    async () => {
                        const res = await fetchPublicHop(host, {
                            headers: hopHeaders,
                            method: "GET",
                            redirect: "manual",
                            signal: totalTimeout.signal,
                            timeoutMs: AUTOMATION_WEB_FETCH_TIMEOUT_MS,
                        });

                        if (isRetryableStatus(res.status)) {
                            await res.body?.cancel().catch(() => undefined);
                            throw new HttpError(
                                res.status,
                                parseRetryAfterMs(res) ?? undefined
                            );
                        }

                        return res;
                    },
                    {
                        factor: 1,
                        maxTimeout: 0,
                        minTimeout: 0,
                        onFailedAttempt: async ({
                            attemptNumber,
                            error,
                            retriesLeft,
                        }) => {
                            if (
                                retriesLeft <= 0 ||
                                !isRetryableAutomationError(error)
                            ) {
                                return;
                            }
                            const remainingTimeoutMs = Math.max(
                                0,
                                AUTOMATION_WEB_FETCH_TOTAL_TIMEOUT_MS -
                                    (Date.now() - startedAt)
                            );
                            await waitForRetry(
                                Math.min(
                                    getAutomationRetryDelayMs(
                                        attemptNumber,
                                        error
                                    ),
                                    remainingTimeoutMs
                                ),
                                totalTimeout.signal
                            );
                        },
                        retries: AUTOMATION_WEB_FETCH_RETRY_ATTEMPTS - 1,
                        shouldRetry: ({ error }) =>
                            isRetryableAutomationError(error),
                        signal: totalTimeout.signal,
                    }
                );
            } catch (error) {
                if (isAbortError(error)) {
                    return {
                        error: "URL fetch timed out.",
                        ok: false,
                    };
                }
                const message =
                    error instanceof Error ? error.message : "Unknown error";
                return {
                    error: `Failed to fetch URL: ${message}`,
                    ok: false,
                };
            }

            if (isRedirectStatus(response.status)) {
                const location = response.headers.get("location");
                await response.body?.cancel().catch(() => undefined);
                if (!location) {
                    return {
                        error: "URL redirected without a Location header.",
                        ok: false,
                        status: response.status,
                        url: host.url.href,
                    };
                }
                const redirectUrl = resolveRedirectLocation(location, host.url);
                if (!redirectUrl) {
                    return {
                        error: "URL redirected to an invalid or unsupported location.",
                        ok: false,
                        status: response.status,
                        url: host.url.href,
                    };
                }
                if (redirectUrl.origin !== host.url.origin) {
                    hopHeaders = crossOriginSafeHeaders(hopHeaders);
                }
                currentUrl = redirectUrl.href;
                continue;
            }

            const body = await readBodyText(response, {
                maxChars: AUTOMATION_WEB_FETCH_BODY_LENGTH_MAX,
            });

            if (hasCaptchaChallenge(body.text)) {
                return {
                    error: "URL triggered a browser challenge or CAPTCHA and could not be fetched.",
                    ok: false,
                    status: response.status,
                    url: response.url || host.url.href,
                };
            }

            return {
                body: body.text,
                ok: response.ok,
                status: response.status,
                truncated: body.truncated,
                url: response.url || host.url.href,
            };
        }

        return {
            error: "URL redirected too many times.",
            ok: false,
        };
    } finally {
        totalTimeout.clearTimeout();
    }
}

function getPayloadWhere(run: AutomationRunPayloadScope) {
    return {
        ...(run.payloadScopeSnapshot === AutomationPayloadScope.collection
            ? {
                  collections: {
                      some: {
                          id: run.collectionIdSnapshot ?? "",
                      },
                  },
              }
            : {}),
        deletedAt: null,
        userId: run.userId,
    };
}

function getAutomationRunPayloadScope(
    runId: string
): Promise<AutomationRunPayloadScope | null> {
    return prisma.automationRun.findUnique({
        select: {
            collectionIdSnapshot: true,
            payloadScopeSnapshot: true,
            userId: true,
        },
        where: {
            id: runId,
        },
    });
}
