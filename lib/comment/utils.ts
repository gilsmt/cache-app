/** Maximum length of a comment's text, enforced on write. */
export const COMMENT_TEXT_MAX_LENGTH = 5000;

/**
 * Normalize a comment draft for storage. Whitespace-only comments are treated
 * as "no comment": the row is deleted rather than persisted as empty text.
 */
export function normalizeCommentText(contentText: string): string | null {
    const trimmed = contentText.trim();
    return trimmed.length > 0 ? trimmed : null;
}
