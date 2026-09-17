/**
 * Creates an AbortController that automatically aborts after a timeout.
 *
 * Uses bind() instead of arrow functions to avoid capturing the surrounding
 * scope in closures. Arrow functions like `() => controller.abort()` capture
 * request bodies and other large objects, preventing GC for the timer lifetime.
 *
 * @param ms Timeout in milliseconds
 * @returns Object with controller, signal, and clearTimeout function
 */
export function abortAfter(ms: number) {
    const controller = new AbortController();
    const id = setTimeout(controller.abort.bind(controller), ms);
    return {
        clearTimeout: () => globalThis.clearTimeout(id),
        controller,
        signal: controller.signal,
    };
}

/**
 * Combines multiple AbortSignals with a timeout.
 *
 * @param ms Timeout in milliseconds
 * @param signals Additional signals to combine
 * @returns Combined signal that aborts on timeout or when any input signal aborts
 */
export function abortAfterAny(ms: number, ...signals: AbortSignal[]) {
    const timeout = abortAfter(ms);
    const signal = AbortSignal.any([timeout.signal, ...signals]);
    return {
        clearTimeout: timeout.clearTimeout,
        signal,
    };
}

/**
 * Reads the abort reason from `signal`, synthesizing an `AbortError` when the
 * signal carries none (not-yet-aborted, or explicitly aborted with
 * `undefined`).
 */
export function abortReason(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/**
 * Returns true when the error is an AbortError, across realms.
 */
export function isAbortError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        error.name === "AbortError"
    );
}

/**
 * Awaits `promise` but settles early with an AbortError when `signal` aborts.
 *
 * Unlike threading the signal into the underlying work, aborting here never
 * cancels that work: `promise` keeps running and other consumers are
 * unaffected. Without a signal this returns `promise` unchanged.
 */
export function raceAbort<T>(
    promise: Promise<T>,
    signal?: AbortSignal
): Promise<T> {
    if (!signal) {
        return promise;
    }
    if (signal.aborted) {
        // Observe the abandoned promise so a later rejection cannot surface
        // as an unhandled rejection. The wrapper still rejects with the
        // signal's reason.
        promise.catch(() => undefined);
        return Promise.reject(abortReason(signal));
    }
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => {
            reject(abortReason(signal));
        };
        signal.addEventListener("abort", onAbort, { once: true });
        promise.then(
            (value) => {
                signal.removeEventListener("abort", onAbort);
                resolve(value);
            },
            (error: unknown) => {
                signal.removeEventListener("abort", onAbort);
                reject(error);
            }
        );
    });
}
