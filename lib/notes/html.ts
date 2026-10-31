export const NOTE_EMPTY_HTML = "<p></p>";

export function normalizeHtml(html: string | null | undefined): string {
    return html?.trim() || NOTE_EMPTY_HTML;
}
