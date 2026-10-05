const CSV_RECORD_SEPARATOR = "\r\n";
const CSV_FORMULA_PREFIX_PATTERN = /^[=+\-@]/;

/**
 * Writes rows of cells as an RFC 4180 document, header row first.
 *
 * Callers pass raw values. The writer quotes and neutralizes every cell, so no
 * caller can leave one of the two steps out.
 */
export function toCsv(rows: readonly (readonly string[])[]): string {
    return rows
        .map((row) => row.map(csvCell).join(","))
        .join(CSV_RECORD_SEPARATOR);
}

/**
 * Writes one cell as RFC 4180 quoted text.
 *
 * A leading apostrophe neutralizes formula injection, because spreadsheet
 * applications evaluate cells that start with =, +, -, or @ as formulas. The
 * apostrophe goes in front of the value, so quoting happens after it.
 */
function csvCell(value: string): string {
    const neutralized = CSV_FORMULA_PREFIX_PATTERN.test(value.trimStart())
        ? `'${value}`
        : value;

    return `"${neutralized.replaceAll('"', '""')}"`;
}
