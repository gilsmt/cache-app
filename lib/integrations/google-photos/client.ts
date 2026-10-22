import { getErrorMessage } from "@/lib/common/error";
import { waitForRetry, withRetry } from "@/lib/common/retry";
import {
    IntegrationApiError,
    IntegrationConnectionError,
} from "@/lib/integrations/error";
import { PickerNotReadyError } from "./error";
import type { ImportResponse, SessionCreateResponse } from "./shared";
import {
    ImportResponseSchema,
    parseGooglePhotosDuration,
    SessionCreateResponseSchema,
    SessionPollResponseSchema,
} from "./shared";

function createGooglePhotosApiError(args: {
    cause?: unknown;
    message: string;
    operation: string;
    status: number;
}): IntegrationApiError {
    return new IntegrationApiError(
        {
            cause: args.cause,
            integrationId: "google-photos",
            message: args.message,
            operation: args.operation,
            status: args.status,
        },
        {
            cause: args.cause,
        }
    );
}

function createGooglePhotosConnectionError(args: {
    cause?: unknown;
    message: string;
    operation: string;
}): IntegrationConnectionError {
    return new IntegrationConnectionError(
        {
            cause: args.cause,
            integrationId: "google-photos",
            message: args.message,
            operation: args.operation,
        },
        {
            cause: args.cause,
        }
    );
}

async function createPickerSessionRequest(): Promise<SessionCreateResponse> {
    const response = await fetch(
        "/api/integrations/google-photos/picker/session",
        {
            method: "POST",
        }
    );
    const raw = await response.json().catch(() => null);
    const parsed = SessionCreateResponseSchema.safeParse(raw);

    if (!(response.ok && parsed.success)) {
        throw createGooglePhotosApiError({
            cause: raw,
            message: getErrorMessage(
                raw,
                "Could not start Google Photos Picker. Please reconnect Google and try again."
            ),
            operation: "createPickerSessionRequest",
            status: response.status,
        });
    }

    return parsed.data;
}

async function pollUntilMediaSelected(
    sessionId: string,
    accountId: string,
    timeoutIn: string | null
): Promise<void> {
    const startedAt = Date.now();
    const parsedSeconds = parseGooglePhotosDuration(timeoutIn);
    const timeoutMs =
        parsedSeconds === null || parsedSeconds <= 0
            ? 5 * 60_000
            : Math.round(parsedSeconds * 1000);

    await withRetry(
        async () => {
            if (Date.now() - startedAt >= timeoutMs) {
                throw createGooglePhotosConnectionError({
                    message:
                        "Selection timed out. Open the picker again and confirm your media.",
                    operation: "pollUntilMediaSelected",
                });
            }

            const response = await fetch(
                `/api/integrations/google-photos/picker/session?id=${encodeURIComponent(sessionId)}&accountId=${encodeURIComponent(accountId)}`,
                { method: "GET" }
            );
            const raw = await response.json().catch(() => null);
            const parsed = SessionPollResponseSchema.safeParse(raw);

            if (!(response.ok && parsed.success)) {
                throw createGooglePhotosApiError({
                    cause: raw,
                    message: getErrorMessage(
                        raw,
                        "Could not read picker status. Please try again."
                    ),
                    operation: "pollUntilMediaSelected",
                    status: response.status,
                });
            }

            if (parsed.data.mediaItemsSet) {
                return;
            }

            throw new PickerNotReadyError({
                pollIntervalMs: parsed.data.pollIntervalMs,
            });
        },
        {
            factor: 1,
            maxTimeout: 0,
            minTimeout: 0,
            onFailedAttempt: async ({ error, retriesLeft }) => {
                if (
                    retriesLeft <= 0 ||
                    !PickerNotReadyError.isInstance(error)
                ) {
                    return;
                }
                const remainingMs = Math.max(
                    0,
                    timeoutMs - (Date.now() - startedAt)
                );
                await waitForRetry(
                    Math.min(
                        Math.max(1000, error.data.pollIntervalMs),
                        remainingMs
                    )
                );
            },
            retries: Number.MAX_SAFE_INTEGER,
            shouldRetry: ({ error }) => PickerNotReadyError.isInstance(error),
        }
    );
}

async function importSelectedMedia(
    sessionId: string,
    accountId: string
): Promise<ImportResponse> {
    const response = await fetch(
        "/api/integrations/google-photos/picker/import",
        {
            body: JSON.stringify({ accountId, sessionId }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
        }
    );
    const raw = await response.json().catch(() => null);
    const parsed = ImportResponseSchema.safeParse(raw);

    if (!(response.ok && parsed.success)) {
        throw createGooglePhotosApiError({
            cause: raw,
            message: getErrorMessage(
                raw,
                "Import failed. Ensure Photos permission is granted, then try again."
            ),
            operation: "importSelectedMedia",
            status: response.status,
        });
    }

    return parsed.data;
}

/**
 * Executes the full Google Photos Picker flow: session creation, polling for selection, and import.
 *
 * @returns The number of imported items.
 */
export async function executeGooglePhotosPickerFlow(): Promise<{
    importedCount: number;
}> {
    const createPayload = await createPickerSessionRequest();

    if (!createPayload.pickerUri) {
        throw createGooglePhotosApiError({
            cause: createPayload,
            message: "Picker URL is missing. Please try again.",
            operation: "executeGooglePhotosPickerFlow",
            status: 502,
        });
    }

    window.open(createPayload.pickerUri, "_blank", "noopener,noreferrer");
    await pollUntilMediaSelected(
        createPayload.sessionId,
        createPayload.accountId,
        createPayload.timeoutIn
    );
    const importPayload = await importSelectedMedia(
        createPayload.sessionId,
        createPayload.accountId
    );

    return { importedCount: importPayload.importedCount };
}
