import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@/lib/common/security/ssrf-url", () => ({
    parsePublicHttpUrl: (value: string) => {
        try {
            return Promise.resolve(new URL(value));
        } catch {
            return Promise.resolve(null);
        }
    },
}));

const { GET } = await import("./route");

const originalFetch = globalThis.fetch;

const INSTAGRAM_OEMBED_ENDPOINT =
    "https://graph.facebook.com/v26.0/instagram_oembed";

function oembedRequest(targetUrl: string): Request {
    return new Request(
        `https://cachd.app/api/oembed?url=${encodeURIComponent(targetUrl)}`
    );
}

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("oEmbed route Instagram handling", () => {
    test("resolves an Instagram URL through the tokenless Graph endpoint", async () => {
        const fetchSpy = mock((_input: Parameters<typeof fetch>[0]) =>
            Promise.resolve(
                Response.json({
                    html: '<blockquote class="instagram-media"></blockquote>',
                    provider_name: "Instagram",
                    title: null,
                })
            )
        );
        globalThis.fetch = fetchSpy as unknown as typeof fetch;

        const response = await GET(
            oembedRequest("https://www.instagram.com/p/CabcDEF123/")
        );

        expect(response.status).toBe(200);
        const body = (await response.json()) as {
            html: string;
            provider: string;
        };
        expect(body.provider).toBe("instagram");
        expect(body.html).toContain("instagram-media");

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const requestedUrl = String(fetchSpy.mock.calls[0]?.[0]);
        expect(requestedUrl).toContain(INSTAGRAM_OEMBED_ENDPOINT);
        expect(requestedUrl).not.toContain("access_token");
    });
});
