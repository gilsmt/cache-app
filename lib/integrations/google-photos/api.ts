import "server-only";

import * as z from "zod";
import { isAbortError } from "@/lib/common/abort";
import { readResponseJson } from "@/lib/common/http";
import { createLogger } from "@/lib/common/logs/console/logger";
import { fetchWithTimeout } from "@/lib/common/timeout";
import { IntegrationApiError } from "@/lib/integrations/error";
import type {
    GooglePhotosPickedMediaItem,
    GooglePhotosPickerSession,
} from "./shared";
import {
    GooglePhotosMediaItemsPageSchema,
    GooglePhotosPickerSessionSchema,
    parseGooglePhotosDuration,
} from "./shared";

const log = createLogger("google-photos:api");

const GOOGLE_PHOTOS_PICKER_API = "https://photospicker.googleapis.com/v1";
const GOOGLE_PHOTOS_PICKER_TIMEOUT_MS = 30_000;
const TRAILING_SLASHES_PATTERN = /\/+$/u;

const PickerApiErrorSchema = z.object({
    error: z
        .object({
            code: z.number().optional(),
            message: z.string().optional(),
            status: z.string().optional(),
        })
        .optional(),
});

async function pickerFetch(
    accessToken: string,
    pathname: string,
    init: RequestInit = {}
): Promise<unknown> {
    try {
        const response = await fetchWithTimeout(
            `${GOOGLE_PHOTOS_PICKER_API}${pathname}`,
            {
                ...init,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                    ...(init.headers ?? {}),
                },
            },
            GOOGLE_PHOTOS_PICKER_TIMEOUT_MS
        );

        if (!response.ok) {
            const maybeJson = await readResponseJson(response);
            const parsedError = PickerApiErrorSchema.safeParse(maybeJson);
            if (!parsedError.success) {
                log.debug(
                    "Picker API error body did not match expected schema",
                    {
                        error: parsedError.error,
                        raw: maybeJson,
                    }
                );
            }
            const apiMessage =
                parsedError.data?.error?.message ?? response.statusText;
            throw new IntegrationApiError({
                integrationId: "google-photos",
                message: apiMessage,
                operation: "pickerFetch",
                status: response.status,
            });
        }

        return await response.json();
    } catch (error) {
        if (isAbortError(error)) {
            throw new IntegrationApiError(
                {
                    integrationId: "google-photos",
                    message: "Google Photos took too long to respond.",
                    operation: "pickerFetch",
                    status: 504,
                },
                { cause: error }
            );
        }
        throw error;
    }
}

export async function createPickerSession(
    accessToken: string
): Promise<GooglePhotosPickerSession> {
    const raw = await pickerFetch(accessToken, "/sessions", {
        body: "{}",
        method: "POST",
    });
    return GooglePhotosPickerSessionSchema.parse(raw);
}

export async function getPickerSession(
    accessToken: string,
    sessionId: string
): Promise<GooglePhotosPickerSession> {
    const raw = await pickerFetch(
        accessToken,
        `/sessions/${encodeURIComponent(sessionId)}`
    );
    return GooglePhotosPickerSessionSchema.parse(raw);
}

export async function deletePickerSession(
    accessToken: string,
    sessionId: string
): Promise<void> {
    await pickerFetch(
        accessToken,
        `/sessions/${encodeURIComponent(sessionId)}`,
        { method: "DELETE" }
    );
}

export async function listPickedMediaItems(
    accessToken: string,
    sessionId: string
): Promise<GooglePhotosPickedMediaItem[]> {
    const items: GooglePhotosPickedMediaItem[] = [];
    let nextPageToken: string | undefined;

    do {
        const params = new URLSearchParams({ sessionId });
        if (nextPageToken) {
            params.set("pageToken", nextPageToken);
        }
        const raw = await pickerFetch(
            accessToken,
            `/mediaItems?${params.toString()}`
        );
        const page = GooglePhotosMediaItemsPageSchema.parse(raw);
        items.push(...page.mediaItems);
        nextPageToken = page.nextPageToken;
    } while (nextPageToken);

    return items;
}

export function withPickerAutoclose(pickerUri: string): string {
    const clean = pickerUri.replace(TRAILING_SLASHES_PATTERN, "");
    return clean.endsWith("/autoclose") ? clean : `${clean}/autoclose`;
}

export function pickerPollIntervalMs(pollInterval: string | undefined): number {
    const seconds = parseGooglePhotosDuration(pollInterval);
    if (!seconds) {
        return 2000;
    }
    return Math.max(1000, Math.round(seconds * 1000));
}
