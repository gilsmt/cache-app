import { isRecord } from "@/lib/common/object";
import { truncateText } from "@/lib/common/string";

const JSON_MARKDOWN_FIELD_NAMES = [
    "markdown",
    "summary",
    "answer",
    "response",
    "message",
    "content",
    "text",
] as const;

const COMPLETE_CODE_FENCE_PATTERN =
    /^```(?<language>[a-zA-Z0-9_-]+)?[^\S\r\n]*\r?\n(?<content>[\s\S]*?)\r?\n```$/u;
const ESCAPED_NEWLINE_PATTERN = /\\r\\n|\\n/gu;
const INLINE_LIST_MARKER_PATTERN = /([.!?:]) (?=(?:[-*+]|\d+\.) \*\*)/gu;

/**
 * Normalizes generated markdown that may arrive wrapped in a model-authored
 * JSON envelope. We keep this permissive because providers occasionally ignore
 * response schemas and return the schema object itself as assistant text.
 */
export function normalizeGeneratedMarkdown(value: string | undefined): string {
    if (!value) {
        return "";
    }

    return normalizeGeneratedMarkdownValue(value, 0).trim();
}

function normalizeGeneratedMarkdownValue(
    value: unknown,
    depth: number
): string {
    if (depth > 4) {
        return typeof value === "string" ? value : "";
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
            return "";
        }

        const unfenced = removeCompleteCodeFence(trimmed);
        const parsed = parseJson(unfenced);
        if (parsed.ok) {
            const normalized = normalizeGeneratedMarkdownValue(
                parsed.value,
                depth + 1
            );
            if (normalized.length > 0) {
                return normalized;
            }
        }

        return normalizeGeneratedMarkdownText(unfenced);
    }

    if (Array.isArray(value)) {
        const parts: string[] = [];
        for (const item of value) {
            const normalized = normalizeGeneratedMarkdownValue(item, depth + 1);
            if (normalized.length > 0) {
                parts.push(normalized);
            }
        }
        return parts.join("\n");
    }

    if (!isRecord(value)) {
        return "";
    }

    for (const fieldName of JSON_MARKDOWN_FIELD_NAMES) {
        const fieldValue = value[fieldName];
        const normalized = normalizeGeneratedMarkdownValue(
            fieldValue,
            depth + 1
        );
        if (normalized.length > 0) {
            return normalized;
        }
    }

    const fieldNames = Object.keys(value);
    if (fieldNames.length === 1) {
        const [fieldName] = fieldNames;
        if (fieldName) {
            return normalizeGeneratedMarkdownValue(value[fieldName], depth + 1);
        }
    }

    return "";
}

function removeCompleteCodeFence(value: string): string {
    const match = value.match(COMPLETE_CODE_FENCE_PATTERN);
    return match?.groups?.content?.trim() ?? value;
}

function normalizeGeneratedMarkdownText(value: string): string {
    return value
        .replace(ESCAPED_NEWLINE_PATTERN, "\n")
        .replace(INLINE_LIST_MARKER_PATTERN, "$1\n");
}

function parseJson(
    value: string
): { ok: true; value: unknown } | { ok: false } {
    try {
        return { ok: true, value: JSON.parse(value) };
    } catch {
        return { ok: false };
    }
}

const SECTION_DESCRIPTION_RESPONSE_MAX_LENGTH = 220;
const SECTION_DESCRIPTION_EXPANDED_RESPONSE_MAX_LENGTH = 1600;

const WHITESPACE_PATTERN = /\s+/gu;
const SUMMARY_PREFIX_PATTERN = /^summary:\s*/iu;
const SURROUNDING_QUOTES_PATTERN = /^["']|["']$/gu;
const FIRST_SENTENCE_PATTERN = /^.+?[.!?](?=\s|$)/u;
const GRAMMATICALLY_COMPLETE_PATTERN = /[.!?]$/u;
const MARKDOWN_CODE_FENCE_PATTERN = /^```(?:markdown|md)?\s*|\s*```$/giu;

function firstSentence(value: string): string {
    const match = value.match(FIRST_SENTENCE_PATTERN);
    return match?.[0]?.trim() ?? value.trim();
}

function isGrammaticallyComplete(value: string): boolean {
    return GRAMMATICALLY_COMPLETE_PATTERN.test(value);
}

export function normalizeSummary(value: string | undefined): string | null {
    const normalized = normalizeGeneratedMarkdown(value)
        .replace(WHITESPACE_PATTERN, " ")
        .replace(SUMMARY_PREFIX_PATTERN, "")
        .trim();
    const singleSentence = firstSentence(normalized);
    const cleaned = singleSentence
        .replace(SURROUNDING_QUOTES_PATTERN, "")
        .trim();

    if (cleaned.length === 0) {
        return null;
    }

    if (cleaned.length <= SECTION_DESCRIPTION_RESPONSE_MAX_LENGTH) {
        return isGrammaticallyComplete(cleaned) ? cleaned : `${cleaned}.`;
    }

    return truncateText(
        cleaned,
        SECTION_DESCRIPTION_RESPONSE_MAX_LENGTH,
        "..."
    );
}

export function normalizeExpandedSummary(
    value: string | undefined
): string | null {
    const normalized = normalizeGeneratedMarkdown(value);
    if (!normalized) {
        return null;
    }

    const lines = normalized
        .replace(MARKDOWN_CODE_FENCE_PATTERN, "")
        .split("\n");
    const keptLines: string[] = [];
    for (const line of lines) {
        const trimmedLine = line.trimEnd();
        if (trimmedLine.length > 0) {
            keptLines.push(trimmedLine);
        }
    }
    const cleaned = keptLines.join("\n").trim();

    if (cleaned.length === 0) {
        return null;
    }

    if (cleaned.length <= SECTION_DESCRIPTION_EXPANDED_RESPONSE_MAX_LENGTH) {
        return cleaned;
    }

    return truncateText(
        cleaned,
        SECTION_DESCRIPTION_EXPANDED_RESPONSE_MAX_LENGTH,
        "..."
    );
}
