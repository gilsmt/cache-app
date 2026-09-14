import "server-only";

import { createLogger } from "@/lib/common/logs/console/logger";
import { importLibraryItemSnapshot } from "@/lib/integrations/import";
import { LibraryItemSource } from "@/prisma/client/enums";
import {
    getGitHubAuthenticatedUser,
    listGitHubStarredRepositories,
} from "./api";

const log = createLogger("integrations:github");

export async function importGitHubStarredRepositories(args: {
    accessToken: string;
    userId: string;
}) {
    const { accessToken, userId } = args;
    const span = log.time("import-starred-repositories", { userId });

    try {
        const gitHubUser = await getGitHubAuthenticatedUser(accessToken);
        // Every sync walks the full star list so unstars reconcile: a
        // repository removed upstream is absent from a complete fetch and
        // the snapshot prune removes it. Stopping at the first known id
        // would keep steady-state syncs cheap but leave unstarred
        // repositories in the library indefinitely.
        const { complete, repositories, truncated } =
            await listGitHubStarredRepositories(accessToken);
        const importedAt = new Date();

        const result = await importLibraryItemSnapshot({
            items: repositories.map((repository) => ({
                caption: repository.caption,
                externalId: repository.externalId,
                postedAt: repository.postedAt,
                scrapedAt: importedAt,
                sourceMetadata: repository.sourceMetadata,
                url: repository.url,
            })),
            // A cap-stop leaves the fetched set partial, so the snapshot prune
            // must not treat unfetched items as deleted.
            snapshotComplete: complete,
            source: LibraryItemSource.github_starred_repositories,
            userId,
        });

        log.info("Successfully imported GitHub starred repositories", {
            githubLogin: gitHubUser.login,
            importedCount: result.importedCount,
            pruneAborted: result.pruneAborted,
            prunedCount: result.prunedCount,
            truncated,
            userId,
        });

        return {
            ...result,
            gitHubLogin: gitHubUser.login,
            gitHubUserId: gitHubUser.id,
            smartCollectionItemIds: result.smartCollectionItemIds,
            totalFetched: repositories.length,
            truncated,
        };
    } catch (error) {
        log.error("Failed to import GitHub starred repositories", {
            error,
            userId,
        });
        throw error;
    } finally {
        span.stop();
    }
}

export async function getStarCount(repositoryId: string): Promise<string> {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${repositoryId}`,
            {
                headers: { Accept: "application/vnd.github.v3+json" },
            }
        );
        if (!response.ok) {
            return "";
        }
        const data = await response.json();
        const count = data.stargazers_count;
        if (typeof count !== "number") {
            return "";
        }
        if (count >= 1000) {
            return `${(count / 1000).toFixed(count >= 10_000 ? 0 : 1)}k`;
        }
        return String(count);
    } catch {
        return "";
    }
}
