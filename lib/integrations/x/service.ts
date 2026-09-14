import "server-only";

import { createLogger } from "@/lib/common/logs/console/logger";
import { importLibraryItemSnapshot } from "@/lib/integrations/import";
import { LibraryItemSource } from "@/prisma/client/enums";
import { getXAuthenticatedUser, listXBookmarks } from "./api";

const log = createLogger("integrations:x");

export async function importXBookmarks(args: {
    accessToken: string;
    userId: string;
}) {
    const { accessToken, userId } = args;
    const span = log.time("import-bookmarks", { userId });

    try {
        const xUser = await getXAuthenticatedUser(accessToken);
        // Every sync walks the full feed so deletions reconcile: a bookmark
        // removed upstream is absent from a complete fetch and the snapshot
        // prune removes it. Stopping at the first known id would keep
        // steady-state syncs cheap but leave removed bookmarks in the
        // library indefinitely.
        const { bookmarks, complete, truncated } = await listXBookmarks(
            accessToken,
            xUser.id
        );
        const importedAt = new Date();

        const result = await importLibraryItemSnapshot({
            items: bookmarks.map((bookmark) => ({
                caption: bookmark.caption,
                externalId: bookmark.externalId,
                postedAt: bookmark.postedAt,
                scrapedAt: importedAt,
                sourceMetadata: bookmark.sourceMetadata,
                url: bookmark.url,
            })),
            // A cap-stop leaves the fetched set partial, so the snapshot prune
            // must not treat unfetched items as deleted.
            snapshotComplete: complete,
            source: LibraryItemSource.x_bookmarks,
            userId,
        });

        log.info("Successfully imported X bookmarks", {
            importedCount: result.importedCount,
            pruneAborted: result.pruneAborted,
            prunedCount: result.prunedCount,
            truncated,
            userId,
            xUserId: xUser.id,
        });

        return {
            ...result,
            smartCollectionItemIds: result.smartCollectionItemIds,
            totalFetched: bookmarks.length,
            truncated,
            xUserId: xUser.id,
        };
    } catch (error) {
        log.error("Failed to import X bookmarks", {
            error,
            userId,
        });
        throw error;
    } finally {
        span.stop();
    }
}
