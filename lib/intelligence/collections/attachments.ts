import "server-only";

import { randomUUID } from "node:crypto";
import { open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { FileState, GoogleGenAI } from "@google/genai";
import type { FilePart, TextPart } from "ai";
import mime from "mime-types";
import { serverEnv } from "@/env/server";
import { abortAfter } from "@/lib/common/abort";
import { unique } from "@/lib/common/array";
import { MIME_TYPES } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { fetchPublicRedirect } from "@/lib/common/security/fetch";
import { decodeHtmlEntities, normalizeWhitespace } from "@/lib/common/string";
import { isHttpUrl } from "@/lib/common/url";
import { resolveCobaltDownloadUrl } from "@/lib/integrations/cobalt/service";
import type { GenerationContent } from "@/lib/intelligence/generation";
import { type LibraryItemKind, LibraryItemSource } from "@/prisma/client/enums";

const log = createLogger("intelligence:smart-collections:attachments");

const ATTACHMENT_DOWNLOAD_BYTES_MAX = 100 * 1024 * 1024;
const ATTACHMENT_TEXT_LENGTH_MAX = 12_000;
const ATTACHMENT_TEXT_READ_BYTES_MAX = 2 * 1024 * 1024;
const ATTACHMENT_FILE_READY_ATTEMPT_COUNT_MAX = 20;
const ATTACHMENT_FILE_READY_DELAY_MS = 1500;
const ATTACHMENT_FETCH_TIMEOUT_MS = 20_000;
const ATTACHMENT_FETCH_MAX_REDIRECTS = 5;
const ATTACHMENT_DISPLAY_NAME_MAX_LENGTH = 128;

const PATTERN_HTML_TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const PATTERN_HTML_DESCRIPTION =
    /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i;

export interface SmartCollectionItem {
    caption: string | null;
    collections: Array<{
        id: string;
        name: string;
    }>;
    id: string;
    kind: LibraryItemKind;
    source: LibraryItemSource;
    sourceMetadata: unknown;
    url: string;
}

/** Attachment content plus the plain-text slice used for abuse estimation. */
export interface SmartCollectionAttachment {
    cleanup?: () => Promise<void>;
    content: GenerationContent;
    protectionText?: string;
}

interface DownloadedRemoteAsset {
    cleanup: () => Promise<void>;
    mimeType: string;
    path: string;
    sourceUrl: string;
}

let googleGenAi: GoogleGenAI | undefined;

function getGoogleGenAi(): GoogleGenAI {
    googleGenAi ??= new GoogleGenAI({ apiKey: serverEnv.GEMINI_API_KEY });
    return googleGenAi;
}

export function sourceLabel(source: LibraryItemSource): string {
    switch (source) {
        case LibraryItemSource.cache_note:
            return "Note";
        case LibraryItemSource.chrome_bookmarks:
            return "Chrome bookmark";
        case LibraryItemSource.extension_clip:
            return "Extension clip";
        case LibraryItemSource.github_starred_repositories:
            return "GitHub repository";
        case LibraryItemSource.google_photos:
            return "Google Photos item";
        case LibraryItemSource.instagram:
            return "Instagram save";
        case LibraryItemSource.other:
            return "Saved item";
        case LibraryItemSource.pinterest:
            return "Pinterest pin";
        case LibraryItemSource.tiktok:
            return "TikTok favorite";
        case LibraryItemSource.x_bookmarks:
            return "X bookmark";
        case LibraryItemSource.youtube_watch_later:
            return "YouTube video";
        default:
            return "Saved item";
    }
}

function inferDownloadAssetType(
    contentTypeHeader: string | null,
    url: string
): { extension: string; mimeType: string } {
    const headerExt = contentTypeHeader
        ? mime.extension(contentTypeHeader)
        : false;
    if (headerExt) {
        return {
            extension: `.${headerExt}`,
            mimeType: mime.lookup(headerExt) || MIME_TYPES.binary,
        };
    }
    try {
        const pathExt = extname(new URL(url).pathname).toLowerCase();
        const lookupType = pathExt ? mime.lookup(pathExt) : false;
        if (lookupType) {
            return { extension: pathExt, mimeType: lookupType };
        }
    } catch {
        // URL parse failure — fall through
    }
    return { extension: ".bin", mimeType: MIME_TYPES.binary };
}

function extractHtmlContent(input: string): string {
    const title = input.match(PATTERN_HTML_TITLE)?.[1]?.trim();
    const description = input.match(PATTERN_HTML_DESCRIPTION)?.[1]?.trim();
    const body = input
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " ");

    return normalizeWhitespace(
        decodeHtmlEntities(
            [
                title && `Title: ${title}`,
                description && `Description: ${description}`,
                body,
            ]
                .filter(Boolean)
                .join("\n")
        )
    );
}

function extractTextContent(input: string, mimeType: string): string {
    if (
        mimeType === MIME_TYPES.html ||
        mimeType === MIME_TYPES.xhtml ||
        mimeType === MIME_TYPES.xml
    ) {
        return extractHtmlContent(input);
    }

    return normalizeWhitespace(input);
}

function isTextLikeMimeType(mimeType: string): boolean {
    return (
        mimeType.startsWith("text/") ||
        mimeType === MIME_TYPES.json ||
        mimeType === "application/ld+json" ||
        mimeType === MIME_TYPES.xml ||
        mimeType === MIME_TYPES.xhtml
    );
}

async function readTextFilePrefix(path: string): Promise<string> {
    const buffer = Buffer.alloc(ATTACHMENT_TEXT_READ_BYTES_MAX);
    const handle = await open(/* turbopackIgnore: true */ path, "r");
    try {
        let totalBytes = 0;
        while (totalBytes < ATTACHMENT_TEXT_READ_BYTES_MAX) {
            const { bytesRead } = await handle.read(
                buffer,
                totalBytes,
                ATTACHMENT_TEXT_READ_BYTES_MAX - totalBytes,
                totalBytes
            );
            if (bytesRead === 0) {
                break;
            }
            totalBytes += bytesRead;
        }
        return buffer.subarray(0, totalBytes).toString("utf8");
    } finally {
        await handle.close();
    }
}

async function downloadRemoteAsset(
    url: string
): Promise<DownloadedRemoteAsset | null> {
    // One budget for the whole chain: per-hop timeouts would multiply the
    // deadline across redirects instead of bounding the total walk.
    const deadline = abortAfter(ATTACHMENT_FETCH_TIMEOUT_MS);
    let filePath: string | null = null;
    let shouldKeepFile = false;

    try {
        const result = await fetchPublicRedirect(url, {
            headers: {
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,video/*,application/pdf,*/*;q=0.8",
            },
            maxRedirects: ATTACHMENT_FETCH_MAX_REDIRECTS,
            signal: deadline.signal,
            timeoutMs: ATTACHMENT_FETCH_TIMEOUT_MS,
        });
        if (result.status !== "response") {
            return null;
        }

        const { response } = result;
        if (!(response.ok && response.body)) {
            // Release the connection on the reject path too, matching the
            // sibling preview/link-preview fetchers.
            await response.body?.cancel().catch(() => undefined);
            return null;
        }

        const resolvedUrl = response.url || url;
        const { extension, mimeType } = inferDownloadAssetType(
            response.headers.get("content-type"),
            resolvedUrl
        );
        const candidatePath = join(
            /* turbopackIgnore: true */ tmpdir(),
            `cache-smart-collections-${randomUUID()}${extension}`
        );
        const fileHandle = await open(
            /* turbopackIgnore: true */ candidatePath,
            "wx"
        );
        filePath = candidatePath;
        const reader = response.body.getReader();
        let downloadedBytes = 0;

        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                if (!value) {
                    continue;
                }

                downloadedBytes += value.byteLength;
                if (downloadedBytes > ATTACHMENT_DOWNLOAD_BYTES_MAX) {
                    await reader.cancel(
                        "Smart collections asset exceeded the maximum download size."
                    );
                    return null;
                }

                await fileHandle.write(value);
            }
        } finally {
            await fileHandle.close();
        }

        if (filePath === null) {
            throw new Error("Remote asset download did not create a file.");
        }

        const downloadedPath = filePath;
        shouldKeepFile = true;
        return {
            cleanup: async () => {
                await rm(/* turbopackIgnore: true */ downloadedPath, {
                    force: true,
                });
            },
            mimeType,
            path: downloadedPath,
            sourceUrl: resolvedUrl,
        };
    } catch {
        return null;
    } finally {
        deadline.clearTimeout();
        if (!(shouldKeepFile || filePath === null)) {
            await rm(/* turbopackIgnore: true */ filePath, {
                force: true,
            }).catch(() => undefined);
        }
    }
}

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForGeminiFile(
    ai: GoogleGenAI,
    file: {
        error?: { message?: string } | null;
        mimeType?: string;
        name?: string;
        state?: FileState;
        uri?: string;
    }
): Promise<{ mimeType: string; name: string; uri: string }> {
    if (!file.name) {
        throw new Error("Gemini upload did not return a file name.");
    }

    let currentFile = file;
    for (
        let attempt = 0;
        attempt < ATTACHMENT_FILE_READY_ATTEMPT_COUNT_MAX;
        attempt += 1
    ) {
        if (
            currentFile.state === undefined ||
            currentFile.state === FileState.ACTIVE
        ) {
            if (!currentFile.uri) {
                throw new Error("Gemini upload did not return a file URI.");
            }

            return {
                mimeType: currentFile.mimeType ?? MIME_TYPES.binary,
                name: currentFile.name ?? file.name,
                uri: currentFile.uri,
            };
        }

        if (currentFile.state === FileState.FAILED) {
            throw new Error(
                currentFile.error?.message ||
                    "Gemini failed to process the uploaded asset."
            );
        }

        await delay(ATTACHMENT_FILE_READY_DELAY_MS);
        currentFile = await ai.files.get({ name: file.name });
    }

    throw new Error("Gemini file processing timed out.");
}

/**
 * Uploads the asset to the Gemini Files API and returns it as an AI SDK file
 * part; the SDK sends URL file data as a Gemini fileData URI.
 */
async function uploadRemoteAsset(
    asset: DownloadedRemoteAsset,
    displayName: string
): Promise<{ cleanup: () => Promise<void>; filePart: FilePart }> {
    const ai = getGoogleGenAi();
    const upload = await ai.files.upload({
        config: {
            displayName,
            mimeType: asset.mimeType,
        },
        file: asset.path,
    });

    const readyFile = await waitForGeminiFile(ai, upload);
    const cleanup = async () => {
        await ai.files.delete({ name: readyFile.name }).catch(() => undefined);
    };

    let filePart: FilePart;
    try {
        filePart = {
            data: new URL(readyFile.uri),
            mediaType: readyFile.mimeType,
            type: "file",
        };
    } catch (error) {
        // The upload succeeded but the part did not build; delete the file so
        // the user's Files API quota is not orphaned.
        await cleanup();
        throw error;
    }

    await asset.cleanup();

    return { cleanup, filePart };
}

function displayNameForItem(item: SmartCollectionItem, url: string): string {
    const base =
        item.caption?.trim() ||
        basename(new URL(url).pathname) ||
        `${sourceLabel(item.source)}-${item.id}`;

    return base.slice(0, ATTACHMENT_DISPLAY_NAME_MAX_LENGTH);
}

async function resolveContentCandidates(
    item: SmartCollectionItem
): Promise<string[]> {
    const candidates: string[] = [];
    const addUrl = (url: string | null | undefined) => {
        if (isHttpUrl(url)) {
            candidates.push(url);
        }
    };

    switch (item.source) {
        case LibraryItemSource.google_photos:
        case LibraryItemSource.github_starred_repositories:
        case LibraryItemSource.pinterest:
        case LibraryItemSource.chrome_bookmarks:
        case LibraryItemSource.extension_clip:
            addUrl(item.url);
            break;
        default:
            if (isHttpUrl(item.url)) {
                const cobaltResult = await resolveCobaltDownloadUrl(item.url);
                if (cobaltResult.status === "SUCCESS") {
                    candidates.push(cobaltResult.downloadUrl);
                }
            }
            if (item.source === LibraryItemSource.other) {
                addUrl(item.url);
            }
    }

    return unique(candidates);
}

/**
 * Builds attachment content for an item: YouTube URLs pass through as video
 * file references, text-like assets are extracted inline, and other media is
 * uploaded to the Files API. Returns null when nothing usable is available.
 */
export async function createAttachmentForItem(
    item: SmartCollectionItem
): Promise<SmartCollectionAttachment | null> {
    if (
        item.source === LibraryItemSource.youtube_watch_later &&
        isHttpUrl(item.url)
    ) {
        return {
            content: [
                {
                    data: new URL(item.url),
                    mediaType: "video/mp4",
                    type: "file",
                },
            ],
        };
    }

    const candidates = await resolveContentCandidates(item);
    for (const candidateUrl of candidates) {
        const asset = await downloadRemoteAsset(candidateUrl);
        if (!asset) {
            continue;
        }

        if (isTextLikeMimeType(asset.mimeType)) {
            try {
                const rawText = await readTextFilePrefix(asset.path);
                const extractedText = extractTextContent(
                    rawText,
                    asset.mimeType
                );
                await asset.cleanup();

                if (extractedText.length === 0) {
                    continue;
                }

                const boundedText = extractedText.slice(
                    0,
                    ATTACHMENT_TEXT_LENGTH_MAX
                );
                return {
                    content: [
                        {
                            text: `Attached textual content (truncated if necessary):\n${boundedText}`,
                            type: "text",
                        } satisfies TextPart,
                    ],
                    protectionText: boundedText,
                };
            } catch {
                await asset.cleanup();
                continue;
            }
        }

        try {
            if (!serverEnv.GEMINI_API_KEY) {
                // The Files API needs direct Gemini credentials; gateway
                // routing cannot upload. Skip binary assets deliberately.
                log.warn(
                    "Skipping smart collections asset upload: GEMINI_API_KEY is not configured",
                    {
                        itemId: item.id,
                        source: item.source,
                        url: candidateUrl,
                    }
                );
                await asset.cleanup();
                continue;
            }

            const upload = await uploadRemoteAsset(
                asset,
                displayNameForItem(item, candidateUrl)
            );

            return {
                cleanup: upload.cleanup,
                content: [upload.filePart],
            };
        } catch (error) {
            await asset.cleanup();
            log.warn("Smart collections asset upload failed", {
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown upload error",
                itemId: item.id,
                source: item.source,
                url: candidateUrl,
            });
        }
    }

    return null;
}
