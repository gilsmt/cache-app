import "server-only";

import * as z from "zod";
import { IntegrationApiError } from "@/lib/integrations/error";
import type { Prisma } from "@/prisma/client/client";

const X_API_BASE_URL = "https://api.x.com/2";
const X_BOOKMARKS_PAGE_SIZE = 100;
const MAX_BOOKMARK_PAGES = 100;

interface XApiListResponse {
    readonly data: unknown[];
    readonly includesLookup: XIncludesLookup;
    readonly nextToken: string | null;
}

interface XMediaItem {
    readonly media_key?: string;
}

interface XUserItem {
    readonly id: string;
    readonly name?: string;
    readonly profile_image_url?: string;
    readonly username?: string;
}

interface XIncludesLookup {
    readonly mediaByKey: Map<string, XMediaItem>;
    readonly userById: Map<string, XUserItem>;
}

export interface XImportableBookmark {
    readonly caption: string | null;
    readonly externalId: string;
    readonly postedAt: Date | null;
    readonly sourceMetadata: Prisma.InputJsonObject;
    readonly url: string;
}

export interface XAuthenticatedUser {
    readonly id: string;
    readonly name: string | null;
    readonly profileImageUrl: string | null;
    readonly username: string | null;
}

const XApiErrorSchema = z.object({
    errors: z
        .array(
            z.object({
                detail: z.string().optional(),
                title: z.string().optional(),
            })
        )
        .optional(),
    title: z.string().optional(),
});

const XUserSchema = z.object({
    id: z.string(),
    name: z.string().optional(),
    profile_image_url: z.string().optional(),
    username: z.string().optional(),
});

const XBookmarksPageSchema = z.object({
    data: z.array(z.unknown()).optional(),
    includes: z
        .object({
            media: z
                .array(
                    z.object({
                        media_key: z.string().optional(),
                    })
                )
                .optional(),
            users: z.array(XUserSchema).optional(),
        })
        .optional(),
    meta: z
        .object({
            next_token: z.string().optional(),
        })
        .optional(),
});

const XTweetSchema = z.object({
    attachments: z
        .object({
            media_keys: z.array(z.string()).optional(),
        })
        .optional(),
    author_id: z.string().optional(),
    created_at: z.string().optional(),
    entities: z
        .object({
            urls: z
                .array(
                    z.object({
                        expanded_url: z.string().optional(),
                    })
                )
                .optional(),
        })
        .optional(),
    id: z.string(),
    note_tweet: z
        .object({
            note_tweet_results: z
                .object({
                    result: z
                        .object({
                            text: z.string().optional(),
                        })
                        .optional(),
                })
                .optional(),
            text: z.string().optional(),
        })
        .optional(),
    possibly_sensitive: z.boolean().optional(),
    text: z.string().optional(),
});

function parseXApiError(payload: unknown, status: number): IntegrationApiError {
    const parsed = XApiErrorSchema.safeParse(payload);
    const firstError = parsed.data?.errors?.[0];
    const message =
        firstError?.detail ||
        firstError?.title ||
        parsed.data?.title ||
        `X API request failed with status ${status}.`;

    return new IntegrationApiError({
        integrationId: "x",
        message,
        operation: "fetchX",
        status,
    });
}

async function fetchX(
    accessToken: string,
    path: string,
    searchParams?: URLSearchParams
): Promise<unknown> {
    const response = await fetch(
        `${X_API_BASE_URL}${path}${searchParams ? `?${searchParams.toString()}` : ""}`,
        {
            cache: "no-store",
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
        }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw parseXApiError(payload, response.status);
    }

    return payload;
}

function parseAuthenticatedUser(payload: unknown): XAuthenticatedUser | null {
    const result = z
        .object({ data: XUserSchema.optional() })
        .safeParse(payload);
    if (!result.success) {
        return null;
    }

    const user = result.data.data;
    if (!user) {
        return null;
    }

    return {
        id: user.id,
        name: user.name ?? null,
        profileImageUrl: user.profile_image_url ?? null,
        username: user.username ?? null,
    };
}

function parseBookmarksPage(payload: unknown): XApiListResponse {
    const parsed = XBookmarksPageSchema.safeParse(payload);
    if (!parsed.success) {
        throw new IntegrationApiError({
            cause: payload,
            integrationId: "x",
            message: "X returned an unexpected bookmarks response.",
            operation: "listXBookmarks",
            status: 502,
        });
    }

    const mediaByKey = new Map<string, XMediaItem>();
    for (const item of parsed.data.includes?.media ?? []) {
        if (item.media_key) {
            mediaByKey.set(item.media_key, item);
        }
    }

    const userById = new Map<string, XUserItem>();
    for (const item of parsed.data.includes?.users ?? []) {
        userById.set(item.id, item);
    }

    return {
        data: parsed.data.data ?? [],
        includesLookup: { mediaByKey, userById },
        nextToken: parsed.data.meta?.next_token ?? null,
    };
}

function parseBookmark(
    candidate: unknown,
    includesLookup: XIncludesLookup
): XImportableBookmark | null {
    const parsed = XTweetSchema.safeParse(candidate);
    if (!parsed.success) {
        return null;
    }

    const record = parsed.data;
    const authorId = record.author_id;
    const author = authorId
        ? (includesLookup.userById.get(authorId) ?? null)
        : null;
    const username = author?.username ?? null;
    const mediaKeys = record.attachments?.media_keys ?? [];
    const caption =
        record.note_tweet?.text ||
        record.note_tweet?.note_tweet_results?.result?.text ||
        record.text ||
        null;

    return {
        caption,
        externalId: record.id,
        postedAt: record.created_at ? new Date(record.created_at) : null,
        sourceMetadata: {
            x: {
                author: authorId
                    ? {
                          id: authorId,
                          name: author?.name ?? null,
                          profileImageUrl: author?.profile_image_url ?? null,
                          username,
                      }
                    : null,
                entityUrls: (record.entities?.urls ?? [])
                    .map((u) => u.expanded_url)
                    .filter((u): u is string => !!u),
                mediaKeys,
                possiblySensitive: record.possibly_sensitive ?? false,
            },
        },
        url: username
            ? `https://x.com/${encodeURIComponent(username)}/status/${encodeURIComponent(record.id)}`
            : `https://x.com/i/web/status/${encodeURIComponent(record.id)}`,
    };
}

export async function getXAuthenticatedUser(
    accessToken: string
): Promise<XAuthenticatedUser> {
    const payload = await fetchX(
        accessToken,
        "/users/me",
        new URLSearchParams({
            "user.fields": "id,name,profile_image_url,username",
        })
    );
    const user = parseAuthenticatedUser(payload);
    if (!user) {
        throw new IntegrationApiError({
            integrationId: "x",
            message: "Could not resolve the authenticated X user.",
            operation: "getXAuthenticatedUser",
            status: 500,
        });
    }
    return user;
}

export async function listXBookmarks(
    accessToken: string,
    userId: string
): Promise<{
    bookmarks: XImportableBookmark[];
    /** True only when the natural end of the feed was reached; a page-cap stop leaves the fetched set partial. */
    complete: boolean;
    /** True when the page cap stopped pagination before the feed ended. */
    truncated: boolean;
}> {
    const items: XImportableBookmark[] = [];
    let nextToken: string | null = null;

    for (let page = 0; page < MAX_BOOKMARK_PAGES; page += 1) {
        const searchParams = new URLSearchParams({
            expansions: "attachments.media_keys,author_id",
            max_results: String(X_BOOKMARKS_PAGE_SIZE),
            "media.fields": "height,media_key,preview_image_url,type,url,width",
            "tweet.fields":
                "attachments,author_id,created_at,entities,note_tweet,possibly_sensitive,text",
            "user.fields": "id,name,profile_image_url,username",
        });
        if (nextToken) {
            searchParams.set("pagination_token", nextToken);
        }

        const pagePayload = parseBookmarksPage(
            await fetchX(
                accessToken,
                `/users/${encodeURIComponent(userId)}/bookmarks`,
                searchParams
            )
        );

        const pageBookmarks = pagePayload.data
            .map((item) => parseBookmark(item, pagePayload.includesLookup))
            .filter((bookmark): bookmark is XImportableBookmark => !!bookmark);
        items.push(...pageBookmarks);

        nextToken = pagePayload.nextToken;
        if (!nextToken) {
            break;
        }
    }

    // A remaining cursor at the page cap means the library was only partly
    // fetched; report it so the UI can say so instead of failing the whole
    // import.
    return {
        bookmarks: items,
        complete: nextToken === null,
        truncated: nextToken !== null,
    };
}
