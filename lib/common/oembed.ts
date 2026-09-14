import * as z from "zod";
import { abortAfter } from "@/lib/common/abort";

const OEMBED_TIMEOUT_MS = 5000;
const OEMBED_FETCH_HEADERS = { Accept: "application/json" } as const;

export const OembedSchema = z.object({
    html: z.string().min(1),
    provider: z.string().min(1),
    title: z.string().nullable(),
});

export type Oembed = z.infer<typeof OembedSchema>;

interface OembedProvider {
    endpoint: (url: string) => string | null;
    name: string;
    pattern: RegExp;
}

export interface OembedFetchOptions {
    fetch?: (
        input: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1]
    ) => Promise<Response>;
    timeout?: number;
}

export interface OembedResult {
    author: string | null;
    authorUrl: string | null;
    height: number | null;
    html: string | null;
    provider: string;
    thumbnail: string | null;
    thumbnailHeight: number | null;
    thumbnailWidth: number | null;
    title: string | null;
    type: string;
    width: number | null;
}

const OEMBED_PROVIDERS: OembedProvider[] = [
    {
        endpoint: (url) =>
            `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        name: "youtube",
        pattern:
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]+)/,
    },
    {
        endpoint: (url) =>
            `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`,
        name: "vimeo",
        pattern: /vimeo\.com\/(\d+)/,
    },
    {
        endpoint: (url) =>
            `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`,
        name: "twitter",
        pattern: /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/,
    },
    {
        endpoint: (url) =>
            `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`,
        name: "spotify",
        pattern:
            /open\.spotify\.com\/(track|album|playlist|artist)\/([a-zA-Z0-9]+)/,
    },
    {
        endpoint: (url) =>
            `https://soundcloud.com/oembed?url=${encodeURIComponent(url)}&format=json`,
        name: "soundcloud",
        pattern: /soundcloud\.com\/[\w-]+\/[\w-]+/,
    },
    {
        endpoint: (url) =>
            `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`,
        name: "tiktok",
        pattern: /tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
    },
    {
        // Instagram's oEmbed needs the Graph API (access token), which the
        // consumer route requests directly. Detect-only: endpoint null means
        // fetchOembed() returns null instead of hitting the retired
        // api.instagram.com/oembed endpoint.
        endpoint: () => null,
        name: "instagram",
        pattern: /instagram\.com\/(?:p|reel)\/([a-zA-Z0-9_-]+)/,
    },
    {
        endpoint: (url) =>
            `https://codepen.io/api/oembed?url=${encodeURIComponent(url)}&format=json`,
        name: "codepen",
        pattern: /codepen\.io\/[\w-]+\/pen\/([a-zA-Z0-9]+)/,
    },
    {
        endpoint: (url) =>
            `https://codesandbox.io/oembed?url=${encodeURIComponent(url)}`,
        name: "codesandbox",
        pattern: /codesandbox\.io\/s\/([a-zA-Z0-9-]+)/,
    },
    {
        endpoint: (url) =>
            `https://www.figma.com/api/oembed?url=${encodeURIComponent(url)}`,
        name: "figma",
        pattern: /figma\.com\/(file|design|proto)\/([a-zA-Z0-9]+)/,
    },
];

const OembedProviderResponseSchema = z.object({
    author_name: z.string().nullish(),
    author_url: z.string().nullish(),
    height: z.coerce.number().nullish(),
    html: z.string().nullish(),
    thumbnail_height: z.coerce.number().nullish(),
    thumbnail_url: z.string().nullish(),
    thumbnail_width: z.coerce.number().nullish(),
    title: z.string().nullish(),
    type: z.string().nullish(),
    width: z.coerce.number().nullish(),
});

type OembedProviderResponse = z.infer<typeof OembedProviderResponseSchema>;

/**
 * Fetch oEmbed data for a URL from its provider's endpoint.
 *
 * Returns null when the URL has no known provider, the provider request fails,
 * or the response does not satisfy the oEmbed shape.
 */
export async function fetchOembed(
    url: string,
    options: OembedFetchOptions = {}
): Promise<OembedResult | null> {
    const provider = detectProvider(url);
    if (!provider) {
        return null;
    }

    const endpoint = provider.endpoint(url);
    if (!endpoint) {
        return null;
    }

    const fetchFn = options.fetch ?? fetch;
    const { signal, clearTimeout } = abortAfter(
        options.timeout ?? OEMBED_TIMEOUT_MS
    );

    try {
        const response = await fetchFn(endpoint, {
            headers: OEMBED_FETCH_HEADERS,
            signal,
        });
        if (!response.ok) {
            return null;
        }

        const parsed = OembedProviderResponseSchema.safeParse(
            await response.json()
        );
        if (!parsed.success) {
            return null;
        }

        return mapOembedResult(parsed.data, provider.name);
    } catch {
        return null;
    } finally {
        clearTimeout();
    }
}

/** Returns true when the URL matches a known oEmbed provider. */
export function hasOembedSupport(url: string): boolean {
    return detectProvider(url) !== null;
}

function detectProvider(url: string): OembedProvider | null {
    for (const provider of OEMBED_PROVIDERS) {
        if (provider.pattern.test(url)) {
            return provider;
        }
    }
    return null;
}

function mapOembedResult(
    data: OembedProviderResponse,
    provider: string
): OembedResult {
    return {
        author: data.author_name ?? null,
        authorUrl: data.author_url ?? null,
        height: data.height ?? null,
        html: data.html ?? null,
        provider,
        thumbnail: data.thumbnail_url ?? null,
        thumbnailHeight: data.thumbnail_height ?? null,
        thumbnailWidth: data.thumbnail_width ?? null,
        title: data.title ?? null,
        type: data.type ?? "rich",
        width: data.width ?? null,
    };
}
