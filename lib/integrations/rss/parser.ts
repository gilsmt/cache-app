import Parser from "rss-parser";
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

const parser = new Parser();

export async function parseFeed(url: string): Promise<ParsedFeed> {
    // One budget for the whole chain: per-hop timeouts would multiply the
    // deadline across redirects instead of bounding the total walk.
    const deadline = abortAfter(FETCH_TIMEOUT_MS);
    let response: Response;
    let xml: string;

    try {
        const result = await fetchPublicRedirect(url, {
            headers: {
                "User-Agent": "Cache/1.0 RSS",
            },
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
        xml = body.text;
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

    let feed: Parser.Output<Record<string, unknown>>;

    try {
        feed = await parser.parseString(xml);
    } catch (error) {
        throw new RssFeedError(
            {
                kind: "parse_failed",
                message:
                    error instanceof Error
                        ? error.message
                        : "Failed to parse the feed XML.",
            },
            { cause: error }
        );
    }

    return {
        description: feed.description,
        items: (feed.items ?? []).map((item) => ({
            categories: item.categories,
            creator: item.creator,
            guid: item.guid ?? item.link,
            isoDate: item.isoDate ?? item.pubDate,
            link: item.link,
            title: item.title,
        })),
        link: feed.link,
        title: feed.title,
    };
}
