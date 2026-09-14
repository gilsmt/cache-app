import { Parser } from "htmlparser2";
import { MIME_TYPES, USER_AGENT } from "@/lib/common/constants";
import {
    extractPreviewMetadata,
    type PreviewMetadata,
} from "@/lib/common/extract";
import { createLogger } from "@/lib/common/logs/console/logger";
import { fetchPublicRedirect } from "@/lib/common/security/fetch";

const log = createLogger("common:link-preview");

const HEAD_SCAN_MAX_BYTES = 512_000;
const MAX_REDIRECTS = 3;
const LINK_PREVIEW_ACCEPT_HEADER = "text/html,application/xhtml+xml";

export interface LinkPreviewResult extends PreviewMetadata {
    url: string;
}

/**
 * Fetches a URL and extracts its OpenGraph metadata using the same SSRF-safe
 * redirect walk the preview route uses. The body is read only through
 * `</head>`/`<body>` (most metadata lives in the head); the download resumes
 * only when the head produced no preview image, so the body's img fallbacks
 * still work. Returns null when the request is blocked, redirected too far,
 * non-2xx, non-HTML, or fails mid-read — it never throws.
 */
export async function fetchLinkPreview(
    url: string,
    options: { timeoutMs: number }
): Promise<LinkPreviewResult | null> {
    const result = await fetchPublicRedirect(url, {
        headers: {
            Accept: LINK_PREVIEW_ACCEPT_HEADER,
            "User-Agent": USER_AGENT,
        },
        maxRedirects: MAX_REDIRECTS,
        method: "GET",
        timeoutMs: options.timeoutMs,
    });
    if (result.status !== "response") {
        return null;
    }
    const { response } = result;

    try {
        if (response.status < 200 || response.status >= 300) {
            log.debug("Rejected link preview status", {
                status: response.status,
                url,
            });
            await discardResponseBody(response);
            return null;
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!isHtmlPreviewContentType(contentType)) {
            log.debug("Rejected link preview content type", {
                contentType,
                url,
            });
            await discardResponseBody(response);
            return null;
        }

        const baseUrl = response.url || url;
        const head = await readUntilHeadEnd(response);
        if (head.complete) {
            return {
                url: baseUrl,
                ...extractPreviewMetadata(head.text, baseUrl),
            };
        }

        const headMetadata = extractPreviewMetadata(head.text, baseUrl);
        if (headMetadata.images.length > 0) {
            // The head already decided the preview image; stop downloading.
            await discardPreviewBody(head);
            return { url: baseUrl, ...headMetadata };
        }

        const body = await readRemainingBody(head, HEAD_SCAN_MAX_BYTES);
        return {
            url: baseUrl,
            ...extractPreviewMetadata(body.text, baseUrl),
        };
    } catch {
        log.debug("Link preview fetch failed", { url });
        return null;
    }
}

function isHtmlPreviewContentType(contentType: string): boolean {
    const mime = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    return mime === MIME_TYPES.html || mime === MIME_TYPES.xhtml;
}

interface PreviewBodyRead {
    bytesRead: number;
    /** True when the stream hit EOF or the cap — no more content follows. */
    complete: boolean;
    decoder: TextDecoder | null;
    reader: ReadableStreamDefaultReader<Uint8Array> | null;
    text: string;
}

async function readUntilHeadEnd(response: Response): Promise<PreviewBodyRead> {
    const reader = response.body?.getReader() ?? null;
    if (reader === null) {
        return {
            bytesRead: 0,
            complete: true,
            decoder: null,
            reader: null,
            text: "",
        };
    }

    const decoder = new TextDecoder();
    let boundaryReached = false;
    let text = "";
    let bytesRead = 0;

    const parser = new Parser(
        {
            onclosetag(name) {
                if (name === "head") {
                    boundaryReached = true;
                }
            },
            onopentag(name) {
                if (name === "body") {
                    boundaryReached = true;
                }
            },
        },
        {
            decodeEntities: false,
            lowerCaseAttributeNames: true,
            lowerCaseTags: true,
        }
    );

    try {
        while (!boundaryReached) {
            if (bytesRead >= HEAD_SCAN_MAX_BYTES) {
                break;
            }
            const { done, value } = await reader.read();
            if (done) {
                text += decoder.decode();
                break;
            }
            bytesRead += value.byteLength;
            if (bytesRead > HEAD_SCAN_MAX_BYTES) {
                break;
            }
            const chunk = decoder.decode(value, { stream: true });
            text += chunk;
            parser.write(chunk);
        }

        if (boundaryReached) {
            return {
                bytesRead,
                complete: false,
                decoder,
                reader,
                text,
            };
        }

        await discardReader(reader);
        return {
            bytesRead,
            complete: true,
            decoder: null,
            reader: null,
            text,
        };
    } catch (error) {
        await discardReader(reader);
        throw error;
    }
}

async function readRemainingBody(
    head: PreviewBodyRead,
    maxBytes: number
): Promise<PreviewBodyRead> {
    const reader = head.reader;
    const decoder = head.decoder;
    if (reader === null || decoder === null) {
        return head;
    }

    let text = head.text;
    let bytesRead = head.bytesRead;
    try {
        for (;;) {
            if (bytesRead >= maxBytes) {
                break;
            }
            const { done, value } = await reader.read();
            if (done) {
                text += decoder.decode();
                break;
            }
            bytesRead += value.byteLength;
            if (bytesRead > maxBytes) {
                break;
            }
            text += decoder.decode(value, { stream: true });
        }
    } finally {
        await discardReader(reader);
    }
    return {
        bytesRead,
        complete: true,
        decoder: null,
        reader: null,
        text,
    };
}

async function discardPreviewBody(read: PreviewBodyRead): Promise<void> {
    const reader = read.reader;
    if (reader === null) {
        return;
    }
    await discardReader(reader);
}

async function discardReader(
    reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<void> {
    try {
        await reader
            .cancel("Link preview scan complete.")
            .catch(() => undefined);
    } finally {
        try {
            reader.releaseLock();
        } catch {
            // Reader already released or the stream errored.
        }
    }
}

async function discardResponseBody(response: Response): Promise<void> {
    await response.body?.cancel().catch(() => undefined);
}
