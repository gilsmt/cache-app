import {
    type AnyFeed,
    type AtomFeed,
    type JsonFeed,
    parseFeed as parseFeedContent,
} from "feedsmith";
import { abortAfter } from "@/lib/common/abort";
import { fetchPublicRedirect, readBodyText } from "@/lib/common/security/fetch";
import { RssFeedError } from "./errors";

const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;
const FEED_BODY_CHARS_MAX = 10_000_000;

export interface ParsedFeed {
    description?: string;
    items: ParsedFeedItem[];
    link?: string;
    title?: string;
}

export interface ParsedFeedItem {
    categories?: string[];
    creator?: string;
    guid?: string;
    isoDate?: string;
    link?: string;
    title?: string;
}

export async function parseFeed(url: string): Promise<ParsedFeed> {
    // One budget for the whole chain: per-hop timeouts would multiply the
    // deadline across redirects instead of bounding the total walk.
    const deadline = abortAfter(FETCH_TIMEOUT_MS);
    let response: Response;
    let content: string;

    try {
        const result = await fetchPublicRedirect(url, {
            headers: { "User-Agent": "Cache/1.0 RSS" },
            maxRedirects: MAX_REDIRECTS,
            signal: deadline.signal,
            timeoutMs: FETCH_TIMEOUT_MS,
        });
        if (result.status !== "response") {
            throw new RssFeedError({
                kind: "fetch_failed",
                message:
                    result.status === "blocked"
                        ? "The feed host is not publicly reachable."
                        : "The feed did not settle on a final URL.",
            });
        }
        response = result.response;

        if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            throw new RssFeedError({
                kind: "fetch_failed",
                message: `Feed returned HTTP ${response.status}`,
            });
        }

        const body = await readBodyText(response, {
            maxChars: FEED_BODY_CHARS_MAX,
        });
        if (body.truncated) {
            throw new RssFeedError({
                kind: "fetch_failed",
                message: "The feed is too large to parse.",
            });
        }
        content = body.text;
    } catch (error) {
        if (RssFeedError.isInstance(error)) {
            throw error;
        }
        throw new RssFeedError(
            {
                kind: "fetch_failed",
                message:
                    error instanceof Error
                        ? error.message
                        : "Failed to fetch the feed.",
            },
            { cause: error }
        );
    } finally {
        deadline.clearTimeout();
    }

    let parsed: AnyFeed;

    try {
        parsed = parseFeedContent(content);
    } catch (error) {
        throw new RssFeedError(
            {
                kind: "parse_failed",
                message:
                    error instanceof Error
                        ? error.message
                        : "Failed to parse the feed.",
            },
            { cause: error }
        );
    }

    return normalizeFeed(parsed);
}

function normalizeFeed(parsed: AnyFeed): ParsedFeed {
    switch (parsed.format) {
        case "rss":
            return {
                description: parsed.feed.description,
                items: (parsed.feed.items ?? []).map((item) => ({
                    categories: normalizeCategories(
                        item.categories,
                        (category) => category.name
                    ),
                    creator:
                        getDublinCoreCreator(item) ??
                        item.authors?.[0]?.name ??
                        item.authors?.[0]?.email ??
                        item.authors?.[0]?.link,
                    guid: item.guid?.value,
                    isoDate: toIsoDate(
                        item.pubDate ??
                            item.dc?.dates?.[0] ??
                            item.dcterms?.dates?.[0] ??
                            item.atom?.published ??
                            item.atom?.updated
                    ),
                    link: item.link,
                    title: item.title,
                })),
                link: parsed.feed.link,
                title: parsed.feed.title,
            };
        case "atom":
            return {
                description:
                    parsed.feed.subtitle?.value ??
                    parsed.feed.dc?.descriptions?.[0] ??
                    parsed.feed.dcterms?.descriptions?.[0],
                items: (parsed.feed.entries ?? []).map((entry) => ({
                    categories: normalizeCategories(
                        entry.categories,
                        (category) => category.term
                    ),
                    creator:
                        getAtomCreator(entry.authors) ??
                        getDublinCoreCreator(entry) ??
                        getAtomCreator(entry.source?.authors) ??
                        getAtomCreator(parsed.feed.authors),
                    guid: entry.id,
                    isoDate: toIsoDate(
                        entry.published ??
                            entry.updated ??
                            entry.dc?.dates?.[0] ??
                            entry.dcterms?.dates?.[0]
                    ),
                    link: findAlternateLink(entry.links),
                    title: entry.title?.value,
                })),
                link: findAlternateLink(parsed.feed.links),
                title: parsed.feed.title?.value,
            };
        case "rdf":
            return {
                description:
                    parsed.feed.description ??
                    parsed.feed.dc?.descriptions?.[0] ??
                    parsed.feed.dcterms?.descriptions?.[0],
                items: (parsed.feed.items ?? []).map((item) => ({
                    categories: [
                        ...(item.dc?.subjects ?? []),
                        ...(item.dcterms?.subjects ?? []),
                    ],
                    creator: getDublinCoreCreator(item),
                    isoDate: toIsoDate(
                        item.dc?.dates?.[0] ?? item.dcterms?.dates?.[0]
                    ),
                    link: item.link,
                    title: item.title,
                })),
                link: parsed.feed.link,
                title: parsed.feed.title,
            };
        case "json":
            return {
                description: parsed.feed.description,
                items: (parsed.feed.items ?? []).map((item) => ({
                    categories: item.tags,
                    creator: getJsonCreator(
                        item.authors ?? parsed.feed.authors
                    ),
                    guid: item.id,
                    isoDate: toIsoDate(
                        item.date_published ?? item.date_modified
                    ),
                    link: item.url ?? item.external_url,
                    title: item.title,
                })),
                link: parsed.feed.home_page_url ?? parsed.feed.feed_url,
                title: parsed.feed.title,
            };
        default:
            throw new RssFeedError({
                kind: "parse_failed",
                message: "Unsupported feed format.",
            });
    }
}

function getAtomCreator(
    authors: AtomFeed.Person[] | undefined
): string | undefined {
    return authors?.[0]?.name ?? authors?.[0]?.email ?? authors?.[0]?.uri;
}

function getDublinCoreCreator(item: {
    dc?: { creators?: string[] };
    dcterms?: { creators?: string[] };
}): string | undefined {
    return item.dc?.creators?.[0] ?? item.dcterms?.creators?.[0];
}

function getJsonCreator(
    authors: JsonFeed.Author[] | undefined
): string | undefined {
    return authors?.[0]?.name ?? authors?.[0]?.url;
}

function normalizeCategories<TCategory>(
    categories: TCategory[] | undefined,
    getName: (category: TCategory) => string | undefined
): string[] | undefined {
    if (!categories) {
        return undefined;
    }

    const names: string[] = [];
    for (const category of categories) {
        const name = getName(category);
        if (name) {
            names.push(name);
        }
    }
    return names;
}

function findAlternateLink(
    links: Array<{ href?: string; rel?: string }> | undefined
): string | undefined {
    if (!links) {
        return undefined;
    }

    for (const link of links) {
        if (!link.href) {
            continue;
        }
        if (link.rel === undefined || link.rel === "alternate") {
            return link.href;
        }
    }

    return undefined;
}

function toIsoDate(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return undefined;
    }

    return date.toISOString();
}
