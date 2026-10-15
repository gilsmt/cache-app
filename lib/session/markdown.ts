import { isRecord } from "@/lib/common/object";

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
    /^```(?<language>[a-zA-Z0-9_-]+)?[^\S\r\n]*\r?\n(?<content>[\s\S]*?)\r?\n```$/;
const ESCAPED_NEWLINE_PATTERN = /\\r\\n|\\n/g;
const INLINE_LIST_MARKER_PATTERN = /([.!?:]) (?=(?:[-*+]|\d+\.) \*\*)/g;

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
