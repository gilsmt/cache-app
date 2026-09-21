import pRetry, { type Options } from "p-retry";
import { abortReason, isAbortError } from "@/lib/common/abort";
import { HttpError } from "@/lib/common/http";
import { isNetworkError } from "@/lib/common/network";

const DEFAULT_RETRIES = 2;
const DEFAULT_MIN_TIMEOUT_MS = 500;
const DEFAULT_FACTOR = 2;
const DEFAULT_MAX_TIMEOUT_MS = 10_000;

const DEFAULT_SHOULD_RETRY: NonNullable<Options["shouldRetry"]> = ({ error }) =>
    !isAbortError(error) &&
    (!HttpError.isInstance(error) ||
        error.isRetryable() ||
        isNetworkError(error));

export function withRetry<T>(
    input: (attemptNumber: number) => PromiseLike<T> | T,
    options: Options = {}
): Promise<T> {
    const {
        factor = DEFAULT_FACTOR,
        maxTimeout = DEFAULT_MAX_TIMEOUT_MS,
        minTimeout = DEFAULT_MIN_TIMEOUT_MS,
        retries = DEFAULT_RETRIES,
        shouldRetry = DEFAULT_SHOULD_RETRY,
        ...rest
    } = options;

    return pRetry(input, {
        ...rest,
        factor,
        maxTimeout,
        minTimeout,
        retries,
        shouldRetry,
    });
}

export function waitForRetry(
    delayMs: number,
    signal?: AbortSignal
): Promise<void> {
    if (signal?.aborted) {
        return Promise.reject(abortReason(signal));
    }

    if (delayMs <= 0) {
        return Promise.resolve();
    }

    if (!signal) {
        return new Promise((resolve) => {
            setTimeout(resolve, delayMs);
        });
    }

    return new Promise((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout> | undefined;

        const cleanup = () => {
            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
            signal.removeEventListener("abort", handleAbort);
        };

        const handleAbort = () => {
            cleanup();
            reject(abortReason(signal));
        };

        if (signal.aborted) {
            handleAbort();
            return;
        }

        signal.addEventListener("abort", handleAbort, { once: true });
        timer = setTimeout(() => {
            cleanup();
            resolve();
        }, delayMs);
    });
}
