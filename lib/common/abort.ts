const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Creates an AbortController that automatically aborts after a timeout.
 *
 * Call `clearTimeout` in a `finally` block once the guarded work settles,
 * so the timer does not hold the event loop past its use.
 *
 * @param ms Timeout in milliseconds, finite and within 0..MAX_TIMEOUT_MS
 * @returns Object with controller, signal, and clearTimeout function
 */
export function abortAfter(ms: number) {
    assertValidTimeoutMs(ms);
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    if (typeof id === "object") {
        id.unref();
    }
    return {
        clearTimeout: () => globalThis.clearTimeout(id),
        controller,
        signal: controller.signal,
    };
}

/**
 * Combines multiple AbortSignals with a timeout.
 *
 * Skips arming the timer when an input signal is already aborted. Call
 * `clearTimeout` in a `finally` block once the guarded work settles.
 *
 * @param ms Timeout in milliseconds, finite and within 0..MAX_TIMEOUT_MS
 * @param signals Additional signals to combine
 * @returns Combined signal that aborts on timeout or when any input signal aborts
 */
export function abortAfterAny(ms: number, ...signals: AbortSignal[]) {
    assertValidTimeoutMs(ms);
    if (signals.some((source) => source.aborted)) {
        return {
            clearTimeout: () => undefined,
            signal: AbortSignal.any(signals),
        };
    }
    const timeout = abortAfter(ms);
    const signal = AbortSignal.any([timeout.signal, ...signals]);
    return {
        clearTimeout: timeout.clearTimeout,
        signal,
    };
}

/**
 * Reads the abort reason from `signal`. Call only after `signal` aborts:
 * synthesizes an `AbortError` when the signal carries no reason
 * (explicitly aborted with `undefined`).
 */
export function abortReason(signal: AbortSignal): unknown {
    return signal.reason ?? new DOMException("Aborted", "AbortError");
}

/**
 * Returns true when the error is an abort or timeout, across realms.
 * Covers `AbortError` (manual abort, `abortAfter` deadlines) and
 * `TimeoutError` (`AbortSignal.timeout()`), which `fetch` rejects with
 * instead of `AbortError`.
 */
export function isAbortError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "name" in error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
    );
}

/**
 * Awaits `promise` but settles early with an AbortError when `signal` aborts.
 *
 * Unlike threading the signal into the underlying work, aborting here never
 * cancels that work: `promise` keeps running and other consumers are
 * unaffected. The rejection preserves a custom abort reason as-is, so check
 * `signal.aborted` to attribute the abort when `isAbortError` is false.
 * Without a signal this returns `promise` unchanged.
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

function assertValidTimeoutMs(ms: number): void {
    if (!(Number.isFinite(ms) && ms >= 0 && ms <= MAX_TIMEOUT_MS)) {
        throw new RangeError(
            `Timeout must be finite within 0..${MAX_TIMEOUT_MS}, got ${ms}`
        );
    }
}
