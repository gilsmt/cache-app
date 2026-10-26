const FETCH_FAILURE_RE =
    /\b(?:fetch|request|network)\s+(?:failed|error|aborted|timed?[\s-]?out|refused)\b/iu;
const PARSE_FAILURE_RE = /\bparse\b/iu;

const INTERNAL_ERROR_RE =
    /\bE[A-Z]+(?:REFUSED|RESET|TIMEDOUT|NOTFOUND|NOENT|ADDRINUSE)\b/u;
const STACK_FRAME_RE = /^\s+at\s/mu;

function looksLikeInternalError(message: string): boolean {
    if (INTERNAL_ERROR_RE.test(message)) {
        return true;
    }

    if (STACK_FRAME_RE.test(message)) {
        return true;
    }

    return false;
}

export function sanitizeFeedError(raw: string | null): string | null {
    if (raw === null) {
        return null;
    }

    if (raw.length > 200) {
        return "Could not parse this feed. Try a different URL.";
    }

    if (FETCH_FAILURE_RE.test(raw)) {
        return "Could not reach this feed. Try again later.";
    }

    if (PARSE_FAILURE_RE.test(raw)) {
        return "Could not parse this feed. Try a different URL.";
    }

    if (looksLikeInternalError(raw)) {
        return "Could not fetch this feed. Try again later.";
    }

    return raw;
}
