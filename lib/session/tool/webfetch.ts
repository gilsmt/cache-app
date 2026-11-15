import { tool } from "ai";
import * as z from "zod";
import { abortAfter, isAbortError, raceAbort } from "@/lib/common/abort";
import { HttpError } from "@/lib/common/http";
import { isHttpUrl } from "@/lib/common/url";
import type { AutomationAgentSource } from "../ai/runner";

const WebFetchInputSchema = z.object({
    // z.url() fails at WorkflowAgent tool schema compilation with unknown format "uri".
    // Use a plain string with a runtime check instead.
    url: z
        .string()
        .trim()
        .min(1)
        .max(4096)
        .refine(isHttpUrl, { error: "URL must be an http(s) URL." })
        .describe("Absolute http(s) URL, e.g. https://example.com/article."),
});

const WEB_FETCH_BODY_BYTES_MAX = 5 * 1024 * 1024;
const WEB_FETCH_TIMEOUT_MS = 15_000;
const WEB_FETCH_RETRY_BASE_DELAY_MS = 1000;
const WEB_FETCH_TOTAL_TIMEOUT_MS = 30_000;

const WEB_FETCH_REDIRECT_LIMIT = 5;

const WEB_FETCH_HEADERS: Record<string, string> = {
    Accept: "text/html, application/xhtml+xml, text/plain, application/json;q=0.9,*/*;q=0.8",
    "User-Agent": "CacheAutomationBot/1.0 (+https://www.cachd.app)",
};

export function buildWebFetchTool(state: { sources: AutomationAgentSource[] }) {
    return tool({
        description:
            "Fetch a public http(s) URL with SSRF protections and a bounded response body.",
        execute: async (input, { abortSignal }) => {
            const result = await webFetch({
                abortSignal,
                url: input.url,
            });
            if (
                result.ok &&
                typeof result.url === "string" &&
                isHttpUrl(result.url)
            ) {
                state.sources.push({
                    type: "web",
                    url: result.url,
                });
            }
            return result;
        },
        inputSchema: WebFetchInputSchema,
    });
}

export async function webFetch(args: {
    abortSignal?: AbortSignal;
    url: string;
}) {
    "use step";

    const { waitForRetry, withRetry } = await import("@/lib/common/retry");
    const {
        crossOriginSafeHeaders,
        fetchPublicHop,
        isRedirectStatus,
        readResponseText,
        resolvePublicHttpUrl,
        resolveRedirectLocation,
    } = await import("@/lib/common/security/fetch");

    const totalTimeout = abortAfter(WEB_FETCH_TOTAL_TIMEOUT_MS);
    const signal = args.abortSignal
        ? AbortSignal.any([args.abortSignal, totalTimeout.signal])
        : totalTimeout.signal;
    const startedAt = Date.now();

    try {
        let currentUrl = args.url;
        let hopHeaders: HeadersInit = WEB_FETCH_HEADERS;
        for (
            let redirectCount = 0;
            redirectCount <= WEB_FETCH_REDIRECT_LIMIT;
            redirectCount += 1
        ) {
            signal.throwIfAborted();
            const host = await raceAbort(
                resolvePublicHttpUrl(currentUrl),
                signal
            );
            if (!host) {
                return {
                    error: "URL is blocked because it points to a local or private host.",
                    ok: false,
                };
            }

            const requestHeaders = hopHeaders;
            const response = await withRetry(
                async () => {
                    const res = await fetchPublicHop(host, {
                        headers: requestHeaders,
                        method: "GET",
                        redirect: "manual",
                        signal,
                        timeoutMs: WEB_FETCH_TIMEOUT_MS,
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
                        if (retriesLeft <= 0 || !isRetryableFetchError(error)) {
                            return;
                        }
                        const remainingTimeoutMs = Math.max(
                            0,
                            WEB_FETCH_TOTAL_TIMEOUT_MS -
                                (Date.now() - startedAt)
                        );
                        await waitForRetry(
                            Math.min(
                                getFetchRetryDelayMs(attemptNumber, error),
                                remainingTimeoutMs
                            ),
                            signal
                        );
                    },
                    shouldRetry: ({ error }) => isRetryableFetchError(error),
                    signal,
                }
            );

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

            const body = await readResponseText(response, {
                maxBytes: WEB_FETCH_BODY_BYTES_MAX,
            });

            return {
                body,
                ok: response.ok,
                status: response.status,
                url: response.url || host.url.href,
            };
        }

        return {
            error: "URL redirected too many times.",
            ok: false,
        };
    } catch (error) {
        if (args.abortSignal?.aborted) {
            return { error: "URL fetch was aborted.", ok: false };
        }
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
    } finally {
        totalTimeout.clearTimeout();
    }
}

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

function isRetryableFetchError(error: unknown): boolean {
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

function getFetchRetryDelayMs(attemptNumber: number, error: unknown): number {
    if (
        HttpError.isInstance(error) &&
        error.retryAfter !== null &&
        Number.isFinite(error.retryAfter)
    ) {
        return Math.max(0, error.retryAfter);
    }
    return WEB_FETCH_RETRY_BASE_DELAY_MS * 2 ** (attemptNumber - 1);
}
