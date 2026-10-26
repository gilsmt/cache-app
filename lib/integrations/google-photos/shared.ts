import * as z from "zod";

export const DURATION_SECONDS_PATTERN = /^(\d+)(\.\d+)?s$/u;

export function parseGooglePhotosDuration(
    value: string | null | undefined
): number | null {
    if (!value) {
        return null;
    }
    const match = DURATION_SECONDS_PATTERN.exec(value);
    if (!match) {
        return null;
    }
    const seconds = Number(match[1]);
    return Number.isNaN(seconds) ? null : seconds;
}

export const GooglePhotosPickerSessionSchema = z.object({
    id: z.string(),
    mediaItemsSet: z.boolean().optional(),
    pickerUri: z.string().optional(),
    pollingConfig: z
        .object({
            pollInterval: z.string().optional(),
            timeoutIn: z.string().optional(),
        })
        .optional(),
});

export type GooglePhotosPickerSession = z.infer<
    typeof GooglePhotosPickerSessionSchema
>;

export const GooglePhotosPickedMediaItemSchema = z.object({
    createTime: z.string().optional(),
    id: z.string(),
    mediaFile: z
        .object({
            baseUrl: z.string().optional(),
            filename: z.string().optional(),
            mimeType: z.string().optional(),
        })
        .optional(),
});

export type GooglePhotosPickedMediaItem = z.infer<
    typeof GooglePhotosPickedMediaItemSchema
>;

export const GooglePhotosMediaItemsPageSchema = z.object({
    mediaItems: z.array(GooglePhotosPickedMediaItemSchema),
    nextPageToken: z.string().optional(),
});

export type GooglePhotosMediaItemsPage = z.infer<
    typeof GooglePhotosMediaItemsPageSchema
>;

export const GOOGLE_PHOTOS_PICKER_SCOPE =
    "https://www.googleapis.com/auth/photospicker.mediaitems.readonly";

export const GOOGLE_PHOTOS_PERMISSION_MESSAGE =
    "Your Google account needs Photos permission. Reconnect Google to grant it.";

export const SessionCreateResponseSchema = z.object({
    accountId: z.string().min(1),
    error: z.string().optional(),
    pickerUri: z.string().nullable(),
    pollIntervalMs: z.number(),
    sessionId: z.string(),
    timeoutIn: z.string().nullable(),
});

export type SessionCreateResponse = z.infer<typeof SessionCreateResponseSchema>;

export const SessionPollResponseSchema = z.object({
    error: z.string().optional(),
    mediaItemsSet: z.boolean(),
    pollIntervalMs: z.number(),
});

export type SessionPollResponse = z.infer<typeof SessionPollResponseSchema>;

export const ImportResponseSchema = z.object({
    error: z.string().optional(),
    importedCount: z.number(),
});

export type ImportResponse = z.infer<typeof ImportResponseSchema>;
