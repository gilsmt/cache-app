import { describe, expect, test } from "bun:test";

import {
    extractPreviewMetadata,
    type PreviewVideoMeta,
} from "@/lib/common/extract";

const BASE_URL = "https://example.com/page";

const FILLER =
    `<div><p>${"lorem ipsum ".repeat(20)}</p>` +
    `<img src="/static/asset.jpg" alt="asset"></div>`;

function imagesOf(html: string): string[] {
    return extractPreviewMetadata(html, BASE_URL).images;
}

function titleOf(html: string): string | null {
    return extractPreviewMetadata(html, BASE_URL).title;
}

function descriptionOf(html: string): string | null {
    return extractPreviewMetadata(html, BASE_URL).description;
}

function videosOf(html: string): PreviewVideoMeta[] {
    return extractPreviewMetadata(html, BASE_URL).videos;
}

function faviconsOf(html: string): string[] {
    return extractPreviewMetadata(html, BASE_URL).favicons;
}

// Golden values were captured from link-preview-js getPreviewFromContent
// before the dependency was removed, so image precedence stays provably intact.

describe("extractPreviewMetadata — images", () => {
    test("single og:image via property", () => {
        expect(
            imagesOf(`<meta property="og:image" content="https://x.com/a.png">`)
        ).toEqual(["https://x.com/a.png"]);
    });

    test("og:image via name only when no property", () => {
        expect(
            imagesOf(`<meta name="og:image" content="https://x.com/b.png">`)
        ).toEqual(["https://x.com/b.png"]);
    });

    test("property og:image wins over name og:image", () => {
        expect(
            imagesOf(
                `<meta property="og:image" content="https://x.com/a.png">` +
                    `<meta name="og:image" content="https://x.com/b.png">`
            )
        ).toEqual(["https://x.com/a.png"]);
    });

    test("uppercase attribute names are lowercased", () => {
        expect(
            imagesOf(`<meta PROPERTY="og:image" CONTENT="https://x.com/a.png">`)
        ).toEqual(["https://x.com/a.png"]);
    });

    test("decodes entities in the content url", () => {
        expect(
            imagesOf(
                `<meta property="og:image" content="https://x.com/a&amp;b.png">`
            )
        ).toEqual(["https://x.com/a&b.png"]);
    });

    test("ignores meta inside comments", () => {
        expect(
            imagesOf(
                `<!-- <meta property="og:image" content="https://x.com/comment.png"> -->` +
                    `<meta property="og:image" content="https://x.com/real.png">`
            )
        ).toEqual(["https://x.com/real.png"]);
    });

    test("og:image:secure_url is not og:image", () => {
        expect(
            imagesOf(
                `<meta property="og:image:secure_url" content="https://x.com/s.png">` +
                    `<img src="https://x.com/a.png">`
            )
        ).toEqual(["https://x.com/a.png"]);
    });

    test("multiple og:image in document order", () => {
        expect(
            imagesOf(
                `<meta property="og:image" content="https://x.com/first.png">` +
                    `<meta property="og:image" content="https://x.com/second.png">`
            )
        ).toEqual(["https://x.com/first.png", "https://x.com/second.png"]);
    });

    test("img fallback dedupes by raw src and resolves relative urls", () => {
        expect(
            imagesOf(
                `<img src="/rel.jpg"><img src="https://x.com/a.png">` +
                    `<img src="/rel.jpg"><img src="https://x.com/b.png">`
            )
        ).toEqual([
            "https://example.com/rel.jpg",
            "https://x.com/a.png",
            "https://x.com/b.png",
        ]);
    });
    test("link[rel=image_src] takes precedence over img", () => {
        expect(
            imagesOf(
                `<link rel="image_src" href="/fav.png"><img src="https://x.com/a.png">`
            )
        ).toEqual(["https://example.com/fav.png"]);
    });

    test("link[rel=image_src] without href falls through to img", () => {
        expect(
            imagesOf(`<link rel="image_src"><img src="https://x.com/a.png">`)
        ).toEqual(["https://x.com/a.png"]);
    });

    test("rel must be exactly image_src (no token match)", () => {
        expect(
            imagesOf(
                `<link rel="image_src other" href="/fav.png">` +
                    `<img src="https://x.com/a.png">`
            )
        ).toEqual(["https://x.com/a.png"]);
    });

    test("non-image_src link before image_src does not block it", () => {
        expect(
            imagesOf(
                `<link rel="stylesheet" href="/style.css">` +
                    `<link rel="image_src" href="/fav.png">` +
                    `<img src="https://x.com/a.png">`
            )
        ).toEqual(["https://example.com/fav.png"]);
    });

    test("empty property og:image suppresses lower precedence", () => {
        expect(
            imagesOf(
                `<meta property="og:image" content="">` +
                    `<meta name="og:image" content="https://x.com/a.png">`
            )
        ).toEqual([]);
    });

    test("missing property og:image content suppresses lower precedence", () => {
        expect(
            imagesOf(
                `<meta property="og:image">` +
                    `<meta name="og:image" content="https://x.com/a.png">`
            )
        ).toEqual([]);
    });

    test("relative og:image resolves against base url", () => {
        expect(
            imagesOf(`<meta property="og:image" content="/og/rel.png">`)
        ).toEqual(["https://example.com/og/rel.png"]);
    });

    test("empty document yields no images", () => {
        expect(imagesOf("<!doctype html><html><body></body></html>")).toEqual(
            []
        );
    });

    test("realistic page with filler markup", () => {
        expect(
            imagesOf(
                "<!doctype html><html><head><title>Page</title>" +
                    `<meta property="og:image" content="https://x.com/og.png">` +
                    `<meta name="twitter:image" content="https://x.com/tw.png">` +
                    `</head><body>${FILLER.repeat(64)}</body></html>`
            )
        ).toEqual(["https://x.com/og.png"]);
    });

    test("no og:image, falls back to first img", () => {
        expect(
            imagesOf(
                "<!doctype html><html><body>" +
                    `<img src="https://x.com/first.png">` +
                    `<img src="https://x.com/second.png">` +
                    "</body></html>"
            )
        ).toEqual(["https://x.com/first.png", "https://x.com/second.png"]);
    });

    test("head with only the og:image substring does not suppress body img fallback", () => {
        // Exceeds the 1 KiB fast-path threshold so the head scan engages: the
        // head mentions "og:image" in text but has no og:image meta, so the
        // empty head result must fall through to the body imgs.
        expect(
            imagesOf(
                "<!doctype html><html><head><title>og:image guide</title></head>" +
                    `<body>${FILLER.repeat(4)}` +
                    `<img src="https://x.com/body.png">` +
                    "</body></html>"
            )
        ).toEqual([
            "https://example.com/static/asset.jpg",
            "https://x.com/body.png",
        ]);
    });

    test("empty-content head og:image falls through to body img fallback", () => {
        expect(
            imagesOf(
                "<!doctype html><html><head>" +
                    `<meta property="og:image" content="">` +
                    "</head>" +
                    `<body>${FILLER.repeat(4)}` +
                    `<img src="https://x.com/body.png">` +
                    "</body></html>"
            )
        ).toEqual([
            "https://example.com/static/asset.jpg",
            "https://x.com/body.png",
        ]);
    });
});

describe("extractPreviewMetadata — title", () => {
    test("property og:title wins over name og:title", () => {
        expect(
            titleOf(
                `<meta property="og:title" content="Prop Title">` +
                    `<meta name="og:title" content="Name Title">`
            )
        ).toBe("Prop Title");
    });

    test("name og:title fallback", () => {
        expect(titleOf(`<meta name="og:title" content="Name Title">`)).toBe(
            "Name Title"
        );
    });

    test("og:title falls back to head title", () => {
        expect(
            titleOf("<html><head><title>My Page</title></head></html>")
        ).toBe("My Page");
    });

    test("nested title outside direct head child", () => {
        expect(
            titleOf(
                "<html><head><div><title>Nested</title></div></head></html>"
            )
        ).toBeNull();
    });

    test("empty property og:title falls through to name", () => {
        expect(
            titleOf(
                `<meta property="og:title" content="">` +
                    `<meta name="og:title" content="Filled">`
            )
        ).toBe("Filled");
    });

    test("title text entities decoded and whitespace normalized", () => {
        expect(
            titleOf(
                "<html><head><title>\n  Hello &amp; Welcome  \n</title></head></html>"
            )
        ).toBe("Hello & Welcome");
    });

    test("body title is ignored", () => {
        expect(
            titleOf("<html><body><title>Body Title</title></body></html>")
        ).toBeNull();
    });

    test("no title at all", () => {
        expect(
            titleOf("<!doctype html><html><head></head><body></body></html>")
        ).toBeNull();
    });
});

describe("extractPreviewMetadata — description", () => {
    test("name description wins over others", () => {
        expect(
            descriptionOf(
                `<meta name="description" content="ByName">` +
                    `<meta name="Description" content="Cap">` +
                    `<meta property="og:description" content="ByOg">`
            )
        ).toBe("ByName");
    });

    test("capital Description fallback", () => {
        expect(
            descriptionOf(
                `<meta name="Description" content="CapDesc">` +
                    `<meta property="og:description" content="OgDesc">`
            )
        ).toBe("CapDesc");
    });

    test("og:description fallback only", () => {
        expect(
            descriptionOf(`<meta property="og:description" content="Og Only">`)
        ).toBe("Og Only");
    });

    test("empty description content falls through", () => {
        expect(
            descriptionOf(
                `<meta name="description" content="">` +
                    `<meta property="og:description" content="OgFill">`
            )
        ).toBe("OgFill");
    });

    test("description entities decoded and whitespace normalized", () => {
        expect(
            descriptionOf(
                `<meta name="description" content="\n  Desc &amp; More\n">`
            )
        ).toBe("Desc & More");
    });
});

describe("extractPreviewMetadata — videos", () => {
    test("video/ prefixed types get pushed to the front", () => {
        expect(
            videosOf(
                `<meta property="og:video" content="https://v/1">` +
                    `<meta property="og:video" content="https://v/2">` +
                    `<meta property="og:video:type" content="text/html">` +
                    `<meta property="og:video:type" content="video/mp4">`
            )
        ).toEqual([
            {
                height: undefined,
                secureUrl: undefined,
                type: "video/mp4",
                url: "https://v/2",
                width: undefined,
            },
            {
                height: undefined,
                secureUrl: undefined,
                type: "text/html",
                url: "https://v/1",
                width: undefined,
            },
        ]);
    });

    test("secure_url, width and height pair positionally", () => {
        expect(
            videosOf(
                `<meta property="og:video:secure_url" content="https://v/s1">` +
                    `<meta property="og:video" content="https://v/1">` +
                    `<meta property="og:video:width" content="640">` +
                    `<meta property="og:video:height" content="360">`
            )
        ).toEqual([
            {
                height: "360",
                secureUrl: "https://v/s1",
                type: undefined,
                url: "https://v/1",
                width: "640",
            },
        ]);
    });

    test("name og:video fallback used when no property", () => {
        expect(
            videosOf(
                `<meta name="og:video" content="https://v/3">` +
                    `<meta name="og:video:type" content="video/webm">`
            )
        ).toEqual([
            {
                height: undefined,
                secureUrl: undefined,
                type: "video/webm",
                url: "https://v/3",
                width: undefined,
            },
        ]);
    });

    test("property og:video:type wins over name type", () => {
        expect(
            videosOf(
                `<meta property="og:video" content="https://v/4">` +
                    `<meta name="og:video:type" content="text/html">` +
                    `<meta property="og:video:type" content="video/quicktime">`
            )
        ).toEqual([
            {
                height: undefined,
                secureUrl: undefined,
                type: "video/quicktime",
                url: "https://v/4",
                width: undefined,
            },
        ]);
    });

    test("no og:video yields empty list", () => {
        expect(videosOf("<!doctype html><html><head></head></html>")).toEqual(
            []
        );
    });
});

describe("extractPreviewMetadata — favicons", () => {
    test("icon group collected before apple-touch-icon regardless of document order", () => {
        expect(
            faviconsOf(
                `<link rel="apple-touch-icon" href="/apple.png">` +
                    `<link rel="icon" href="/icon.png">`
            )
        ).toEqual([
            "https://example.com/icon.png",
            "https://example.com/apple.png",
        ]);
    });

    test("shortcut icon group follows icon group", () => {
        expect(
            faviconsOf(
                `<link rel="shortcut icon" href="/short.ico">` +
                    `<link rel="icon" href="/a.ico">` +
                    `<link rel="icon" href="/b.ico">`
            )
        ).toEqual([
            "https://example.com/a.ico",
            "https://example.com/b.ico",
            "https://example.com/short.ico",
        ]);
    });

    test("defaults to root favicon when no icon link matches", () => {
        expect(
            faviconsOf("<!doctype html><html><head></head><body></body></html>")
        ).toEqual(["https://example.com/favicon.ico"]);
    });

    test("icon link without href yields default favicon", () => {
        expect(faviconsOf(`<link rel="icon">`)).toEqual([
            "https://example.com/favicon.ico",
        ]);
    });
});

describe("extractPreviewMetadata — combined", () => {
    test("realistic page returns the full metadata surface", () => {
        expect(
            extractPreviewMetadata(
                "<!doctype html><html><head><title>Page</title>" +
                    `<meta property="og:image" content="https://x.com/og.png">` +
                    `<meta name="twitter:image" content="https://x.com/tw.png">` +
                    `</head><body>${FILLER.repeat(64)}</body></html>`,
                BASE_URL
            )
        ).toEqual({
            description: null,
            favicons: ["https://example.com/favicon.ico"],
            images: ["https://x.com/og.png"],
            title: "Page",
            videos: [],
        });
    });
});
