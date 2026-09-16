import "server-only";

import type { Nodes, Root } from "mdast";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import {
    LIBRARY_ITEM_COLLECTIONS_INCLUDE,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import {
    FALLBACK_URL,
    ITEM_KIND_NOTE,
    PRISMA_UNIQUE_CONSTRAINT_ERROR,
} from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { normalizeCollectionName } from "@/lib/common/string";
import { IntegrationUserError } from "@/lib/integrations/error";
import {
    type NormalizedNotePayload,
    normalizeNotePayload,
} from "@/lib/integrations/notes/service";
import { prisma } from "@/prisma";
import { Prisma } from "@/prisma/client/client";
import { LibraryItemSource } from "@/prisma/client/enums";
import {
    DbNull,
    type InputJsonValue,
} from "@/prisma/client/internal/prismaNamespace";

const PATH_TRAVERSAL = /(?:^|\/|\\|%2f)\.\.(?:\/|\\|%2f|$)/i;
const LEADING_SLASH = /^[/\\]+/;
const WINDOWS_DRIVE = /^[A-Za-z]:[/\\]/;
const MD_EXT = /\.md$/i;
const LINK_SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const FILE_IMPORT_FAILURE_MESSAGE = "We couldn't import this file.";
const MAX_FILE_SIZE_BYTES = 500_000;
const MAX_RELATIVE_PATH_LENGTH = 512;
const FILE_SIZE_SKIP_MESSAGE = `Exceeds the ${(MAX_FILE_SIZE_BYTES / 1000).toFixed(0)} KB file size limit.`;
const PATH_LENGTH_SKIP_MESSAGE = `File paths can be up to ${MAX_RELATIVE_PATH_LENGTH} characters.`;

const log = createLogger("integrations:markdown:service");

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
    updatedCount: number;
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
    importId: string;
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
        .replace(/\\/g, "/")
        .replace(/\/+/g, "/")
        .replace(MD_EXT, "")}.md`;

    return { normalized, ok: true };
}

export function splitFolderPath(relativePath: string): {
    folderPath: string;
    fileName: string;
} {
    const normalized = relativePath.replace(/\\/g, "/");
    const lastSlash = normalized.lastIndexOf("/");
    if (lastSlash === -1) {
        return { fileName: normalized, folderPath: "" };
    }
    const folderPath = normalized.slice(0, lastSlash);
    return { fileName: normalized.slice(lastSlash + 1), folderPath };
}

export function folderPathToCollectionName(folderPath: string): string {
    const segments = folderPath.replace(/\\/g, "/").split("/").filter(Boolean);
    return segments.join(" / ");
}

async function ensureCollection(userId: string, name: string): Promise<string> {
    const normalized = normalizeCollectionName(name);
    const existing = await prisma.collection.findFirst({
        select: { id: true },
        where: {
            nameKey: normalized.nameKey,
            userId,
        },
    });
    if (existing) {
        return existing.id;
    }
    try {
        const created = await prisma.collection.create({
            data: {
                name: normalized.name,
                nameKey: normalized.nameKey,
                userId,
            },
            select: { id: true },
        });
        return created.id;
    } catch (error) {
        if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR
        ) {
            const raced = await prisma.collection.findFirst({
                select: { id: true },
                where: {
                    nameKey: normalized.nameKey,
                    userId,
                },
            });
            if (raced) {
                return raced.id;
            }
        }
        throw error;
    }
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

export async function upsertImportedNote(args: {
    importId: string;
    userId: string;
    relativePath: string;
    notePayload: NormalizedNotePayload;
    provenance: ImportedNoteProvenance;
}): Promise<{
    isNew: boolean;
    item: LibraryItemWithCollections;
    priorFolderPath: string | null;
}> {
    const { importId, userId, relativePath, notePayload, provenance } = args;

    const data = {
        caption: null,
        noteContentHtml: notePayload.contentHtml,
        noteContentState: DbNull,
        noteContentText: notePayload.contentText,
        sourceMetadata: provenance as unknown as InputJsonValue,
    };
    const identity = {
        browserProfileId: importId,
        externalId: relativePath,
        source: LibraryItemSource.markdown_import,
        userId,
    };

    let id: string;
    let isNew: boolean;
    let priorFolderPath: string | null = null;
    try {
        const created = await prisma.libraryItem.create({
            data: {
                ...data,
                browserProfileId: importId,
                externalId: relativePath,
                kind: ITEM_KIND_NOTE,
                source: LibraryItemSource.markdown_import,
                url: FALLBACK_URL,
                userId,
            },
            select: { id: true },
        });
        id = created.id;
        isNew = true;
    } catch (error) {
        if (
            !(
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR
            )
        ) {
            throw error;
        }
        const existing = await prisma.libraryItem.findUnique({
            select: { sourceMetadata: true },
            where: { userId_source_browserProfileId_externalId: identity },
        });
        if (existing?.sourceMetadata) {
            const metadata =
                existing.sourceMetadata as unknown as ImportedNoteProvenance;
            if (typeof metadata.folderPath === "string") {
                priorFolderPath = metadata.folderPath;
            }
        }
        const updated = await prisma.libraryItem.update({
            data: { ...data, deletedAt: null },
            select: { id: true },
            where: { userId_source_browserProfileId_externalId: identity },
        });
        id = updated.id;
        isNew = false;
    }

    const item = await prisma.libraryItem.findFirst({
        include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
        where: {
            deletedAt: null,
            id,
            kind: ITEM_KIND_NOTE,
            userId,
        },
    });
    if (!item) {
        throw new IntegrationUserError({
            message: "We saved the note but couldn't load it back.",
            operation: "upsertImportedNote",
            resource: "note",
        });
    }

    return { isNew, item, priorFolderPath };
}

export async function assignNoteToFolderCollection(args: {
    itemId: string;
    folderPath: string;
    priorFolderPath: string | null;
    userId: string;
}): Promise<void> {
    const { itemId, folderPath, priorFolderPath, userId } = args;
    if (!folderPath) {
        return;
    }

    const item = await prisma.libraryItem.findFirst({
        select: { collections: { select: { id: true } } },
        where: { id: itemId, userId },
    });
    if (!item) {
        throw new IntegrationUserError({
            message:
                "We saved the note but couldn't assign it to a collection.",
            operation: "assignNoteToFolderCollection",
            resource: "note",
        });
    }

    const collectionName = folderPathToCollectionName(folderPath);
    const collectionId = await ensureCollection(userId, collectionName);

    const priorCollectionName = priorFolderPath
        ? folderPathToCollectionName(priorFolderPath)
        : null;
    let priorCollectionId: string | null = null;
    if (priorCollectionName && priorCollectionName !== collectionName) {
        priorCollectionId = await ensureCollection(userId, priorCollectionName);
    }

    const currentCollectionIds = new Set(
        item.collections.map((collection) => collection.id)
    );
    const changedCollectionIds: string[] = [];
    if (!currentCollectionIds.has(collectionId)) {
        changedCollectionIds.push(collectionId);
    }
    if (
        priorCollectionId &&
        currentCollectionIds.has(priorCollectionId) &&
        !changedCollectionIds.includes(priorCollectionId)
    ) {
        changedCollectionIds.push(priorCollectionId);
    }
    if (changedCollectionIds.length === 0) {
        return;
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
        await tx.libraryItem.update({
            data: {
                collections: {
                    ...(priorCollectionId
                        ? { disconnect: { id: priorCollectionId } }
                        : {}),
                    connect: { id: collectionId },
                },
            },
            select: { id: true },
            where: { id: itemId, userId },
        });
        if (changedCollectionIds.length > 0) {
            await tx.collection.updateMany({
                data: { updatedAt: now },
                where: { id: { in: changedCollectionIds }, userId },
            });
        }
    });
}

export async function importMarkdownFiles(args: {
    importId: string;
    userId: string;
    files: MarkdownBatchEntry[];
}): Promise<MarkdownImportResult & { smartCollectionItemIds: string[] }> {
    const { importId, userId, files } = args;

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
        updatedCount: 0,
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
                new TextEncoder().encode(file.markdown).length >
                MAX_FILE_SIZE_BYTES
            ) {
                result.skippedCount += 1;
                result.skipped.push({
                    message: FILE_SIZE_SKIP_MESSAGE,
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
                importId,
                originalPath: file.relativePath,
            };

            const { isNew, item, priorFolderPath } = await upsertImportedNote({
                importId,
                notePayload,
                provenance,
                relativePath: pathResult.normalized,
                userId,
            });

            await assignNoteToFolderCollection({
                folderPath,
                itemId: item.id,
                priorFolderPath,
                userId,
            });

            result.items.push(item);

            if (isNew) {
                result.createdCount += 1;
                newItemIds.push(item.id);
            } else {
                result.updatedCount += 1;
            }
        } catch (error) {
            log.error("Failed to import markdown file", {
                error,
                relativePath: file.relativePath,
            });
            result.failedCount += 1;
            result.errors.push({
                message: FILE_IMPORT_FAILURE_MESSAGE,
                relativePath: file.relativePath,
            });
        }
    }

    return { ...result, smartCollectionItemIds: newItemIds };
}

export function createMarkdownImportRecord(args: {
    userId: string;
    name: string;
}): Promise<{ id: string }> {
    return prisma.markdownImport.create({
        data: {
            name: args.name.trim(),
            userId: args.userId,
        },
        select: { id: true },
    });
}

export function listMarkdownImportRecords(
    userId: string
): Promise<Array<{ id: string; name: string; createdAt: Date }>> {
    return prisma.markdownImport.findMany({
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, id: true, name: true },
        where: { userId },
    });
}

export function getMarkdownImport(
    importId: string,
    userId: string
): Promise<{ id: string; name: string } | null> {
    return prisma.markdownImport.findFirst({
        select: { id: true, name: true },
        where: { id: importId, userId },
    });
}
