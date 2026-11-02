import "server-only";

import { randomUUID } from "node:crypto";
import type { Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
    LIBRARY_ITEM_COLLECTIONS_INCLUDE,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { FALLBACK_URL, ITEM_KIND_NOTE } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { normalizeCollectionName } from "@/lib/common/string";
import {
    MARKDOWN_FILE_SIZE_SKIP_MESSAGE,
    MAX_MARKDOWN_FILE_SIZE_BYTES,
} from "@/lib/integrations/markdown/quotas";
import {
    type NormalizedNotePayload,
    normalizeNotePayload,
} from "@/lib/notes/service";
import { prisma } from "@/prisma";
import type { Prisma } from "@/prisma/client/client";
import { LibraryItemSource } from "@/prisma/client/enums";
import { DbNull } from "@/prisma/client/internal/prismaNamespace";

const PATH_TRAVERSAL = /(?:^|\/|\\|%2f)\.\.(?:\/|\\|%2f|$)/iu;
const LEADING_SLASH = /^[/\\]+/u;
const WINDOWS_DRIVE = /^[A-Za-z]:[/\\]/u;
const MD_EXT = /\.md$/iu;
const LINK_SCHEME = /^([a-z][a-z0-9+.-]*):/iu;
const MAX_RELATIVE_PATH_LENGTH = 512;
const PATH_LENGTH_SKIP_MESSAGE = `File paths can be up to ${MAX_RELATIVE_PATH_LENGTH} characters.`;

const log = createLogger("integrations:markdown:service");

const TEXT_ENCODER = new TextEncoder();

const MARKDOWN_PROCESSOR = unified().use(remarkParse).use(remarkGfm).freeze();

export interface MarkdownBatchEntry {
    markdown: string;
    relativePath: string;
}

export interface MarkdownImportResult {
    createdCount: number;
    errors: Array<{ relativePath: string; message: string }>;
    failedCount: number;
    items: LibraryItemWithCollections[];
    skipped: Array<{ relativePath: string; message: string }>;
    skippedCount: number;
    unsupportedReport: UnsupportedConstructReport;
}

export interface UnsupportedConstructReport {
    htmlCount: number;
    imageCount: number;
    tableCount: number;
    taskListCount: number;
}

export interface ImportedNoteProvenance {
    folderPath: string;
    importedAt: string;
    originalPath: string;
}

export function normalizeMarkdownPath(
    path: string
): { ok: true; normalized: string } | { ok: false; message: string } {
    const trimmed = path.trim();
    if (trimmed.length === 0) {
        return { message: "Path is empty.", ok: false };
    }

    if (trimmed.length > MAX_RELATIVE_PATH_LENGTH) {
        return { message: PATH_LENGTH_SKIP_MESSAGE, ok: false };
    }

    if (PATH_TRAVERSAL.test(trimmed)) {
        return { message: "Path traversal is not allowed.", ok: false };
    }

    if (LEADING_SLASH.test(trimmed) || WINDOWS_DRIVE.test(trimmed)) {
        return { message: "Path must be relative.", ok: false };
    }

    const normalized = `${trimmed
        .replace(/\\/gu, "/")
        .replace(/\/+/gu, "/")
        .replace(MD_EXT, "")}.md`;

    return { normalized, ok: true };
}

export function splitFolderPath(relativePath: string): {
    folderPath: string;
    fileName: string;
} {
    const normalized = relativePath.replace(/\\/gu, "/");
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash === -1) {
        return { fileName: normalized, folderPath: "" };
    }
    const folderPath = normalized.slice(0, lastSlash);
    return { fileName: normalized.slice(lastSlash + 1), folderPath };
}

export function folderPathToCollectionName(folderPath: string): string {
    const segments = folderPath.replace(/\\/gu, "/").split("/").filter(Boolean);
    return segments.join(" / ");
}

async function ensureCollection(
    tx: Prisma.TransactionClient,
    userId: string,
    name: string
): Promise<string> {
    const normalized = normalizeCollectionName(name);
    const collection = await tx.collection.upsert({
        create: {
            name: normalized.name,
            nameKey: normalized.nameKey,
            userId,
        },
        select: { id: true },
        update: {},
        where: {
            userId_nameKey: {
                nameKey: normalized.nameKey,
                userId,
            },
        },
    });
    return collection.id;
}

export function markdownToNoteHtml(markdown: string): {
    html: string;
    unsupported: UnsupportedConstructReport;
} {
    const unsupported: UnsupportedConstructReport = {
        htmlCount: 0,
        imageCount: 0,
        tableCount: 0,
        taskListCount: 0,
    };

    const ast = MARKDOWN_PROCESSOR.parse(markdown) as Root;

    const html = renderMdastToHtml(ast, unsupported);

    return { html, unsupported };
}

function escapeHtmlText(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeMarkdownLinkHref(href: string): string {
    let normalized = "";
    for (const char of href) {
        const code = char.charCodeAt(0);
        if (code > 0x20 && code !== 0x7f) {
            normalized += char;
        }
    }
    return normalized;
}

function isSafeMarkdownLinkHref(href: string): boolean {
    if (href.startsWith("#")) {
        return true;
    }
    const scheme = href.match(LINK_SCHEME)?.[1]?.toLowerCase();
    return scheme === "http" || scheme === "https" || scheme === "mailto";
}

function renderMdastToHtml(
    node: Nodes,
    unsupported: UnsupportedConstructReport
): string {
    if (node.type === "root") {
        return node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
    }

    if (node.type === "paragraph") {
        const inner = node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
        return inner ? `<p>${inner}</p>` : "";
    }

    if (node.type === "heading") {
        const tag = `h${Math.min(Math.max(node.depth, 1), 6)}`;
        const inner = node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
        return `<${tag}>${inner}</${tag}>`;
    }

    if (node.type === "text") {
        return escapeHtmlText(node.value);
    }

    if (node.type === "break") {
        return "<br>";
    }

    if (node.type === "strong") {
        const inner = node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
        return `<strong>${inner}</strong>`;
    }

    if (node.type === "emphasis") {
        const inner = node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
        return `<em>${inner}</em>`;
    }

    if (node.type === "delete") {
        const inner = node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
        return `<s>${inner}</s>`;
    }

    if (node.type === "link") {
        const inner = node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
        const href = normalizeMarkdownLinkHref(node.url ?? "");
        if (!isSafeMarkdownLinkHref(href)) {
            return inner;
        }
        // normalizeNotePayload re-validates hrefs against the sanitizer's
        // own protocol allowlist (notes/utils.ts) before persisting.
        return `<a href="${escapeHtmlText(href)}">${inner}</a>`;
    }

    if (node.type === "linkReference") {
        // Reference-style links ([text][label]) have no resolvable URL here;
        // preserve the visible label text.
        return node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
    }

    if (node.type === "list") {
        const tag = node.ordered ? "ol" : "ul";
        const inner = node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
        return `<${tag}>${inner}</${tag}>`;
    }

    if (node.type === "listItem") {
        const inner = node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
        if (node.checked === true) {
            unsupported.taskListCount += 1;
            return `<li>☒ ${inner}</li>`;
        }
        if (node.checked === false) {
            unsupported.taskListCount += 1;
            return `<li>☐ ${inner}</li>`;
        }
        return `<li>${inner}</li>`;
    }

    if (node.type === "blockquote") {
        const inner = node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
        return `<blockquote>${inner}</blockquote>`;
    }

    if (node.type === "code") {
        const lang = node.lang ? escapeHtmlText(node.lang) : "";
        const langAttr = lang ? ` class="language-${lang}"` : "";
        return `<pre${langAttr}><code${langAttr}>${escapeHtmlText(node.value)}</code></pre>`;
    }

    if (node.type === "inlineCode") {
        return `<code>${escapeHtmlText(node.value)}</code>`;
    }

    if (node.type === "thematicBreak") {
        return "";
    }

    if (node.type === "image" || node.type === "imageReference") {
        unsupported.imageCount += 1;
        const alt = node.alt ? escapeHtmlText(node.alt) : "";
        return alt;
    }

    if (node.type === "table") {
        unsupported.tableCount += 1;
        return node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join(" ");
    }

    if (node.type === "tableRow") {
        return node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join(" ");
    }

    if (node.type === "tableCell") {
        return node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join(" ");
    }

    if (node.type === "footnoteDefinition") {
        return node.children
            .map((child) => renderMdastToHtml(child, unsupported))
            .join("");
    }

    if (node.type === "footnoteReference") {
        // Footnotes have no children of their own; keep the marker so the
        // note text stays coherent with the rendered definition.
        return `[${escapeHtmlText(node.label ?? node.identifier)}]`;
    }

    if (node.type === "html") {
        unsupported.htmlCount += 1;
        return "";
    }

    return "";
}

export function createImportedNote(args: {
    userId: string;
    notePayload: NormalizedNotePayload;
    provenance: ImportedNoteProvenance;
}): Promise<LibraryItemWithCollections> {
    const { userId, notePayload, provenance } = args;

    return prisma.$transaction(async (tx) => {
        const collectionId = provenance.folderPath
            ? await ensureCollection(
                  tx,
                  userId,
                  folderPathToCollectionName(provenance.folderPath)
              )
            : null;
        const item = await tx.libraryItem.create({
            data: {
                caption: null,
                collections: collectionId
                    ? { connect: { id: collectionId } }
                    : undefined,
                externalId: `markdown_${randomUUID()}`,
                kind: ITEM_KIND_NOTE,
                noteContentHtml: notePayload.contentHtml,
                noteContentState: DbNull,
                noteContentText: notePayload.contentText,
                source: LibraryItemSource.markdown_import,
                sourceMetadata: {
                    folderPath: provenance.folderPath,
                    importedAt: provenance.importedAt,
                    originalPath: provenance.originalPath,
                },
                url: FALLBACK_URL,
                userId,
            },
            include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
        });

        if (collectionId) {
            await tx.collection.updateMany({
                data: { updatedAt: new Date() },
                where: { id: collectionId, userId },
            });
        }

        return item;
    });
}

export async function importMarkdownFiles(args: {
    userId: string;
    files: MarkdownBatchEntry[];
}): Promise<MarkdownImportResult & { smartCollectionItemIds: string[] }> {
    const { userId, files } = args;

    const result: MarkdownImportResult = {
        createdCount: 0,
        errors: [],
        failedCount: 0,
        items: [],
        skipped: [],
        skippedCount: 0,
        unsupportedReport: {
            htmlCount: 0,
            imageCount: 0,
            tableCount: 0,
            taskListCount: 0,
        },
    };
    const newItemIds: string[] = [];

    for (const file of files) {
        try {
            const pathResult = normalizeMarkdownPath(file.relativePath);
            if (!pathResult.ok) {
                result.skippedCount += 1;
                result.skipped.push({
                    message: pathResult.message,
                    relativePath: file.relativePath,
                });
                continue;
            }

            if (
                TEXT_ENCODER.encode(file.markdown).length >
                MAX_MARKDOWN_FILE_SIZE_BYTES
            ) {
                result.skippedCount += 1;
                result.skipped.push({
                    message: MARKDOWN_FILE_SIZE_SKIP_MESSAGE,
                    relativePath: file.relativePath,
                });
                continue;
            }

            const { folderPath } = splitFolderPath(pathResult.normalized);

            const { html, unsupported } = markdownToNoteHtml(file.markdown);
            result.unsupportedReport.imageCount += unsupported.imageCount;
            result.unsupportedReport.tableCount += unsupported.tableCount;
            result.unsupportedReport.htmlCount += unsupported.htmlCount;
            result.unsupportedReport.taskListCount += unsupported.taskListCount;

            const notePayload = normalizeNotePayload({ contentHtml: html });

            const provenance: ImportedNoteProvenance = {
                folderPath,
                importedAt: new Date().toISOString(),
                originalPath: file.relativePath,
            };

            const item = await createImportedNote({
                notePayload,
                provenance,
                userId,
            });
            result.items.push(item);
            result.createdCount += 1;
            newItemIds.push(item.id);
        } catch (error) {
            log.error("Failed to import markdown file", {
                error,
                relativePath: file.relativePath,
            });
            result.failedCount += 1;
            result.errors.push({
                message: "We couldn't import this file.",
                relativePath: file.relativePath,
            });
        }
    }

    return { ...result, smartCollectionItemIds: newItemIds };
}
