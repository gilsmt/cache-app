import * as z from "zod";

const TRAILING_NUMBER_RE = /(\d+)$/;
const WHITESPACE_PATTERN = /\s+/g;
const SLUG_DISALLOWED_PATTERN = /[^\p{L}\p{N}\p{M}]+/gu;
const SLUG_EDGE_HYPHEN_PATTERN = /^-+|-+$/g;
const SLUG_DEFAULT_MAX_LENGTH = 64;

const GRAPHEME_SEGMENTER =
    typeof Intl.Segmenter === "undefined"
        ? null
        : new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Drops invisible spoofing characters (bidi controls, ZWSP, BOM, soft
// hyphen) and the C0 controls Postgres rejects. Collapsible whitespace
// and ZWJ/ZWNJ are preserved for scripts and emoji.
function isUnsafeInvisible(code: number): boolean {
    return (
        (code >= 0x20_2a && code <= 0x20_2e) ||
        (code >= 0x20_66 && code <= 0x20_69) ||
        code === 0x20_0b ||
        code === 0xfe_ff ||
        code === 0x00_ad ||
        (code >= 0x00_00 && code <= 0x00_08) ||
        (code >= 0x00_0e && code <= 0x00_1f) ||
        code === 0x00_7f
    );
}

function stripUnsafeInvisibles(value: string): string {
    let result = "";
    for (const char of value) {
        const code = char.codePointAt(0) ?? 0;
        if (!isUnsafeInvisible(code)) {
            result += char;
        }
    }
    return result;
}

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
        result = withIncrementedTrailingNumber(result);
    }
    return result;
}

function withIncrementedTrailingNumber(value: string): string {
    const match = TRAILING_NUMBER_RE.exec(value);
    if (!match) {
        return value.length === 0 ? "1" : `${value} 1`;
    }
    const digits = match[1] ?? "";
    const head = value.slice(0, value.length - digits.length);
    return head + incrementDecimalString(digits);
}

function incrementDecimalString(digits: string): string {
    const reversed = digits.split("").reverse();
    const incremented: string[] = [];
    let carry = 1;
    for (const char of reversed) {
        if (carry === 0) {
            incremented.push(char);
            continue;
        }
        const sum = char.charCodeAt(0) - 48 + carry;
        carry = sum >= 10 ? 1 : 0;
        incremented.push(String.fromCharCode((sum % 10) + 48));
    }
    if (carry === 1) {
        incremented.push("1");
    }
    return incremented.reverse().join("");
}

export function normalizeWhitespace(input: string): string {
    return stripUnsafeInvisibles(input.normalize("NFC"))
        .replace(WHITESPACE_PATTERN, " ")
        .trim();
}

export function slugify(
    input: string,
    maxLength = SLUG_DEFAULT_MAX_LENGTH
): string {
    const slug = input
        .normalize("NFC")
        .trim()
        .toLowerCase()
        .replaceAll(SLUG_DISALLOWED_PATTERN, "-")
        .replaceAll(SLUG_EDGE_HYPHEN_PATTERN, "");
    if (maxLength <= 0) {
        return "";
    }
    if (slug.length <= maxLength) {
        return slug;
    }
    return graphemePrefix(slug, maxLength).replaceAll(
        SLUG_EDGE_HYPHEN_PATTERN,
        ""
    );
}

export function getTextMatchScore(
    candidateName: string,
    query: string
): number {
    const normalizedQuery = query.trim().normalize("NFC").toLowerCase();
    if (normalizedQuery.length === 0) {
        return 0;
    }
    const normalizedCandidate = candidateName
        .trim()
        .normalize("NFC")
        .toLowerCase();
    if (normalizedCandidate === normalizedQuery) {
        return 3;
    }
    if (normalizedCandidate.startsWith(normalizedQuery)) {
        return 2;
    }
    if (normalizedCandidate.includes(normalizedQuery)) {
        return 1;
    }
    return 0;
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
    const [firstPart = "", secondPart = ""] = parts;

    if (parts.length >= 2) {
        return `${firstGraphemes(firstPart, 1)}${firstGraphemes(secondPart, 1)}`.toUpperCase();
    }

    // A bare email ("a@b.com") should yield "A", not "A@".
    const atIndex = source.indexOf("@");
    const token =
        parts.length === 0 || atIndex <= 0 ? source : source.slice(0, atIndex);
    return firstGraphemes(token, 2).toUpperCase();
}

// Returns the first `count` graphemes so emoji, flags, and combining marks
// stay intact. Falls back to code points when Intl.Segmenter is missing.
function firstGraphemes(value: string, count: number): string {
    if (GRAPHEME_SEGMENTER) {
        let result = "";
        let taken = 0;
        for (const segment of GRAPHEME_SEGMENTER.segment(value)) {
            if (taken >= count) {
                break;
            }
            result += segment.segment;
            taken += 1;
        }
        return result;
    }
    return Array.from(value).slice(0, count).join("");
}

/**
 * A name is a user given human-readable string.
 *
 * It must not be used in URLs.
 *
 * @example the name of a key
 */
export const name = z.string().trim().min(3).max(256);

/**
 * A description is a user given human-readable string.
 *
 * It must not be used in URLs.
 *
 * @example The description of a permission
 */
export const description = z
    .string()
    .trim()
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
    if (!Number.isFinite(maxLength)) {
        return Number.isNaN(maxLength) ? "" : value;
    }
    const budget = Math.floor(maxLength);
    if (budget <= 0) {
        return "";
    }
    if (value.length <= budget) {
        return value;
    }
    if (budget === 1) {
        return "…";
    }
    return `${graphemePrefix(value, budget - 1).trimEnd()}…`;
}

// Longest grapheme prefix whose UTF-16 length fits `maxUnits`, so slicing
// never splits a surrogate pair, flag, ZWJ sequence, or combining mark.
function graphemePrefix(value: string, maxUnits: number): string {
    if (GRAPHEME_SEGMENTER) {
        let result = "";
        for (const segment of GRAPHEME_SEGMENTER.segment(value)) {
            if (result.length + segment.segment.length > maxUnits) {
                break;
            }
            result += segment.segment;
        }
        return result;
    }
    let result = "";
    for (const point of value) {
        if (result.length + point.length > maxUnits) {
            break;
        }
        result += point;
    }
    return result;
}

export const NAME_COLLATOR = new Intl.Collator(undefined, {
    ignorePunctuation: true,
    numeric: true,
    sensitivity: "base",
});
