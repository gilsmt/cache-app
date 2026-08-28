interface SearchMatchChunk {
    highlight: boolean;
    start: number;
    text: string;
}

const REGEX_SPECIAL_CHARACTERS_PATTERN = /[.*+?^${}()|[\]\\]/g;

/**
 * Splits text into ordered, non-empty chunks around every case-insensitive,
 * literal occurrence of query (regex metacharacters in the query are matched
 * literally).
 *
 * An empty query yields a single unhighlighted chunk; empty text yields none.
 */
export function splitSearchMatches(
    textToHighlight: string,
    query: string
): SearchMatchChunk[] {
    const normalizedQuery = query.trim();
    if (textToHighlight.length === 0) {
        return [];
    }
    if (normalizedQuery.length === 0) {
        return [{ highlight: false, start: 0, text: textToHighlight }];
    }

    const pattern = new RegExp(
        `(${normalizedQuery.replaceAll(REGEX_SPECIAL_CHARACTERS_PATTERN, "\\$&")})`,
        "gi"
    );

    // Splitting on a capturing group alternates unmatched text (even indices)
    // with matches (odd indices).
    const chunks: SearchMatchChunk[] = [];
    let start = 0;
    for (const [index, text] of textToHighlight.split(pattern).entries()) {
        if (text.length > 0) {
            chunks.push({ highlight: index % 2 === 1, start, text });
        }
        start += text.length;
    }
    return chunks;
}
