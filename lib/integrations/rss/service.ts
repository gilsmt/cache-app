import "server-only";

import { mapConcurrent } from "@/lib/common/array";
import { ITEM_KIND_BOOKMARK } from "@/lib/common/constants";
import { getErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import { tryParseUrl } from "@/lib/common/url";
import { upsertLibraryItemImports } from "@/lib/integrations/import";
import { prisma } from "@/prisma";
import type { Prisma } from "@/prisma/client/client";
import { LibraryItemSource } from "@/prisma/client/enums";
import { RssFeedError } from "./errors";
import type { ParsedFeed } from "./parser";
import { parseFeed } from "./parser";

const log = createLogger("integrations:rss");

const REFRESH_MIN_INTERVAL_MS = 15 * 60 * 1000;
const TRAILING_SLASH_RE = /\/+$/;

function normalizeFeedUrl(url: string): string {
    const trimmed = url.trim();
    const parsed = tryParseUrl(trimmed);
    if (!parsed) {
        return trimmed.toLowerCase().replace(TRAILING_SLASH_RE, "");
    }
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.href.replace(TRAILING_SLASH_RE, "");
}

export async function addRssFeed(args: {
    feedUrl: string;
    userId: string;
}): Promise<string> {
    const feedUrl = args.feedUrl.trim();
    const urlKey = normalizeFeedUrl(feedUrl);

    const existing = await prisma.rssFeed.findUnique({
        select: { id: true },
        where: { userId_urlKey: { urlKey, userId: args.userId } },
    });

    if (existing) {
        throw new RssFeedError({
            kind: "already_exists",
            message: "You've already added this feed.",
        });
    }

    const feed = await prisma.rssFeed.create({
        data: {
            feedUrl,
            urlKey,
            userId: args.userId,
        },
    });

    log.info("Feed added", { feedId: feed.id, url: feedUrl });

    try {
        await fetchAndImportFeed(feed, new Date(), args.userId);
    } catch (error) {
        const message = getErrorMessage(error, "Failed to fetch feed.");
        await prisma.rssFeed.update({
            data: { lastError: message },
            where: { id: feed.id },
        });
        log.warn("Initial feed fetch failed", { error, feedId: feed.id });
    }

    return feed.id;
}

export async function removeRssFeed(args: {
    feedId: string;
    userId: string;
}): Promise<void> {
    await prisma.rssFeed.deleteMany({
        where: { id: args.feedId, userId: args.userId },
    });

    log.info("Feed removed", { feedId: args.feedId });
}

export function listRssFeeds(args: { userId: string }) {
    return prisma.rssFeed.findMany({
        orderBy: { createdAt: "desc" },
        select: {
            createdAt: true,
            description: true,
            feedUrl: true,
            id: true,
            lastError: true,
            lastFetchedAt: true,
            siteUrl: true,
            title: true,
            updatedAt: true,
        },
        where: { userId: args.userId },
    });
}

async function fetchAndImportFeed(
    feed: {
        description: string | null;
        feedUrl: string;
        id: string;
        siteUrl: string | null;
        title: string | null;
    },
    now: Date,
    userId: string
): Promise<{ importedCount: number }> {
    const parsed = await parseFeed(feed.feedUrl);

    const items: Array<{
        caption: string | null;
        externalId: string;
        kind: "bookmark";
        postedAt: Date | null;
        scrapedAt: Date;
        sourceMetadata: Prisma.InputJsonObject;
        url: string;
    }> = [];

    for (const item of parsed.items) {
        const guid = item.guid ?? item.link;
        if (!guid) {
            continue;
        }

        items.push({
            caption: item.title ?? null,
            externalId: guid,
            kind: ITEM_KIND_BOOKMARK,
            postedAt: item.isoDate ? new Date(item.isoDate) : null,
            scrapedAt: now,
            sourceMetadata: {
                author: item.creator ?? null,
                categories: item.categories ?? [],
            } satisfies Prisma.InputJsonObject,
            url: item.link ?? "",
        });
    }

    if (items.length > 0) {
        const result = await upsertLibraryItemImports({
            items,
            source: LibraryItemSource.rss_feed,
            userId,
        });

        await updateFeedAfterFetch({ feed, now, parsed });

        log.info("Feed fetched and imported", {
            feedId: feed.id,
            importedCount: result.upsertedCount,
        });

        return { importedCount: result.upsertedCount };
    }

    await updateFeedAfterFetch({ feed, now, parsed });
    return { importedCount: 0 };
}

export interface RssFeedRefreshResult {
    errors: Array<{ feedId: string; error: string }>;
    importedCount: number;
    refreshedFeedIds: string[];
    skippedFeedIds: string[];
}

export async function refreshFeedsForUser(args: {
    now: Date;
    userId: string;
}): Promise<RssFeedRefreshResult> {
    const feeds = await prisma.rssFeed.findMany({
        where: { userId: args.userId },
    });

    const results = await mapConcurrent(
        feeds,
        async (
            feed
        ): Promise<
            | { kind: "refreshed"; feedId: string; importedCount?: number }
            | { kind: "error"; error: string; feedId: string }
            | { kind: "skipped"; feedId: string }
        > => {
            if (
                feed.lastFetchedAt &&
                args.now.getTime() - feed.lastFetchedAt.getTime() <
                    REFRESH_MIN_INTERVAL_MS
            ) {
                return { feedId: feed.id, kind: "skipped" };
            }

            try {
                const { importedCount } = await fetchAndImportFeed(
                    feed,
                    args.now,
                    args.userId
                );
                return {
                    feedId: feed.id,
                    importedCount,
                    kind: "refreshed",
                };
            } catch (error) {
                const message = getErrorMessage(error, "Failed to fetch feed.");

                await prisma.rssFeed.update({
                    data: { lastError: message },
                    where: { id: feed.id },
                });

                log.error("Feed refresh failed", {
                    error,
                    feedId: feed.id,
                });

                return {
                    error: message,
                    feedId: feed.id,
                    kind: "error",
                };
            }
        },
        3
    );

    const refreshedFeedIds: string[] = [];
    const errors: Array<{ feedId: string; error: string }> = [];
    const skippedFeedIds: string[] = [];
    let importedCount = 0;

    for (const result of results) {
        if (result.kind === "refreshed") {
            refreshedFeedIds.push(result.feedId);
            importedCount += result.importedCount ?? 0;
        } else if (result.kind === "skipped") {
            skippedFeedIds.push(result.feedId);
        } else {
            errors.push({
                error: result.error,
                feedId: result.feedId,
            });
        }
    }

    return {
        errors,
        importedCount,
        refreshedFeedIds,
        skippedFeedIds,
    };
}

async function updateFeedAfterFetch(args: {
    feed: {
        description: string | null;
        id: string;
        siteUrl: string | null;
        title: string | null;
    };
    now: Date;
    parsed: Pick<ParsedFeed, "description" | "link" | "title">;
}): Promise<void> {
    await prisma.rssFeed.update({
        data: {
            description: args.parsed.description ?? args.feed.description,
            lastError: null,
            lastFetchedAt: args.now,
            siteUrl: args.parsed.link ?? args.feed.siteUrl,
            title: args.parsed.title ?? args.feed.title,
        },
        where: { id: args.feed.id },
    });
}
