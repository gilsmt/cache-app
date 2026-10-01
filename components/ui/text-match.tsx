import { Fragment } from "react";

interface MatchChunk {
    chunk: string;
    highlight: boolean;
    start: number;
}

function escapeRegExpLiteral(value: string): string {
    if (typeof RegExp.escape === "function") {
        return RegExp.escape(value);
    }
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const QUERY_TERM_SEPARATOR = /\s+/;

/**
 * Splits text around each whitespace-separated query term (literal,
 * case-insensitive, non-overlapping).
 */
export function splitMatches(
    textToHighlight: string,
    query: string
): MatchChunk[] {
    if (textToHighlight.length === 0) {
        return [];
    }

    const normalizedQuery = query.trim();
    if (normalizedQuery.length === 0) {
        return [{ chunk: textToHighlight, highlight: false, start: 0 }];
    }

    const terms = [
        ...new Set(
            normalizedQuery
                .split(QUERY_TERM_SEPARATOR)
                .filter((term) => term.length > 0)
        ),
    ];
    if (terms.length === 0) {
        return [{ chunk: textToHighlight, highlight: false, start: 0 }];
    }
    terms.sort((left, right) => right.length - left.length);

    const pattern = new RegExp(
        `(${terms.map(escapeRegExpLiteral).join("|")})`,
        "giu"
    );

    // Splitting on a capturing group alternates unmatched text (even indices)
    // with matches (odd indices)
    const chunks: MatchChunk[] = [];
    let start = 0;
    for (const [index, segment] of textToHighlight.split(pattern).entries()) {
        if (segment.length > 0) {
            chunks.push({ chunk: segment, highlight: index % 2 === 1, start });
        }
        start += segment.length;
    }

    return chunks;
}

interface TextMatchProps {
    children: string;
    query: string;
}

export function TextMatch({ children, query }: TextMatchProps) {
    return splitMatches(children, query).map(({ highlight, start, chunk }) =>
        highlight ? (
            <mark className="bg-(--accent-color)/50" key={start}>
                {chunk}
            </mark>
        ) : (
            <Fragment key={start}>{chunk}</Fragment>
        )
    );
}
