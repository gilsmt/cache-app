import "server-only";

import * as z from "zod";
import { SITE_DOMAIN } from "@/lib/common/constants";
import { isHttpUrl } from "@/lib/common/url";
import { IntegrationApiError } from "@/lib/integrations/error";
import type { Prisma } from "@/prisma/client/client";

const REDDIT_OAUTH_BASE_URL = "https://oauth.reddit.com";
const REDDIT_WEB_ORIGIN = "https://www.reddit.com";
const REDDIT_SAVED_PAGE_SIZE = 100;
/**
 * Approximate ceiling Reddit applies to a single listing. It is not a
 * documented constant, so it is only used to label a walk as capped and
 * never to decide whether data is missing.
 */
const REDDIT_LISTING_ITEM_CAP = 1000;
/** Reddit requires a descriptive User-Agent and rate-limits generic ones. */
export const REDDIT_USER_AGENT = `CacheApp/1.0 (+https://${SITE_DOMAIN})`;
/**
 * Reddit stops serving a listing near 1,000 items and then stops issuing a
 * cursor, so ten full pages is the whole walk. Ten pages also bounds the work
 * one sync can do. See `RedditSavedListing.complete` for why the walk cannot
 * be treated as a full inventory.
 */
const MAX_REDDIT_SAVED_PAGES = 10;

export interface RedditAuthenticatedUser {
    readonly username: string;
}

export interface RedditImportableSavedItem {
    readonly caption: string | null;
    readonly externalId: string;
    readonly postedAt: Date | null;
    readonly sourceMetadata: Prisma.InputJsonObject;
    readonly url: string;
}

export interface RedditSavedListing {
    saved: RedditImportableSavedItem[];
    /** True when the walk stopped at a page or item cap rather than an empty listing. */
    truncated: boolean;
}

const RedditApiErrorSchema = z.object({
    error: z.union([z.string(), z.number()]).optional(),
    message: z.string().optional(),
});

const RedditMeSchema = z.object({
    name: z.string().min(1),
});

const RedditListingSchema = z.object({
    data: z
        .object({
            after: z.string().nullish(),
            children: z
                .array(
                    z.object({
                        data: z.unknown().optional(),
                        kind: z.string().optional(),
                    })
                )
                .optional(),
        })
        .optional(),
});

const RedditSavedItemSchema = z.object({
    author: z.string().optional(),
    body: z.string().nullish(),
    created_utc: z.number().optional(),
    link_title: z.string().nullish(),
    name: z.string(),
    permalink: z.string().nullish(),
    selftext: z.string().nullish(),
    subreddit: z.string().optional(),
    title: z.string().nullish(),
    url: z.string().nullish(),
});

function parseRedditApiError(
    payload: unknown,
    status: number
): IntegrationApiError {
    const parsed = RedditApiErrorSchema.safeParse(payload);
    const detail =
        parsed.data?.message ??
        (parsed.data?.error === undefined
            ? undefined
            : String(parsed.data.error));
    return new IntegrationApiError({
        integrationId: "reddit",
        message: detail ?? `Reddit API request failed with status ${status}.`,
        operation: "fetchReddit",
        status,
    });
}

async function fetchReddit(
    accessToken: string,
    path: string,
    searchParams?: URLSearchParams
): Promise<unknown> {
    const response = await fetch(
        `${REDDIT_OAUTH_BASE_URL}${path}${searchParams ? `?${searchParams.toString()}` : ""}`,
        {
            cache: "no-store",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
                "User-Agent": REDDIT_USER_AGENT,
            },
            signal: AbortSignal.timeout(30_000),
        }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw parseRedditApiError(payload, response.status);
    }

    return payload;
}

function parseAuthenticatedUser(payload: unknown): RedditAuthenticatedUser {
    const parsed = RedditMeSchema.safeParse(payload);
    if (!parsed.success) {
        throw new IntegrationApiError({
            cause: payload,
            integrationId: "reddit",
            message: "Reddit did not return a valid user.",
            operation: "getRedditAuthenticatedUser",
            status: 502,
        });
    }
    return { username: parsed.data.name };
}

/**
 * Resolves the item's canonical URL. Reddit sends a relative `permalink` for
 * posts and comments, but both fields are free-form: an absolute value is
 * kept as-is instead of being glued onto a host.
 */
function toRedditItemUrl({
    externalUrl,
    permalink,
}: {
    externalUrl: string | null;
    permalink: string | null;
}): string | null {
    if (permalink) {
        if (permalink.startsWith("/")) {
            return `${REDDIT_WEB_ORIGIN}${permalink}`;
        }
        // Any other shape must already be a full URL; a bare path is
        // rejected so the item is treated as unread rather than guessed at.
        return isHttpUrl(permalink) ? permalink : null;
    }
    return isHttpUrl(externalUrl) ? externalUrl : null;
}

/**
 * `created_utc` is seconds since the epoch. A missing, non-integer, or
 * out-of-range value yields null so an unusable date never reaches Prisma.
 */
function parseRedditTimestamp(createdUtc: number | undefined): Date | null {
    if (!Number.isSafeInteger(createdUtc)) {
        return null;
    }
    const postedAt = new Date((createdUtc ?? 0) * 1000);
    return Number.isNaN(postedAt.getTime()) ? null : postedAt;
}

function parseSavedItem(
    candidate: unknown,
    kind: string | undefined
): RedditImportableSavedItem | null {
    const parsed = RedditSavedItemSchema.safeParse(candidate);
    if (!parsed.success) {
        return null;
    }
    const record = parsed.data;
    const permalink = record.permalink?.trim() || null;
    const externalUrl = record.url?.trim() || null;
    const url = toRedditItemUrl({ externalUrl, permalink });
    if (!url) {
        return null;
    }

    const title = record.title?.trim() || null;
    const linkTitle = record.link_title?.trim() || null;
    const bodyText = record.selftext?.trim() || record.body?.trim() || null;
    const subreddit = record.subreddit?.trim() || null;

    return {
        // Comments carry the parent post in `link_title`; the comment body
        // itself identifies the saved item, so it wins over the parent title.
        caption: title ?? bodyText ?? linkTitle,
        externalId: record.name,
        postedAt: parseRedditTimestamp(record.created_utc),
        sourceMetadata: {
            reddit: {
                author: record.author ?? null,
                body: bodyText,
                // Only web-reachable URLs are stored, so downstream metadata
                // readers cannot be handed a `javascript:` or internal URL.
                externalUrl: isHttpUrl(externalUrl) ? externalUrl : null,
                kind: kind ?? null,
                linkTitle,
                permalink,
                subreddit,
                title,
            },
        },
        url,
    };
}

export async function getRedditAuthenticatedUser(
    accessToken: string
): Promise<RedditAuthenticatedUser> {
    return parseAuthenticatedUser(await fetchReddit(accessToken, "/api/v1/me"));
}

export async function listRedditSavedItems(
    accessToken: string,
    username: string
): Promise<RedditSavedListing> {
    const saved: RedditImportableSavedItem[] = [];
    let after: string | null = null;

    for (let page = 0; page < MAX_REDDIT_SAVED_PAGES; page += 1) {
        const searchParams = new URLSearchParams({
            limit: String(REDDIT_SAVED_PAGE_SIZE),
            raw_json: "1",
        });
        if (after) {
            searchParams.set("after", after);
        }

        const payload = await fetchReddit(
            accessToken,
            `/user/${encodeURIComponent(username)}/saved`,
            searchParams
        );
        const parsed = RedditListingSchema.safeParse(payload);
        if (!parsed.success) {
            throw new IntegrationApiError({
                cause: payload,
                integrationId: "reddit",
                message: "Reddit returned an unexpected saved listing.",
                operation: "listRedditSavedItems",
                status: 502,
            });
        }

        for (const child of parsed.data.data?.children ?? []) {
            // A saved listing also carries "more" children and, for content
            // Reddit can no longer serve, `t5` subreddit stubs. Neither is a
            // saved post or comment.
            if (child.kind !== "t1" && child.kind !== "t3") {
                continue;
            }
            const item = parseSavedItem(child.data, child.kind);
            if (item) {
                saved.push(item);
            }
        }

        // Reddit sometimes ends a listing with the literal string "null"
        // rather than a JSON null, so the cursor is normalized before use.
        const rawAfter = parsed.data.data?.after;
        after = rawAfter && rawAfter !== "null" ? rawAfter : null;
        if (!after) {
            // A null cursor also marks Reddit's ~1,000-item window closing, so
            // this is not proof of a full inventory.
            return {
                saved,
                truncated: saved.length >= REDDIT_LISTING_ITEM_CAP,
            };
        }
    }

    return { saved, truncated: true };
}
