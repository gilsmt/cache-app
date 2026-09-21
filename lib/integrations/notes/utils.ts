import type { SerializedHeadingNode } from "@lexical/rich-text";
import {
    IS_BOLD,
    IS_HIGHLIGHT,
    IS_ITALIC,
    IS_STRIKETHROUGH,
    IS_UNDERLINE,
    type SerializedEditorState,
    type SerializedElementNode,
    type SerializedLexicalNode,
    type SerializedTextNode,
} from "lexical";
import { isRecord } from "@/lib/common/object";
import { decodeHtmlEntities } from "@/lib/common/string";

export const NOTE_EMPTY_HTML = "<p></p>";

export type NoteSerializedEditorState = SerializedEditorState;

type NoteSerializedElementNode = SerializedElementNode;
type NoteSerializedRootNode = NoteSerializedEditorState["root"];

const NOTE_ALLOWED_TAGS = new Set([
    "a",
    "blockquote",
    "br",
    "code",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "i",
    "li",
    "mark",
    "ol",
    "p",
    "pre",
    "s",
    "strike",
    "strong",
    "u",
    "ul",
]);
const NOTE_TAG_ALIASES: Record<string, string> = {
    b: "strong",
    div: "p",
    i: "em",
    strike: "s",
};
const NOTE_BLOCK_END_TAGS = /<\/(blockquote|div|h[1-6]|li|ol|p|pre|ul)>/gi;
const NOTE_BREAK_TAGS = /<br\s*\/?>/gi;
const NOTE_TAGS = /<(\/?)([a-z0-9]+)((?:\s[^>]*)?)>/gi;
const NOTE_STRIP_TAGS = /<[^>]+>/g;
const NOTE_SCRIPT_STYLE_BLOCKS =
    /<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const NOTE_COMMENTS = /<!--[\s\S]*?-->/g;
const NOTE_HEADING_TAG = /^h[1-6]$/;
const NOTE_SAFE_URL_PROTOCOLS = /^(https?:\/\/|mailto:|#)/i;

const NOTE_ALLOWED_ATTRS: Record<string, Set<string>> = {
    a: new Set(["href"]),
    code: new Set(["class"]),
    pre: new Set(["class"]),
};

export function escapeNoteHtmlText(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function isNoteSerializedElementNode(
    value: unknown
): value is NoteSerializedElementNode {
    return (
        isRecord(value) &&
        typeof value.type === "string" &&
        Array.isArray(value.children)
    );
}

function isNoteSerializedRootNode(
    value: unknown
): value is NoteSerializedRootNode {
    return isNoteSerializedElementNode(value) && value.type === "root";
}

function isNoteSerializedTextNode(value: unknown): value is SerializedTextNode {
    return (
        isRecord(value) &&
        value.type === "text" &&
        typeof value.format === "number" &&
        typeof value.text === "string"
    );
}

function isNoteSerializedHeadingNode(
    value: unknown
): value is SerializedHeadingNode {
    return (
        isRecord(value) &&
        value.type === "heading" &&
        Array.isArray(value.children) &&
        typeof value.tag === "string"
    );
}

function isSupportedHeadingTag(
    tag: string
): tag is SerializedHeadingNode["tag"] {
    return NOTE_HEADING_TAG.test(tag);
}

function wrapNoteInlineFormat(
    html: string,
    enabled: boolean,
    tag: "em" | "mark" | "s" | "strong" | "u"
): string {
    return enabled ? `<${tag}>${html}</${tag}>` : html;
}

function renderNoteTextNode(node: SerializedTextNode): string {
    let html = escapeNoteHtmlText(node.text).replaceAll("\n", "<br>");

    if (html.length === 0) {
        return "";
    }

    html = wrapNoteInlineFormat(html, (node.format & IS_BOLD) !== 0, "strong");
    html = wrapNoteInlineFormat(html, (node.format & IS_ITALIC) !== 0, "em");
    html = wrapNoteInlineFormat(html, (node.format & IS_UNDERLINE) !== 0, "u");
    html = wrapNoteInlineFormat(
        html,
        (node.format & IS_STRIKETHROUGH) !== 0,
        "s"
    );
    html = wrapNoteInlineFormat(
        html,
        (node.format & IS_HIGHLIGHT) !== 0,
        "mark"
    );

    return html;
}

function renderNoteChildren(children: SerializedLexicalNode[]): string {
    return children.map((child) => renderNoteNode(child)).join("");
}

function renderNoteElement(
    tag: "p" | SerializedHeadingNode["tag"],
    node: NoteSerializedElementNode
): string {
    return `<${tag}>${renderNoteChildren(node.children)}</${tag}>`;
}

function renderNoteNode(node: SerializedLexicalNode): string {
    if (isNoteSerializedTextNode(node)) {
        return renderNoteTextNode(node);
    }

    if (isNoteSerializedHeadingNode(node)) {
        return renderNoteElement(
            isSupportedHeadingTag(node.tag) ? node.tag : "h2",
            node
        );
    }

    if (isNoteSerializedElementNode(node)) {
        if (node.type === "paragraph") {
            return renderNoteElement("p", node);
        }

        if (node.type === "root") {
            return renderNoteChildren(node.children);
        }

        if (node.type === "linebreak") {
            return "<br>";
        }

        return renderNoteChildren(node.children);
    }

    if (isRecord(node) && node.type === "linebreak") {
        return "<br>";
    }

    return "";
}

export function normalizeNoteHtml(html: string | null | undefined): string {
    return html?.trim() || NOTE_EMPTY_HTML;
}

export function isNoteSerializedEditorState(
    value: unknown
): value is NoteSerializedEditorState {
    return isRecord(value) && isNoteSerializedRootNode(value.root);
}

export function serializeNoteEditorStateToHtml(
    editorState: NoteSerializedEditorState
): string {
    const html = renderNoteNode(editorState.root);
    return sanitizeNoteHtml(html);
}

export function sanitizeNoteHtml(input: string): string {
    const trimmedInput = input.trim();
    if (trimmedInput.length === 0) {
        return NOTE_EMPTY_HTML;
    }

    const withoutUnsafeBlocks = trimmedInput
        .replaceAll(NOTE_SCRIPT_STYLE_BLOCKS, "")
        .replaceAll(NOTE_COMMENTS, "");

    const sanitized = withoutUnsafeBlocks.replaceAll(
        NOTE_TAGS,
        (_match, closingSlash: string, tagName: string, attrs: string) => {
            const normalizedTagName = tagName.toLowerCase();
            if (!NOTE_ALLOWED_TAGS.has(normalizedTagName)) {
                return "";
            }

            const resolvedTagName =
                NOTE_TAG_ALIASES[normalizedTagName] ?? normalizedTagName;

            if (resolvedTagName === "br") {
                return "<br>";
            }

            if (closingSlash) {
                return `</${resolvedTagName}>`;
            }

            const allowed = NOTE_ALLOWED_ATTRS[resolvedTagName];
            if (!allowed) {
                return `<${resolvedTagName}>`;
            }

            const safeAttrs: string[] = [];
            const attrRe = /(\S+)\s*=\s*"([^"]*?)"/g;
            let attrMatch: RegExpExecArray | null = attrRe.exec(attrs);
            while (attrMatch !== null) {
                const attrName = attrMatch[1];
                const attrValue = attrMatch[2];
                if (attrName !== undefined && attrValue !== undefined) {
                    const normalizedName = attrName.toLowerCase();
                    if (
                        allowed.has(normalizedName) &&
                        (normalizedName !== "href" ||
                            NOTE_SAFE_URL_PROTOCOLS.test(attrValue))
                    ) {
                        safeAttrs.push(
                            `${normalizedName}="${attrValue.replaceAll('"', "&quot;")}"`
                        );
                    }
                }
                attrMatch = attrRe.exec(attrs);
            }

            return safeAttrs.length > 0
                ? `<${resolvedTagName} ${safeAttrs.join(" ")}>`
                : `<${resolvedTagName}>`;
        }
    );

    const normalizedParagraphs = sanitized.replaceAll(/\r\n?/g, "\n").trim();

    return normalizedParagraphs.length > 0
        ? normalizedParagraphs
        : NOTE_EMPTY_HTML;
}

export function extractNoteText(input: string): string {
    const sanitizedHtml = sanitizeNoteHtml(input);

    return decodeHtmlEntities(
        sanitizedHtml
            .replaceAll(NOTE_BREAK_TAGS, "\n")
            .replaceAll(NOTE_BLOCK_END_TAGS, "\n")
            .replaceAll(NOTE_STRIP_TAGS, "")
            .replaceAll(/\n{3,}/g, "\n\n")
    )
        .replaceAll(/\u00a0/g, " ")
        .trim();
}

/**
 * Convert sanitized note HTML to Markdown.
 *
 * Handles the limited tag set produced by the note editor:
 * headings, paragraphs, bold, italic, underline, strikethrough,
 * highlight, and line breaks.
 *
 * Nesting is preserved because children are converted before their
 * parent wrapper is applied.
 */
export function convertNoteHtmlToMarkdown(html: string): string {
    const sanitized = sanitizeNoteHtml(html);
    if (sanitized === NOTE_EMPTY_HTML) {
        return "";
    }

    const doc = new DOMParser().parseFromString(sanitized, "text/html");
    return convertNoteDomNodeToMarkdown(doc.body).trim();
}

function convertNoteDomNodeToMarkdown(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent ?? "";
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
    }

    const element = node as Element;
    const tag = element.tagName.toLowerCase();
    const children = Array.from(element.childNodes)
        .map((child) => convertNoteDomNodeToMarkdown(child))
        .join("");

    if (tag === "h1") {
        return `# ${children}\n\n`;
    }
    if (tag === "h2") {
        return `## ${children}\n\n`;
    }
    if (tag === "h3") {
        return `### ${children}\n\n`;
    }
    if (tag === "p") {
        return children ? `${children}\n\n` : "";
    }
    if (tag === "strong") {
        return `**${children}**`;
    }
    if (tag === "em") {
        return `*${children}*`;
    }
    if (tag === "u") {
        return `<u>${children}</u>`;
    }
    if (tag === "s") {
        return `~~${children}~~`;
    }
    if (tag === "mark") {
        return `==${children}==`;
    }
    if (tag === "br") {
        return "\n";
    }
    return children;
}
