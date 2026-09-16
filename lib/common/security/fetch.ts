import type dns from "node:dns";
import * as ipaddr from "ipaddr.js";
import undici, { Agent } from "undici";
import { abortAfterAny } from "@/lib/common/abort";
import { createLogger } from "@/lib/common/logs/console/logger";
import { tryParseUrl } from "@/lib/common/url";
import { type ResolvedHost, resolveHostAddresses } from "./dns";
import { unwrapIpv6Brackets } from "./hostname";
import { isBlockedHostname, isIpLiteral, parseHttpUrl } from "./ssrf";

const PUBLIC_FETCH_DNS_TIMEOUT_MS = 15_000;

const log = createLogger("security/fetch");

const CROSS_ORIGIN_SAFE_HEADERS = [
    "accept",
    "accept-language",
    "range",
    "referer",
    "user-agent",
] as const;

const REQUEST_BODY_HEADER_NAMES = [
    "content-length",
    "content-type",
    "transfer-encoding",
] as const;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Budgets released early because the response body outlives the request
 * (streamed to a client). A string marker keeps the release operation working
 * when this shared package is loaded more than once in the same process.
 */
const RESPONSE_BODY_BUDGET_RELEASE_KEY = Symbol.for(
    "cache.common.response-body-budget-release"
);

function isResponseBodyBudgetReleaser(value: unknown): value is () => void {
    return typeof value === "function";
}

function setResponseBodyBudgetReleaser(
    response: Response,
    releaser: () => void
): void {
    Object.defineProperty(response, RESPONSE_BODY_BUDGET_RELEASE_KEY, {
        configurable: true,
        enumerable: false,
        value: releaser,
    });
}

function getResponseBodyBudgetReleaser(
    response: Response
): (() => void) | undefined {
    const value = Object.getOwnPropertyDescriptor(
        response,
        RESPONSE_BODY_BUDGET_RELEASE_KEY
    )?.value;
    return isResponseBodyBudgetReleaser(value) ? value : undefined;
}

export interface PublicHttpUrl {
    /** The validated public address to pin the connection to. */
    preferredAddress: string;
    url: URL;
}

/**
 * Resolves every published address of an absolute HTTP(S) URL and keeps the
 * host only if all of them are public unicast. The connect must be pinned to
 * `preferredAddress` (via {@link createPinnedAgent}); the bare hostname is
 * never re-resolved at socket time, which closes the DNS-rebinding race
 * between an SSRF check and the fetch it authorizes.
 */
export async function resolvePublicHttpUrl(
    raw: string | URL
): Promise<PublicHttpUrl | null> {
    const parsed = parseHttpUrl(typeof raw === "string" ? raw : raw.href);
    if (!parsed) {
        return null;
    }
    if (isBlockedHostname(parsed.hostname)) {
        return null;
    }

    // A public IP literal is its own validated address: DNS would only echo
    // it back, and `dns.lookup` rejects bracketed IPv6, so pin the literal
    // directly instead of resolving (which made public literals fail closed).
    const literalAddress = unwrapIpv6Brackets(parsed.hostname);
    if (isIpLiteral(literalAddress)) {
        return { preferredAddress: literalAddress, url: parsed };
    }

    let resolved: ResolvedHost;
    try {
        resolved = await resolveHostAddresses(parsed.hostname, {
            timeoutMs: PUBLIC_FETCH_DNS_TIMEOUT_MS,
        });
    } catch {
        log.debug("Public URL DNS resolution failed", {
            host: parsed.hostname,
        });
        return null;
    }

    if (resolved.addresses.some((address) => isBlockedHostname(address))) {
        return null;
    }

    return { preferredAddress: resolved.preferred, url: parsed };
}

/**
 * A dispatcher whose lookup hands Node only the validated address, so the
 * socket connects to that address while TLS SNI and the Host header keep the
 * public hostname. Each (host, pinned address) pair needs its own pool; an
 * Agent is intentionally kept unreferenced after its request so undici's
 * WeakRef bookkeeping reclaims it once the response stream is done.
 */
export function createPinnedAgent(host: PublicHttpUrl): Agent {
    const hostname = host.url.hostname;
    const family = ipaddr.IPv6.isValid(host.preferredAddress) ? 6 : 4;

    return new Agent({
        connect: {
            lookup: (
                lookupHostname: string,
                options: dns.LookupOptions,
                callback: (
                    err: NodeJS.ErrnoException | null,
                    address: string | dns.LookupAddress[],
                    family?: number
                ) => void
            ) => {
                if (lookupHostname !== hostname) {
                    // Node invokes the callback with only the error on failure;
                    // the address slot is irrelevant then but required by the
                    // declared lookup signature.
                    callback(
                        new Error(
                            `Pinned agent refused ${lookupHostname} (expected ${hostname})`
                        ),
                        ""
                    );
                    return;
                }
                if (options.all) {
                    callback(null, [
                        { address: host.preferredAddress, family },
                    ]);
                    return;
                }
                callback(null, host.preferredAddress, family);
            },
        },
        connections: 1,
    });
}

/**
 * Runs a single, manually-controlled request against a pinned agent. Unlike
 * {@link fetchPublicRedirect}, redirects are not followed — the caller owns
 * the redirect walk (e.g. to apply per-hop retries/backoff).
 *
 * The operation budget (`timeoutMs` and the caller's signal) covers the body
 * read as well as the headers: a host that stalls after its headers aborts
 * the read instead of hanging it. The budget is released exactly when the
 * body is consumed, cancelled, or errors; a body handed to a downstream
 * consumer (e.g. streamed to a client) outlives the request and must be
 * released explicitly with {@link releaseResponseBodyBudget}.
 */
export async function fetchPublicHop(
    host: PublicHttpUrl,
    options: {
        timeoutMs: number;
        headers?: HeadersInit;
        method?: string;
        redirect?: "manual" | "follow" | "error";
        signal?: AbortSignal;
    }
): Promise<Response> {
    const { signal, clearTimeout } = abortAfterAny(
        options.timeoutMs,
        ...(options.signal ? [options.signal] : [])
    );
    try {
        const response = (await undici.fetch(host.url.href, {
            dispatcher: createPinnedAgent(host),
            headers: options.headers,
            method: options.method,
            redirect: options.redirect ?? "manual",
            signal,
        })) as unknown as Response;
        return budgetResponseBody(response, clearTimeout);
    } catch (error) {
        clearTimeout();
        log.debug("Pinned fetch failed", { host: host.url.hostname });
        throw error;
    }
}

/**
 * The DOM lib's `Transformer` type omits the spec's `cancel` hook, which
 * streams call when the readable side is cancelled (a body discarded without
 * being read); the budget must release on that path too.
 */
type ResponseBodyTransformer = Transformer<
    Uint8Array<ArrayBuffer>,
    Uint8Array<ArrayBuffer>
> & {
    cancel?: () => void;
};

/**
 * Keeps the operation budget armed until the response body settles by
 * wrapping it so the timer clears exactly when the body is consumed,
 * cancelled, or errors. `url` cannot be set through the Response constructor,
 * so it is copied over — callers resolve relative links against it.
 */
function budgetResponseBody(
    response: Response,
    clearTimeout: () => void
): Response {
    const body = response.body;
    if (body === null) {
        clearTimeout();
        return response;
    }

    const budgetTransformer: ResponseBodyTransformer = {
        cancel: clearTimeout,
        flush: clearTimeout,
    };
    const budgetedBody = body.pipeThrough(
        new TransformStream(budgetTransformer)
    );
    const budgeted = new Response(budgetedBody, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
    });
    Object.defineProperty(budgeted, "url", { value: response.url });
    setResponseBodyBudgetReleaser(budgeted, clearTimeout);
    return budgeted;
}

/**
 * Releases the abort budget of a response whose body is being streamed to a
 * client, so the client's disconnect signal bounds the read instead of the
 * operation timeout. One-way and idempotent; forgetting it only fails safe
 * (the stream ends at the timeout).
 */
export function releaseResponseBodyBudget(response: Response): void {
    getResponseBodyBudgetReleaser(response)?.();
}

export interface BoundedBodyText {
    /** At most `maxChars` code units of the decoded body text. */
    text: string;
    /** True when the body carried more content than the cap allowed. */
    truncated: boolean;
}

/**
 * Reads an untrusted response body within a character budget instead of
 * buffering it whole (`response.text()` reads until the connection ends).
 * The body decodes incrementally so memory stays bounded by the cap, and the
 * stream is cancelled the moment the budget overflows or a read fails —
 * which releases this response's abort budget through its cancel hook.
 */
export async function readBodyText(
    response: Response,
    options: { maxChars: number }
): Promise<BoundedBodyText> {
    const body = response.body;
    if (body === null) {
        return { text: "", truncated: false };
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            text += decoder.decode(value, { stream: true });
            if (text.length > options.maxChars) {
                await reader.cancel().catch(() => undefined);
                return {
                    text: sliceToUtf16Boundary(text, options.maxChars),
                    truncated: true,
                };
            }
        }
        text += decoder.decode();
        if (text.length > options.maxChars) {
            return {
                text: sliceToUtf16Boundary(text, options.maxChars),
                truncated: true,
            };
        }
        return { text, truncated: false };
    } catch (error) {
        await reader.cancel().catch(() => undefined);
        throw error;
    } finally {
        try {
            reader.releaseLock();
        } catch {
            // Reader already released or the stream errored.
        }
    }
}

/**
 * Truncates to `maxChars` code units without splitting a UTF-16 surrogate
 * pair. The cap is counted in JS code units, so a cut can land between the
 * two halves of one code point; roll back the incomplete pair so no lone
 * surrogate is ever emitted to downstream parsers.
 */
function sliceToUtf16Boundary(text: string, maxChars: number): string {
    let end = Math.min(text.length, maxChars);
    if (end <= 0) {
        return "";
    }
    const lastCodeUnit = text.charCodeAt(end - 1);
    if (lastCodeUnit >= 0xd8_00 && lastCodeUnit <= 0xdb_ff) {
        end -= 1;
    }
    return text.slice(0, end);
}

export type FetchHttpRedirectResult =
    | { status: "response"; response: Response }
    | { status: "blocked" }
    | { status: "too_many_redirects" }
    | { status: "redirect_without_location" };

/**
 * Resolves, pins, and walks redirects, re-validating + re-pinning each hop.
 * The boundary is the only place a user-supplied host is turned into a socket.
 * The per-hop budget covers body reads too; a caller that streams the final
 * body to a client releases it with {@link releaseResponseBodyBudget}.
 */
export async function fetchPublicRedirect(
    initialUrl: string | URL,
    options: {
        timeoutMs: number;
        maxRedirects: number;
        headers?: HeadersInit;
        method?: string;
        signal?: AbortSignal;
    }
): Promise<FetchHttpRedirectResult> {
    let currentUrl = initialUrl;
    let method = options.method ?? "GET";
    // Every hop keeps the caller's headers until a rewrite (method to GET or
    // a cross-origin redirect) narrows them; the narrowed set is then reused
    // for the rest of the chain (Fetch redirect semantics never re-add).
    let hopHeaders: Headers | undefined;

    for (
        let redirectCount = 0;
        redirectCount <= options.maxRedirects;
        redirectCount += 1
    ) {
        const host = await resolvePublicHttpUrl(currentUrl);
        if (!host) {
            log.warn("Blocked URL fetch", {
                host: bestEffortHostname(currentUrl),
            });
            return { status: "blocked" };
        }

        const response = await fetchPublicHop(host, {
            headers: hopHeaders ?? options.headers,
            method,
            signal: options.signal,
            timeoutMs: options.timeoutMs,
        });
        if (!isRedirectStatus(response.status)) {
            return { response, status: "response" };
        }

        const location = response.headers.get("location");
        await discardResponseBody(response, host.url);
        if (!location) {
            return { status: "redirect_without_location" };
        }

        const redirectUrl = resolveRedirectLocation(location, host.url);
        if (!redirectUrl) {
            log.warn("Blocked redirect target", { host: host.url.hostname });
            return { status: "blocked" };
        }

        // Fetch redirect rules: POST becomes GET on 301/302, anything but
        // GET/HEAD becomes GET on 303; 307/308 keep method and body. A
        // rewrite to GET drops the request-body headers with the body.
        const nextMethod = nextRedirectMethod(response.status, method);
        if (nextMethod !== method) {
            method = nextMethod;
            hopHeaders = withoutRequestBodyHeaders(
                hopHeaders ?? options.headers
            );
        }

        if (redirectUrl.origin !== host.url.origin) {
            hopHeaders = crossOriginSafeHeaders(hopHeaders ?? options.headers);
        }

        currentUrl = redirectUrl.href;
    }

    return { status: "too_many_redirects" };
}

export function isRedirectStatus(status: number): boolean {
    return REDIRECT_STATUSES.has(status);
}

export function resolveRedirectLocation(
    location: string,
    baseUrl: URL
): URL | null {
    const resolved = tryParseUrl(location, baseUrl);
    if (!resolved) {
        return null;
    }
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
        return null;
    }
    return resolved;
}

/**
 * The method for the next redirect hop per Fetch rules: POST becomes GET on
 * 301/302, anything but GET/HEAD becomes GET on 303; all else is preserved.
 * Methods compare byte-case-insensitively, matching the Fetch spec, so a
 * lowercase "post" still loses its body headers on the rewrite.
 */
export function nextRedirectMethod(status: number, method: string): string {
    const normalizedMethod = method.toUpperCase();
    if ((status === 301 || status === 302) && normalizedMethod === "POST") {
        return "GET";
    }
    if (
        status === 303 &&
        normalizedMethod !== "GET" &&
        normalizedMethod !== "HEAD"
    ) {
        return "GET";
    }
    return method;
}

export function withoutRequestBodyHeaders(
    headers: HeadersInit | undefined
): Headers {
    const next = new Headers(headers);
    for (const name of REQUEST_BODY_HEADER_NAMES) {
        next.delete(name);
    }
    return next;
}

/**
 * Default-deny filter for cross-origin redirect hops: caller-supplied headers
 * pass only if allowlisted, so a redirect to another origin cannot exfiltrate
 * credentials or other sensitive caller headers. The referer crosses origins
 * reduced to its origin only, mirroring the browser default
 * `strict-origin-when-cross-origin`: hotlink protection matches on the
 * origin, and the full page path need not cross origins.
 */
export function crossOriginSafeHeaders(
    headers: HeadersInit | undefined
): Headers {
    const source = new Headers(headers);
    const next = new Headers();
    for (const name of CROSS_ORIGIN_SAFE_HEADERS) {
        const value = source.get(name);
        if (value === null) {
            continue;
        }
        if (name === "referer") {
            const origin = refererOrigin(value);
            if (origin !== null) {
                next.set(name, origin);
            }
            continue;
        }
        next.set(name, value);
    }
    return next;
}

function refererOrigin(referer: string): string | null {
    const parsed = tryParseUrl(referer);
    return parsed ? `${parsed.origin}/` : null;
}

/**
 * Hostname for block-event logs. The raw value may be any attacker-supplied
 * string, so parsing here must never throw.
 */
function bestEffortHostname(url: string | URL): string | null {
    return (
        tryParseUrl(typeof url === "string" ? url : url.href)?.hostname ?? null
    );
}

async function discardResponseBody(
    response: Response,
    url: URL
): Promise<void> {
    try {
        await response.body?.cancel();
    } catch (error) {
        // The body is being discarded deliberately; a cancel failure only
        // delays connection release, so surface it instead of failing the
        // redirect chain.
        log.warn("Failed to cancel discarded response body", {
            error: error instanceof Error ? error.message : String(error),
            host: url.hostname,
        });
    }
}
