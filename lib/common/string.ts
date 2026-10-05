import * as z from "zod";

const TRAILING_NUMBER_RE = /(\d+)$/;

/**
 * Get an incremented name (e.g. "New page 1", "New page 2") from a base name
 * (e.g. "New page"), based on an array of existing names.
 *
 * @param name - The name to increment.
 * @param others - The array of existing names.
 * @public
 */
export function getIncrementedName(baseName: string, others: string[]) {
    let result = baseName;
    const set = new Set(others);

    while (set.has(result)) {
        result = TRAILING_NUMBER_RE.exec(result)
            ? result.replace(TRAILING_NUMBER_RE, (m) =>
                  (Number(m) + 1).toString()
              )
            : `${result} 1`;
    }

    return result;
}

const WHITESPACE_PATTERN = /\s+/g;

export function normalizeWhitespace(input: string): string {
    return input.replace(WHITESPACE_PATTERN, " ").trim();
}

export function slugify(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-+|-+$/g, "");
}

export function normalizeCollectionName(baseName: string): {
    name: string;
    nameKey: string;
} {
    const normalizedName = normalizeWhitespace(baseName);
    return {
        name: normalizedName,
        nameKey: normalizedName.toLowerCase(),
    };
}

export function getInitials(baseName: string | null, email: string): string {
    const source = baseName?.trim() || email.trim();
    const parts = source.split(WHITESPACE_PATTERN).filter(Boolean);

    if (parts.length >= 2) {
        return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
    }

    return source.slice(0, 2).toUpperCase();
}

/**
 * A name is a user given human-readable string.
 *
 * It must not be used in URLs.
 *
 * @example the name of a key
 */
export const name = z.string().min(3).max(256);

/**
 * A description is a user given human-readable string.
 *
 * It must not be used in URLs.
 *
 * @example The description of a permission
 */
export const description = z
    .string()
    .min(3)
    .max(256)
    .optional()
    .or(z.literal(""));

const LIKE_ESCAPE_PATTERN = /[%_\\]/g;

export function escapeLikePattern(value: string): string {
    return value.replace(LIKE_ESCAPE_PATTERN, "\\$&");
}

/**
 * Truncates to maxLength. When truncated, the ellipsis is included in the
 * budget so the result length is at most maxLength.
 */
export function truncateText(value: string, maxLength: number): string {
    if (maxLength <= 0) {
        return "";
    }
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export const NAME_COLLATOR = new Intl.Collator(undefined, {
    ignorePunctuation: true,
    numeric: true,
    sensitivity: "base",
});
