import { describe, expect, test } from "bun:test";
import { getPreviewFromContent } from "link-preview-js";

import { extractPreviewImageUrls } from "@/lib/og/extract";

const BASE_URL = "https://example.com/page";

async function expectParity(html: string): Promise<void> {
    const reference = await getPreviewFromContent({
        data: html,
        headers: { "content-type": "text/html" },
        url: BASE_URL,
    });
    const referenceImages = "images" in reference ? reference.images : [];
    const actual = extractPreviewImageUrls(html, BASE_URL);
    expect(JSON.stringify(actual)).toBe(JSON.stringify(referenceImages));
}

describe("extractPreviewImageUrls — parity with link-preview-js", () => {
    test("single og:image via property", async () => {
        await expectParity(
            `<meta property="og:image" content="https://x.com/a.png">`
        );
    });

    test("og:image via name only when no property", async () => {
        await expectParity(
            `<meta name="og:image" content="https://x.com/b.png">`
        );
    });

    test("property og:image wins over name og:image", async () => {
        await expectParity(
            `<meta property="og:image" content="https://x.com/a.png">` +
                `<meta name="og:image" content="https://x.com/b.png">`
        );
    });

    test("uppercase attribute names are lowercased", async () => {
        await expectParity(
            `<meta PROPERTY="og:image" CONTENT="https://x.com/a.png">`
        );
    });

    test("decodes entities in the content url", async () => {
        await expectParity(
            `<meta property="og:image" content="https://x.com/a&amp;b.png">`
        );
    });

    test("ignores meta inside comments", async () => {
        await expectParity(
            `<!-- <meta property="og:image" content="https://x.com/comment.png"> -->` +
                `<meta property="og:image" content="https://x.com/real.png">`
        );
    });

    test("og:image:secure_url is not og:image", async () => {
        await expectParity(
            `<meta property="og:image:secure_url" content="https://x.com/s.png">` +
                `<img src="https://x.com/a.png">`
        );
    });

    test("multiple og:image in document order", async () => {
        await expectParity(
            `<meta property="og:image" content="https://x.com/first.png">` +
                `<meta property="og:image" content="https://x.com/second.png">`
        );
    });

    test("img fallback dedupes by raw src and resolves relative urls", async () => {
        await expectParity(
            `<img src="/rel.jpg"><img src="https://x.com/a.png">` +
                `<img src="/rel.jpg"><img src="https://x.com/b.png">`
        );
    });

    test("link[rel=image_src] takes precedence over img", async () => {
        await expectParity(
            `<link rel="image_src" href="/fav.png"><img src="https://x.com/a.png">`
        );
    });

    test("link[rel=image_src] without href falls through to img", async () => {
        await expectParity(
            `<link rel="image_src"><img src="https://x.com/a.png">`
        );
    });

    test("rel must be exactly image_src (no token match)", async () => {
        await expectParity(
            `<link rel="image_src other" href="/fav.png">` +
                `<img src="https://x.com/a.png">`
        );
    });

    test("non-image_src link before image_src does not block it", async () => {
        await expectParity(
            `<link rel="stylesheet" href="/style.css">` +
                `<link rel="image_src" href="/fav.png">` +
                `<img src="https://x.com/a.png">`
        );
    });

    test("empty property og:image suppresses lower precedence", async () => {
        await expectParity(
            `<meta property="og:image" content="">` +
                `<meta name="og:image" content="https://x.com/a.png">`
        );
    });

    test("missing property og:image content suppresses lower precedence", async () => {
        await expectParity(
            `<meta property="og:image">` +
                `<meta name="og:image" content="https://x.com/a.png">`
        );
    });

    test("relative og:image resolves against base url", async () => {
        await expectParity(`<meta property="og:image" content="/og/rel.png">`);
    });

    test("empty document yields no images", async () => {
        await expectParity("<!doctype html><html><body></body></html>");
    });

    test("realistic page with filler markup", async () => {
        const filler =
            `<div><p>${"lorem ipsum ".repeat(20)}</p>` +
            `<img src="/static/asset.jpg" alt="asset"></div>`;
        await expectParity(
            "<!doctype html><html><head><title>Page</title>" +
                `<meta property="og:image" content="https://x.com/og.png">` +
                `<meta name="twitter:image" content="https://x.com/tw.png">` +
                `</head><body>${filler.repeat(64)}</body></html>`
        );
    });

    test("no og:image, falls back to first img", async () => {
        await expectParity(
            "<!doctype html><html><body>" +
                `<img src="https://x.com/first.png">` +
                `<img src="https://x.com/second.png">` +
                "</body></html>"
        );
    });
});
