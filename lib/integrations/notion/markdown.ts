import {
    getNoteExcerpt,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { FALLBACK_URL, ITEM_KIND_NOTE } from "@/lib/common/constants";
import { normalizeWhitespace, truncateText } from "@/lib/common/string";
import { normalizeURL } from "@/lib/common/url";

export const NOTION_COLLECTION_ITEM_LIMIT = 100;

const NOTION_TITLE_MAX_LENGTH = 120;
const NOTION_ITEM_LABEL_MAX_LENGTH = 160;
const NOTION_NOTE_EXCERPT_MAX_LENGTH = 500;

export interface NotionCollectionMarkdownInput {
    description: string | null;
    items: LibraryItemWithCollections[];
    name: string;
}

export interface NotionMarkdownDocument {
    markdown: string;
    title: string;
}

export function buildNotionNoteMarkdown(input: {
    contentMarkdown: string;
    title: string;
}): NotionMarkdownDocument {
    const title = normalizeTitle(input.title, "Cache note");
    const contentMarkdown = input.contentMarkdown.trim();

    return {
        markdown: contentMarkdown.length > 0 ? contentMarkdown : title,
        title,
    };
}

export function buildNotionCollectionMarkdown(
    input: NotionCollectionMarkdownInput
): NotionMarkdownDocument | null {
    const title = normalizeTitle(input.name, "Cache collection");
    const lines = [`# ${escapeMarkdownText(title)}`];
    const description = normalizeWhitespace(input.description ?? "");

    if (description) {
        lines.push("", description);
    }

    const itemLines = input.items
        .filter((item) => item.kind !== "folder")
        .slice(0, NOTION_COLLECTION_ITEM_LIMIT)
        .flatMap(formatCollectionItem);

    if (itemLines.length === 0) {
        return null;
    }

    lines.push("", ...itemLines);

    return {
        markdown: lines.join("\n"),
        title,
    };
}

function formatCollectionItem(item: LibraryItemWithCollections): string[] {
    if (item.kind === ITEM_KIND_NOTE) {
        const excerpt = getNoteExcerpt(
            item.noteContentText,
            NOTION_NOTE_EXCERPT_MAX_LENGTH
        );
        return excerpt ? [`- ${escapeMarkdownText(excerpt)}`] : [];
    }

    const url = normalizeURL(item.url);
    if (!(url && url !== FALLBACK_URL)) {
        return [];
    }

    const label = truncateText(
        normalizeWhitespace(item.caption ?? "") || url,
        NOTION_ITEM_LABEL_MAX_LENGTH
    );

    return [`- [${escapeMarkdownLinkLabel(label)}](${url})`];
}

function normalizeTitle(value: string, fallback: string): string {
    return truncateText(
        normalizeWhitespace(value) || fallback,
        NOTION_TITLE_MAX_LENGTH
    );
}

function escapeMarkdownText(value: string): string {
    return value
        .replaceAll("\\", "\\\\")
        .replaceAll("`", "\\`")
        .replaceAll("*", "\\*")
        .replaceAll("_", "\\_")
        .replaceAll("\n", " ");
}

function escapeMarkdownLinkLabel(value: string): string {
    return escapeMarkdownText(value)
        .replaceAll("[", "\\[")
        .replaceAll("]", "\\]");
}
