import { isAbortError } from "@/lib/common/abort";
import { isRecord } from "@/lib/common/object";

/**
 * Reads a response body as JSON. An unreadable or non-JSON body yields null,
 * matching a provider that answered without a JSON payload. Abort errors
 * propagate so the caller can report a timeout instead of a malformed response.
 */
export async function readResponseJson(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch (error) {
        if (isAbortError(error)) {
            throw error;
        }
        return null;
    }
}

export class HttpError extends Error {
    readonly retryAfter: number | null;
    readonly status: number;

    static isInstance(error: unknown): error is HttpError {
        return (
            isRecord(error) &&
            error.name === "HttpError" &&
            typeof error.status === "number" &&
            (error.retryAfter === null ||
                typeof error.retryAfter === "number") &&
            typeof error.isRetryable === "function"
        );
    }

    constructor(status: number, retryAfter?: number) {
        super(`HTTP ${status}`);
        this.name = "HttpError";
        this.status = status;
        this.retryAfter = retryAfter ?? null;
    }

    isRetryable(): boolean {
        return this.status >= 500 || this.status === 429 || this.status === 408;
    }
}
