import { abortAfterAny, abortReason } from "@/lib/common/abort";

const RESPONSE_BODY_TIMEOUT_RELEASE_KEY = Symbol.for(
    "cache.common.response-body-timeout-release"
);

type ReleaseResponseBodyTimeout = () => void;

/**
 * Fetch with a timeout that composes with any signal already present in `options`
 * (e.g. upstream timeouts or a client disconnect signal).
 *
 * The deadline covers the response body as well as the headers. An upstream
 * that sends headers and then stalls the body cannot keep the read waiting past
 * the deadline. Call {@link releaseResponseBodyTimeout} when the body is
 * streamed to a consumer that must outlive the request.
 */
export async function fetchWithTimeout(
    input: string,
    options: RequestInit,
    timeoutMs: number
): Promise<Response> {
    const signals = options.signal ? [options.signal] : [];

    const { signal, clearTimeout } = abortAfterAny(timeoutMs, ...signals);
    try {
        const response = await fetch(input, { ...options, signal });
        return trackResponseBodyDeadline(response, signal, clearTimeout);
    } catch (error) {
        clearTimeout();
        throw error;
    }
}

/**
 * Releases the deadline held by a response body that is handed to a consumer
 * instead of being read to completion. Idempotent; forgetting it only fails
 * safe (the stream ends at the deadline).
 */
export function releaseResponseBodyTimeout(response: Response): void {
    const release = Object.getOwnPropertyDescriptor(
        response,
        RESPONSE_BODY_TIMEOUT_RELEASE_KEY
    )?.value;
    if (isReleaseResponseBodyTimeout(release)) {
        release();
    }
}

function isReleaseResponseBodyTimeout(
    value: unknown
): value is ReleaseResponseBodyTimeout {
    return typeof value === "function";
}

/**
 * Wraps the response body so the deadline stays armed until the body is fully
 * consumed, cancelled, or errors. Without a body there is nothing to wait for,
 * so the deadline clears immediately.
 */
function trackResponseBodyDeadline(
    response: Response,
    signal: AbortSignal,
    clearTimeout: () => void
): Response {
    const body = response.body;
    if (body === null) {
        clearTimeout();
        return response;
    }

    const reader = body.getReader();
    let isSettled = false;
    let streamController:
        | ReadableStreamDefaultController<Uint8Array>
        | undefined;

    const releaseReader = () => {
        try {
            reader.releaseLock();
        } catch {
            // Reader is already released, or a read is still pending.
        }
    };

    const settle = () => {
        if (isSettled) {
            return;
        }
        isSettled = true;
        signal.removeEventListener("abort", handleAbort);
        clearTimeout();
    };

    function handleAbort() {
        const reason = abortReason(signal);
        // Error the wrapper first so a pending read rejects even when the
        // underlying body ignores the abort signal.
        try {
            streamController?.error(reason);
        } catch {
            // The stream already closed or errored.
        }
        settle();
        try {
            reader.cancel(reason).then(releaseReader, releaseReader);
        } catch {
            releaseReader();
        }
    }

    const trackedBody = new ReadableStream<Uint8Array>({
        async cancel(reason) {
            settle();
            try {
                await reader.cancel(reason);
            } catch {
                // The source stream already errored; the lock still releases.
            } finally {
                releaseReader();
            }
        },
        async pull(controller) {
            let next: Awaited<ReturnType<typeof reader.read>>;
            try {
                next = await reader.read();
            } catch (error) {
                settle();
                releaseReader();
                try {
                    controller.error(error);
                } catch {
                    // The stream was already errored by the abort listener.
                }
                return;
            }

            if (next.done) {
                settle();
                releaseReader();
                try {
                    controller.close();
                } catch {
                    // The stream already closed or errored.
                }
                return;
            }
            if (next.value !== undefined) {
                try {
                    controller.enqueue(next.value);
                } catch {
                    // The stream was already errored or cancelled.
                }
            }
        },
        start(controller) {
            streamController = controller;
        },
    });

    const trackedResponse = new Response(trackedBody, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
    });
    Object.defineProperty(trackedResponse, "url", { value: response.url });
    Object.defineProperty(trackedResponse, RESPONSE_BODY_TIMEOUT_RELEASE_KEY, {
        configurable: true,
        enumerable: false,
        value: settle,
    });

    if (signal.aborted) {
        handleAbort();
    } else {
        signal.addEventListener("abort", handleAbort, { once: true });
    }

    return trackedResponse;
}
