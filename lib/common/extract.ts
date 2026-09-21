import { decodeHTML, decodeHTMLAttribute } from "entities";
import { Parser } from "htmlparser2";
import { tryParseUrl } from "@/lib/common/url";

const HEAD_END_RE = /<\/head\s*>/i;
const WHITESPACE_RE = /\s+/g;

export interface PreviewVideoMeta {
    height: string | undefined;
    secureUrl: string | null | undefined;
    type: string | null | undefined;
    url: string | undefined;
    width: string | undefined;
}

export interface PreviewMetadata {
    description: string | null;
    favicons: string[];
    imageHeight: string | undefined;
    images: string[];
    imageWidth: string | undefined;
    title: string | null;
    videos: PreviewVideoMeta[];
}

/**
 * Extracts the OpenGraph surface link-preview-js exposed (title, description,
 * images, videos, favicons) in a single pass
 */
export function extractPreviewMetadata(
    html: string,
    baseUrl: string
): PreviewMetadata {
    const base = tryParseUrl(baseUrl);
    if (!base) {
        return {
            description: null,
            favicons: [],
            imageHeight: undefined,
            images: [],
            imageWidth: undefined,
            title: null,
            videos: [],
        };
    }

    // Fast path for the common case: og:image is in <head> and not in <body>.
    // Small docs (<1 KiB, no </head>) skip the fast path to avoid overhead.
    if (html.length > 1024) {
        const headEnd = html.search(HEAD_END_RE);
        if (headEnd !== -1) {
            const gt = html.indexOf(">", headEnd);
            const headEndIdx = gt === -1 ? headEnd + 7 : gt + 1;
            const headHtml = html.slice(0, headEndIdx);

            const lowerHtml = html.toLowerCase();
            if (headHtml.toLowerCase().includes("og:image")) {
                const headResult = extractPreviewMetadataWithParser(
                    headHtml,
                    base
                );
                // Commit to the head result only when it produced an image
                // candidate and the body has no og:image of its own. An empty
                // headResult ("og:image" in unrelated head text, or an
                // empty-content og:image meta) must not decide the outcome —
                // the full scan applies the same precedence over the whole
                // document, including the image_src/img fallbacks.
                if (
                    headResult.images.length > 0 &&
                    lowerHtml.indexOf("og:image", headEndIdx) === -1
                ) {
                    return headResult;
                }
                // Body has og:image (rare, e.g., <meta> in <body>) or the head
                // scan found nothing usable — full scan for correctness.
            }
        }
    }

    return extractPreviewMetadataWithParser(html, base);
}

function resolveImageUrl(value: string, base: URL): string | null {
    const decoded = value.includes("&") ? decodeHTMLAttribute(value) : value;
    return tryParseUrl(decoded, base)?.href ?? null;
}

function tryResolveUrl(value: string, base: URL): string | null {
    return tryParseUrl(value, base)?.href ?? null;
}

function decodeMetadataValue(value: string | undefined): string | undefined {
    if (value === undefined || !value.includes("&")) {
        return value;
    }
    return decodeHTMLAttribute(value);
}

interface ImageDimensionMeta {
    nameHeight?: string;
    nameWidth?: string;
    propertyHeight?: string;
    propertyWidth?: string;
}

function accumulateImageDimensions(
    state: ImageDimensionMeta,
    name: string | undefined,
    property: string | undefined,
    content: string | undefined,
    seenPropertyImageCount: number,
    seenNameImageCount: number
): void {
    if (property === "og:image:width" && seenPropertyImageCount <= 1) {
        state.propertyWidth ??= content;
    } else if (name === "og:image:width" && seenNameImageCount <= 1) {
        state.nameWidth ??= content;
    } else if (property === "og:image:height" && seenPropertyImageCount <= 1) {
        state.propertyHeight ??= content;
    } else if (name === "og:image:height" && seenNameImageCount <= 1) {
        state.nameHeight ??= content;
    }
}

function normalizeMetadataText(value: string | undefined): string {
    return value ? value.replace(WHITESPACE_RE, " ").trim() : "";
}

function extractPreviewMetadataWithParser(
    html: string,
    base: URL
): PreviewMetadata {
    const propertyOgImages: string[] = [];
    const nameOgImages: string[] = [];
    let hasPropertyOgImageTag = false;
    // "" marks an image_src link seen without href; null means none seen.
    // Either way the first image_src link in document order wins, matching
    // cheerio's `.attr("href")` on the first match.
    let imageSrcLinkHref: string | null = null;
    const imgUrls: string[] = [];
    const seenImgSrc = new Set<string>();

    let propertyOgTitle: string | undefined;
    let nameOgTitle: string | undefined;
    let descriptionByName: string | undefined;
    let descriptionByNameCapital: string | undefined;
    let descriptionByOg: string | undefined;

    const propertyOgVideos: Array<string | undefined> = [];
    const nameOgVideos: Array<string | undefined> = [];
    const propertyOgVideoTypes: Array<string | undefined> = [];
    const nameOgVideoTypes: Array<string | undefined> = [];
    const propertyOgVideoSecureUrls: Array<string | undefined> = [];
    const nameOgVideoSecureUrls: Array<string | undefined> = [];
    let propertyOgVideoWidth: string | undefined;
    let nameOgVideoWidth: string | undefined;
    let propertyOgVideoHeight: string | undefined;
    let nameOgVideoHeight: string | undefined;
    const imageDimensions: ImageDimensionMeta = {};

    const faviconIconHrefs: string[] = [];
    const faviconShortcutIconHrefs: string[] = [];
    const faviconAppleTouchIconHrefs: string[] = [];

    const titleTextPieces: string[] = [];
    const openTags: string[] = [];
    let isHeadTitleElement = false;

    const handleMetaTag = (attrs: Record<string, string>) => {
        const content = decodeMetadataValue(attrs.content);
        const { name, property } = attrs;
        accumulateImageDimensions(
            imageDimensions,
            name,
            property,
            content,
            propertyOgImages.length,
            nameOgImages.length
        );
        if (property === "og:image") {
            hasPropertyOgImageTag = true;
            if (content) {
                const resolved = tryResolveUrl(content, base);
                if (resolved) {
                    propertyOgImages.push(resolved);
                }
            }
        } else if (name === "og:image" && content) {
            const resolved = tryResolveUrl(content, base);
            if (resolved) {
                nameOgImages.push(resolved);
            }
        } else if (property === "og:title") {
            propertyOgTitle ??= content;
        } else if (name === "og:title") {
            nameOgTitle ??= content;
        } else if (name === "description") {
            descriptionByName ??= content;
        } else if (name === "Description") {
            descriptionByNameCapital ??= content;
        } else if (property === "og:description") {
            descriptionByOg ??= content;
        } else if (property === "og:video") {
            propertyOgVideos.push(content);
        } else if (name === "og:video") {
            nameOgVideos.push(content);
        } else if (property === "og:video:type") {
            propertyOgVideoTypes.push(content);
        } else if (name === "og:video:type") {
            nameOgVideoTypes.push(content);
        } else if (property === "og:video:secure_url") {
            propertyOgVideoSecureUrls.push(content);
        } else if (name === "og:video:secure_url") {
            nameOgVideoSecureUrls.push(content);
        } else if (property === "og:video:width") {
            propertyOgVideoWidth ??= content;
        } else if (name === "og:video:width") {
            nameOgVideoWidth ??= content;
        } else if (property === "og:video:height") {
            propertyOgVideoHeight ??= content;
        } else if (name === "og:video:height") {
            nameOgVideoHeight ??= content;
        }
    };

    const handleLinkTag = (attrs: Record<string, string>) => {
        if (attrs.rel === "image_src" && imageSrcLinkHref === null) {
            imageSrcLinkHref = attrs.href
                ? (resolveImageUrl(attrs.href, base) ?? "")
                : "";
        }
        const href = attrs.href ? resolveImageUrl(attrs.href, base) : null;
        if (href !== null) {
            if (attrs.rel === "icon") {
                faviconIconHrefs.push(href);
            } else if (attrs.rel === "shortcut icon") {
                faviconShortcutIconHrefs.push(href);
            } else if (attrs.rel === "apple-touch-icon") {
                faviconAppleTouchIconHrefs.push(href);
            }
        }
    };

    const handleImgTag = (attrs: Record<string, string>) => {
        const { src } = attrs;
        if (!src || seenImgSrc.has(src)) {
            return;
        }
        seenImgSrc.add(src);
        const resolved = resolveImageUrl(src, base);
        if (resolved) {
            imgUrls.push(resolved);
        }
    };

    const parser = new Parser(
        {
            onclosetag(tag) {
                if (tag === "title") {
                    isHeadTitleElement = false;
                }
                // Guard against stray closes in malformed HTML: only pop
                // when the stack top matches, so a stray </div> inside
                // <head> cannot pop the head element and hide a later title.
                if (openTags.at(-1) === tag) {
                    openTags.pop();
                }
            },
            onopentag(tag, attrs) {
                openTags.push(tag);

                if (tag === "title") {
                    // Mirrors cheerio's `head > title`: only a title whose
                    // direct parent is the head element counts.
                    const parent = openTags.at(-2);
                    isHeadTitleElement = parent === "head";
                    return;
                }
                if (tag === "meta") {
                    handleMetaTag(attrs);
                    return;
                }
                if (tag === "link") {
                    handleLinkTag(attrs);
                    return;
                }
                if (tag === "img") {
                    handleImgTag(attrs);
                }
            },
            ontext(text) {
                if (isHeadTitleElement) {
                    titleTextPieces.push(text);
                }
            },
        },
        {
            decodeEntities: false,
            lowerCaseAttributeNames: true,
            lowerCaseTags: true,
        }
    );
    parser.write(html);
    parser.end();

    const titleText = decodeHTML(titleTextPieces.join(""));
    const title =
        normalizeMetadataText(propertyOgTitle || nameOgTitle || titleText) ||
        null;

    const description =
        normalizeMetadataText(
            descriptionByName || descriptionByNameCapital || descriptionByOg
        ) || null;

    // Precedence mirrors link-preview-js getImages(): property og:image metas
    // win; the name variant only applies when no property tag exists at all;
    // and a meta-only outcome with zero usable images (e.g., empty content)
    // still falls through to the image_src/img candidates.
    let images: string[];
    if (propertyOgImages.length > 0) {
        images = propertyOgImages;
    } else if (!hasPropertyOgImageTag && nameOgImages.length > 0) {
        images = nameOgImages;
    } else if (imageSrcLinkHref) {
        images = [imageSrcLinkHref];
    } else {
        images = imgUrls;
    }

    const videoUrls =
        propertyOgVideos.length > 0 ? propertyOgVideos : nameOgVideos;
    const videoTypes =
        propertyOgVideoTypes.length > 0
            ? propertyOgVideoTypes
            : nameOgVideoTypes;
    const videoSecureUrls =
        propertyOgVideoSecureUrls.length > 0
            ? propertyOgVideoSecureUrls
            : nameOgVideoSecureUrls;
    const width = propertyOgVideoWidth || nameOgVideoWidth;
    const height = propertyOgVideoHeight || nameOgVideoHeight;
    const videos: PreviewVideoMeta[] = [];
    for (let index = 0; index < videoUrls.length; index += 1) {
        const video = {
            height,
            secureUrl: videoSecureUrls[index],
            type: videoTypes[index],
            url: videoUrls[index],
            width,
        };
        // Mirror link-preview-js: video/ prefixed types splice to the front so
        // native videos win over "video embed" fallbacks.
        if (video.type?.startsWith("video/")) {
            videos.unshift(video);
        } else {
            videos.push(video);
        }
    }

    // Mirror link-preview-js getFavicons(): rel groups are collected in
    // selector order (icon, shortcut icon, apple-touch-icon), each in document
    // order, defaulting to the host-root favicon when nothing matched.
    const faviconHrefs = [
        ...faviconIconHrefs,
        ...faviconShortcutIconHrefs,
        ...faviconAppleTouchIconHrefs,
    ];
    if (faviconHrefs.length === 0) {
        const fallback = tryResolveUrl("/favicon.ico", base);
        if (fallback) {
            faviconHrefs.push(fallback);
        }
    }

    return {
        description,
        favicons: faviconHrefs,
        imageHeight:
            imageDimensions.propertyHeight || imageDimensions.nameHeight,
        images,
        imageWidth: imageDimensions.propertyWidth || imageDimensions.nameWidth,
        title,
        videos,
    };
}
