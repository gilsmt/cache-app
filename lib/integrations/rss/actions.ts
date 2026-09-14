"use server";

import * as z from "zod";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import { getValidationErrorMessage } from "@/lib/common/action";
import { createLogger } from "@/lib/common/logs/console/logger";
import { RssFeedError } from "./errors";
import { sanitizeFeedError } from "./sanitize";
import * as service from "./service";

import type { Feed } from "./types";

export interface FeedViewModel {
    feedUrl: string;
    id: string;
    lastError: string | null;
    title: string | null;
}

function toFeedViewModel(feed: Feed): FeedViewModel {
    return {
        feedUrl: feed.feedUrl,
        id: feed.id,
        lastError: sanitizeFeedError(feed.lastError),
        title: feed.title,
    };
}

const log = createLogger("integrations:rss:actions");

const AddFeedInputSchema = z.object({
    feedUrl: z
        .string()
        .trim()
        .min(1, "Enter a feed URL.")
        .pipe(z.url({ error: "Enter a valid URL." })),
});

const RemoveFeedInputSchema = z.object({
    feedId: z.string().trim().min(1),
});

export type AddFeedResult =
    | { feedId: string; status: "SUCCESS" }
    | {
          message: string;
          status: "DUPLICATE" | "ERROR" | "INVALID" | "UNAUTHORIZED";
      };

export type RemoveFeedResult =
    | { status: "SUCCESS" }
    | { message: string; status: "ERROR" | "INVALID" | "UNAUTHORIZED" };

export type ListFeedsResult =
    | { feeds: FeedViewModel[]; status: "SUCCESS" }
    | { message: string; status: "ERROR" | "UNAUTHORIZED" };

export async function addFeed(input: {
    feedUrl: string;
}): Promise<AddFeedResult> {
    const parsed = AddFeedInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter a valid feed URL."
            ),
            status: "INVALID",
        };
    }

    const auth = await requireActionUserId("Sign in again to add feeds.");
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const feedId = await service.addRssFeed({
            feedUrl: parsed.data.feedUrl,
            userId: auth.userId,
        });
        return { feedId, status: "SUCCESS" };
    } catch (error) {
        if (
            RssFeedError.isInstance(error) &&
            error.data.kind === "already_exists"
        ) {
            return {
                message: error.data.message,
                status: "DUPLICATE",
            };
        }
        log.error("Add feed failed", error);
        return {
            message: "We couldn't add this feed right now.",
            status: "ERROR",
        };
    }
}

export async function removeFeed(input: {
    feedId: string;
}): Promise<RemoveFeedResult> {
    const parsed = RemoveFeedInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Select a feed before trying to remove it."
            ),
            status: "INVALID",
        };
    }

    const auth = await requireActionUserId("Sign in again to manage feeds.");
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        await service.removeRssFeed({
            feedId: parsed.data.feedId,
            userId: auth.userId,
        });
        return { status: "SUCCESS" };
    } catch (error) {
        log.error("Remove feed failed", error);
        return {
            message: "We couldn't remove this feed right now.",
            status: "ERROR",
        };
    }
}

export async function listFeeds(): Promise<ListFeedsResult> {
    const auth = await requireActionUserId("Sign in again to view your feeds.");
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        const feeds = await service.listRssFeeds({
            userId: auth.userId,
        });
        return { feeds: feeds.map(toFeedViewModel), status: "SUCCESS" };
    } catch (error) {
        log.error("List feeds failed", error);
        return {
            message: "We couldn't load your feeds right now.",
            status: "ERROR",
        };
    }
}
