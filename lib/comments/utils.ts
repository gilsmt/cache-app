export const COMMENT_TEXT_MAX_LENGTH = 5000;

/**
 * Whitespace-only comments are treated as "no comment": the row is deleted
 * rather than persisted as empty text.
 */
export function normalizeCommentText(contentText: string): string | null {
    const trimmed = contentText.trim();
    return trimmed.length > 0 ? trimmed : null;
}
