import "server-only";

import { createLogger } from "@/lib/common/logs/console/logger";
import { DEFAULT_BROWSER_PROFILE_ID } from "@/lib/integrations/browser-profiles";
import { upsertLibraryItemImports } from "@/lib/integrations/import";
import type { Prisma } from "@/prisma/client/client";
import { LibraryItemSource } from "@/prisma/client/enums";
import { pickerPollIntervalMs, withPickerAutoclose } from "./api";
import type {
    GooglePhotosPickedMediaItem,
    GooglePhotosPickerSession,
} from "./shared";

const log = createLogger("integrations:google-photos");

export interface PickerSessionViewModel {
    accountId: string;
    mediaItemsSet?: boolean;
    pickerUri: string | null;
    pollIntervalMs: number;
    sessionId: string;
    timeoutIn: string | null;
}

export function mapPickerSessionToViewModel(
    session: GooglePhotosPickerSession,
    accountId: string
): PickerSessionViewModel {
    return {
        accountId,
        mediaItemsSet: !!session.mediaItemsSet,
        pickerUri: session.pickerUri
            ? withPickerAutoclose(session.pickerUri)
            : null,
        pollIntervalMs: pickerPollIntervalMs(
            session.pollingConfig?.pollInterval
        ),
        sessionId: session.id,
        timeoutIn: session.pollingConfig?.timeoutIn ?? null,
    };
}

export interface GooglePhotosImportCandidate {
    readonly caption: string | null;
    readonly externalId: string;
    readonly scrapedAt: Date | null;
    readonly sourceMetadata: Prisma.InputJsonObject;
    readonly url: string;
}

export function mediaUrlFromItem(
    item: GooglePhotosPickedMediaItem
): string | null {
    const baseUrl = item.mediaFile?.baseUrl;
    if (!baseUrl) {
        return null;
    }
    if (item.mediaFile?.mimeType?.startsWith("video/")) {
        return `${baseUrl}=dv`;
    }
    return `${baseUrl}=w2048-h2048`;
}

export function googlePhotosSourceMetadata(
    item: GooglePhotosPickedMediaItem
): Prisma.InputJsonObject {
    return {
        googlePhotos: {
            filename: item.mediaFile?.filename ?? null,
            mimeType: item.mediaFile?.mimeType ?? null,
        },
    };
}

export function buildGooglePhotosImportCandidate(
    item: GooglePhotosPickedMediaItem
): GooglePhotosImportCandidate | null {
    const url = mediaUrlFromItem(item);
    if (!url) {
        return null;
    }

    return {
        caption: item.mediaFile?.filename ?? null,
        externalId: item.id,
        scrapedAt: item.createTime ? new Date(item.createTime) : null,
        sourceMetadata: googlePhotosSourceMetadata(item),
        url,
    };
}

export function collectGooglePhotosImportCandidates(
    items: GooglePhotosPickedMediaItem[]
): {
    candidates: GooglePhotosImportCandidate[];
    skippedCount: number;
} {
    const candidates: GooglePhotosImportCandidate[] = [];
    let skippedCount = 0;

    for (const item of items) {
        const candidate = buildGooglePhotosImportCandidate(item);
        if (!candidate) {
            skippedCount += 1;
            continue;
        }

        candidates.push(candidate);
    }

    return {
        candidates,
        skippedCount,
    };
}

export async function importGooglePhotosCandidates(args: {
    readonly candidates: GooglePhotosImportCandidate[];
    readonly userId: string;
}): Promise<{
    importedCount: number;
    smartCollectionItemIds: string[];
}> {
    const { userId, candidates } = args;
    const span = log.time("import-candidates", {
        candidateCount: candidates.length,
        userId,
    });

    try {
        const result = await upsertLibraryItemImports({
            items: candidates.map((candidate) => ({
                browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
                caption: candidate.caption,
                externalId: candidate.externalId,
                scrapedAt: candidate.scrapedAt,
                sourceMetadata: candidate.sourceMetadata,
                url: candidate.url,
            })),
            source: LibraryItemSource.google_photos,
            userId,
        });

        log.info("Successfully imported Google Photos candidates", {
            importedCount: result.upsertedCount,
            userId,
        });

        return {
            importedCount: result.upsertedCount,
            smartCollectionItemIds: result.smartCollectionItemIds,
        };
    } catch (error) {
        log.error("Failed to import Google Photos candidates", {
            error,
            userId,
        });
        throw error;
    } finally {
        span.stop();
    }
}
