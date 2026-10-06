import "server-only";

import { createLogger } from "@/lib/common/logs/console/logger";
import { upsertLibraryItemImports } from "@/lib/integrations/import";
import { LibraryItemSource } from "@/prisma/client/enums";
import { getRedditAuthenticatedUser, listRedditSavedItems } from "./api";

const log = createLogger("integrations:reddit");

export async function importRedditSavedItems(args: {
    accessToken: string;
    userId: string;
}) {
    const { accessToken, userId } = args;
    const span = log.time("import-saved-items", { userId });

    try {
        const redditUser = await getRedditAuthenticatedUser(accessToken);
        // The saved listing is walked in full every sync, but it is NOT
        // deletion-authoritative: Reddit's ~1,000-item window is not
        // backfilled when items are deleted or unsaved, so items age out of
        // the listing while still being saved, and a null cursor marks that
        // window closing exactly as it marks the end of the listing. This
        // import is therefore additive. The cost is that a genuinely unsaved
        // item lingers until the user removes it; the alternative is silently
        // deleting saves the user still has, which is unrecoverable.
        const { saved, truncated } = await listRedditSavedItems(
            accessToken,
            redditUser.username
        );
        const importedAt = new Date();

        const result = await upsertLibraryItemImports({
            items: saved.map((item) => ({
                caption: item.caption,
                externalId: item.externalId,
                postedAt: item.postedAt,
                scrapedAt: importedAt,
                sourceMetadata: item.sourceMetadata,
                url: item.url,
            })),
            source: LibraryItemSource.reddit_saved,
            userId,
        });

        log.info("Successfully imported Reddit saved items", {
            redditUsername: redditUser.username,
            skippedCount: result.skippedCount,
            truncated,
            unchangedCount: result.unchangedCount,
            upsertedCount: result.upsertedCount,
            userId,
        });

        return {
            importedCount: result.upsertedCount,
            redditUsername: redditUser.username,
            skippedCount: result.skippedCount,
            smartCollectionItemIds: result.smartCollectionItemIds,
            totalFetched: saved.length,
            truncated,
        };
    } catch (error) {
        log.error("Failed to import Reddit saved items", {
            error,
            userId,
        });
        throw error;
    } finally {
        span.stop();
    }
}
