import { decodeHTMLAttribute } from "entities";
import { Parser } from "htmlparser2";

const HEAD_END_RE = /<\/head\s*>/i;

function resolveImageUrl(value: string, base: URL): string {
    const decoded = value.includes("&") ? decodeHTMLAttribute(value) : value;
    return new URL(decoded, base).href;
}

function extractWithParser(html: string, base: URL): string[] {
    const propertyOgImages: string[] = [];
    const nameOgImages: string[] = [];
    let imageSrcLinkChecked = false;
    let imageSrcLinkHref: string | null = null;
    const imgUrls: string[] = [];
    let seenImgSrc: Set<string> | null = null;
    let hasPropertyOgImage = false;
    let hasNameOgImage = false;

    const parser = new Parser(
        {
            onopentag(tag, attrs) {
                if (tag === "meta") {
                    const { content } = attrs;

                    if (attrs.property === "og:image") {
                        hasPropertyOgImage = true;
                        if (content) {
                            propertyOgImages.push(
                                resolveImageUrl(content, base)
                            );
                        }
                    } else if (
                        !hasPropertyOgImage &&
                        attrs.name === "og:image"
                    ) {
                        hasNameOgImage = true;
                        if (content) {
                            nameOgImages.push(resolveImageUrl(content, base));
                        }
                    }
                } else if (tag === "link") {
                    if (
                        hasPropertyOgImage ||
                        hasNameOgImage ||
                        imageSrcLinkChecked
                    ) {
                        return;
                    }
                    const { href } = attrs;
                    if (attrs.rel === "image_src") {
                        imageSrcLinkChecked = true;
                        if (href) {
                            imageSrcLinkHref = resolveImageUrl(href, base);
                        }
                    }
                } else if (tag === "img") {
                    if (
                        hasPropertyOgImage ||
                        hasNameOgImage ||
                        imageSrcLinkHref !== null
                    ) {
                        return;
                    }
                    const { src } = attrs;
                    if (!src) {
                        return;
                    }
                    if (seenImgSrc === null) {
                        seenImgSrc = new Set<string>();
                    }
                    if (!seenImgSrc.has(src)) {
                        seenImgSrc.add(src);
                        imgUrls.push(resolveImageUrl(src, base));
                    }
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

    if (propertyOgImages.length > 0) {
        return propertyOgImages;
    }
    if (nameOgImages.length > 0) {
        return nameOgImages;
    }
    if (imageSrcLinkHref !== null) {
        return [imageSrcLinkHref];
    }
    return imgUrls;
}

export function extractPreviewImageUrls(
    html: string,
    baseUrl: string
): string[] {
    const base = new URL(baseUrl);

    // Fast path for the common case: og:image is in <head> and not in <body>.
    // Small docs (<1 KiB, no </head>) skip the fast path to avoid overhead.
    if (html.length > 1024) {
        const headEnd = html.search(HEAD_END_RE);
        if (headEnd !== -1) {
            const gt = html.indexOf(">", headEnd);
            const headEndIdx = gt === -1 ? headEnd + 7 : gt + 1;
            const headHtml = html.slice(0, headEndIdx);
            if (headHtml.includes("og:image")) {
                const headResult = extractWithParser(headHtml, base);
                // If body doesn't contain og:image, headResult is final — covers both
                // valid property and empty-property suppression (return []).
                if (html.indexOf("og:image", headEndIdx) === -1) {
                    return headResult;
                }
                // Body has og:image (rare, e.g., <meta> in <body>) — need full scan for correctness.
            }
        }
    }

    return extractWithParser(html, base);
}
