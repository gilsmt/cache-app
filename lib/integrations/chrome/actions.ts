"use server";

import { after } from "next/server";
import * as z from "zod";
import { getSessionUserId } from "@/lib/auth/session";
import type { LibraryItemWithCollections } from "@/lib/collections/utils";
import { ITEM_KIND_BOOKMARK } from "@/lib/common/constants";
import { extractNamedErrorMessage } from "@/lib/common/error";
import { fetchLinkPreview } from "@/lib/common/link-preview";
import { createLogger } from "@/lib/common/logs/console/logger";
import { parseStandaloneUrl } from "@/lib/common/url";
import { DEFAULT_BROWSER_PROFILE_ID } from "@/lib/integrations/browser-profiles";
import {
    applyChromeBookmarkSyncEvents,
    getChromeBookmarkItemForUserByExternalId,
} from "@/lib/integrations/chrome/service";
import { IntegrationUserError } from "@/lib/integrations/error";
import { autoTagLibraryItemsByIds } from "@/lib/intelligence/collections/engine";

const log = createLogger("integrations:standalone:actions");
const PASTED_BOOKMARK_URL_MAX_LENGTH = 4096;
const PASTED_BOOKMARK_PREVIEW_TIMEOUT_MS = 5000;
const NOTE_PASTED_BOOKMARK_EXTERNAL_ID_PREFIX = "cache_pasted_url:";

const CreateChromeBookmarkFromUrlInputSchema = z.object({
    url: z.string().trim().min(1).max(PASTED_BOOKMARK_URL_MAX_LENGTH),
});

export type CreateChromeBookmarkFromUrlResult =
    | {
          item: LibraryItemWithCollections;
          outcome: "CREATED" | "MERGED" | "UPDATED";
          status: "SUCCESS";
      }
    | {
          message: string;
          status: "ERROR" | "INVALID" | "UNAUTHORIZED";
      };

function pastedChromeBookmarkExternalId(url: string): string {
    return `${NOTE_PASTED_BOOKMARK_EXTERNAL_ID_PREFIX}${url}`;
}

export async function createChromeBookmarkFromUrl(input: {
    url: string;
}): Promise<CreateChromeBookmarkFromUrlResult> {
    const parsed = CreateChromeBookmarkFromUrlInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message:
                parsed.error.issues[0]?.message ??
                "Paste a valid URL to save it as a bookmark.",
            status: "INVALID",
        };
    }

    const normalizedUrl = parseStandaloneUrl(parsed.data.url);
    if (!normalizedUrl) {
        return {
            message: "Paste a valid URL to save it as a bookmark.",
            status: "INVALID",
        };
    }

    const userId = await getSessionUserId();
    if (!userId) {
        return {
            message: "Sign in again to save links.",
            status: "UNAUTHORIZED",
        };
    }

    const occurredAt = new Date().toISOString();
    const externalId = pastedChromeBookmarkExternalId(normalizedUrl.href);

    const title =
        (
            await fetchLinkPreview(normalizedUrl.href, {
                timeoutMs: PASTED_BOOKMARK_PREVIEW_TIMEOUT_MS,
            })
        )?.title ?? null;

    try {
        const syncResult = await applyChromeBookmarkSyncEvents(userId, {
            browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
            events: [
                {
                    bookmark: {
                        dateAdded: Date.now(),
                        externalId,
                        kind: ITEM_KIND_BOOKMARK,
                        title: title ?? undefined,
                        url: normalizedUrl.href,
                    },
                    occurredAt,
                    type: "upsert",
                },
            ],
            mode: "continuous_sync",
            syncedAt: occurredAt,
        });

        const item = await getChromeBookmarkItemForUserByExternalId(
            userId,
            externalId
        );
        if (!item) {
            throw new IntegrationUserError({
                integrationId: "chrome",
                message:
                    "We saved the bookmark but couldn't load it back into the library.",
                operation: "createChromeBookmarkFromUrl",
                resource: "libraryItem",
            });
        }

        if (syncResult.smartCollectionItemIds.length > 0) {
            after(async () => {
                await autoTagLibraryItemsByIds({
                    itemIds: syncResult.smartCollectionItemIds,
                    userId,
                });
            });
        }

        let outcome: "CREATED" | "MERGED" | "UPDATED" = "UPDATED";
        if (syncResult.smartCollectionItemIds.length > 0) {
            outcome = "CREATED";
        } else if (syncResult.deduped > 0) {
            outcome = "MERGED";
        }

        return {
            item,
            outcome,
            status: "SUCCESS",
        };
    } catch (error) {
        const details = extractNamedErrorMessage(error);
        log.error("Unexpected pasted bookmark create failure", error);
        return {
            message: details.message || "We couldn't save this URL right now.",
            status: "ERROR",
        };
    }
}
