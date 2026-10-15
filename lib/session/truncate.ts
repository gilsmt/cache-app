/**
 * Shared truncation utilities for tool outputs.
 *
 * Truncation is based on two independent limits - whichever is hit first wins:
 * - Line limit (default: 2000 lines)
 * - Byte limit (default: 50KB)
 *
 * Never returns partial lines (except bash tail truncation edge case).
 */

export const DEFAULT_MAX_LINES = 2000;
export const DEFAULT_MAX_BYTES = 50 * 1024; // 50KB
export const GREP_MAX_LINE_LENGTH = 500; // Max chars per grep match line

export interface TruncationResult {
    /** The truncated content */
    content: string;
    /** Whether the first line exceeded the byte limit (for head truncation) */
    firstLineExceedsLimit: boolean;
    /** Whether the last line was partially truncated (only for tail truncation edge case) */
    lastLinePartial: boolean;
    /** The max bytes limit that was applied */
    maxBytes: number;
    /** The max lines limit that was applied */
    maxLines: number;
    /** Number of bytes in the truncated output */
    outputBytes: number;
    /** Number of complete lines in the truncated output */
    outputLines: number;
    /** Total number of bytes in the original content */
    totalBytes: number;
    /** Total number of lines in the original content */
    totalLines: number;
    /** Whether truncation occurred */
    truncated: boolean;
    /** Which limit was hit: "lines", "bytes", or null if not truncated */
    truncatedBy: "lines" | "bytes" | null;
}

export interface TruncationOptions {
    /** Maximum number of bytes (default: 50KB) */
    maxBytes?: number;
    /** Maximum number of lines (default: 2000) */
    maxLines?: number;
}

interface RuntimeBuffer {
    byteLength: (content: string, encoding: "utf8") => number;
}

const runtimeBuffer = (globalThis as { Buffer?: RuntimeBuffer }).Buffer;

function findFirstNonAscii(content: string): number {
    for (let index = 0; index < content.length; index += 1) {
        if (content.charCodeAt(index) > 0x7f) {
            return index;
        }
    }
    return -1;
}

export function utf8ByteLength(content: string): number {
    if (runtimeBuffer) {
        return runtimeBuffer.byteLength(content, "utf8");
    }

    const firstNonAscii = findFirstNonAscii(content);
    if (firstNonAscii === -1) {
        return content.length;
    }

    let bytes = firstNonAscii;
    for (let i = firstNonAscii; i < content.length; i += 1) {
        const code = content.charCodeAt(i);
        if (code <= 0x7f) {
            bytes += 1;
        } else if (code <= 0x7_ff) {
            bytes += 2;
        } else if (
            code >= 0xd8_00 &&
            code <= 0xdb_ff &&
            i + 1 < content.length
        ) {
            const next = content.charCodeAt(i + 1);
            if (next >= 0xdc_00 && next <= 0xdf_ff) {
                bytes += 4;
                i += 1;
            } else {
                bytes += 3;
            }
        } else {
            bytes += 3;
        }
    }
    return bytes;
}

function splitLinesForCounting(content: string): string[] {
    if (content.length === 0) {
        return [];
    }
    const lines = content.split("\n");
    if (content.endsWith("\n")) {
        lines.pop();
    }
    return lines;
}

function replaceUnpairedSurrogates(content: string): string {
    let output = "";
    for (let i = 0; i < content.length; i += 1) {
        const code = content.charCodeAt(i);
        if (code >= 0xd8_00 && code <= 0xdb_ff) {
            if (i + 1 < content.length) {
                const next = content.charCodeAt(i + 1);
                if (next >= 0xdc_00 && next <= 0xdf_ff) {
                    output += content[i] + content[i + 1];
                    i += 1;
                    continue;
                }
            }
            output += "�";
        } else if (code >= 0xdc_00 && code <= 0xdf_ff) {
            output += "�";
        } else {
            output += content[i];
        }
    }
    return output;
}

/**
 * Format bytes as human-readable size.
 */
export function formatSize(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes}B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)}KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Truncate content from the head (keep first N lines/bytes).
 * Suitable for file reads where you want to see the beginning.
 *
 * Never returns partial lines. If first line exceeds byte limit,
 * returns empty content with firstLineExceedsLimit=true.
 */
export function truncateHead(
    content: string,
    options: TruncationOptions = {}
): TruncationResult {
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    const totalBytes = utf8ByteLength(content);
    const lines = splitLinesForCounting(content);
    const totalLines = lines.length;

    // Check if no truncation needed
    if (totalLines <= maxLines && totalBytes <= maxBytes) {
        return {
            content,
            firstLineExceedsLimit: false,
            lastLinePartial: false,
            maxBytes,
            maxLines,
            outputBytes: totalBytes,
            outputLines: totalLines,
            totalBytes,
            totalLines,
            truncated: false,
            truncatedBy: null,
        };
    }

    // Check if first line alone exceeds byte limit
    const firstLineBytes = utf8ByteLength(lines[0]);
    if (firstLineBytes > maxBytes) {
        return {
            content: "",
            firstLineExceedsLimit: true,
            lastLinePartial: false,
            maxBytes,
            maxLines,
            outputBytes: 0,
            outputLines: 0,
            totalBytes,
            totalLines,
            truncated: true,
            truncatedBy: "bytes",
        };
    }

    // Collect complete lines that fit
    const outputLinesArr: string[] = [];
    let outputBytesCount = 0;
    let truncatedBy: "lines" | "bytes" = "lines";

    for (let i = 0; i < lines.length && i < maxLines; i += 1) {
        const line = lines[i];
        const lineBytes = utf8ByteLength(line) + (i > 0 ? 1 : 0); // +1 for newline

        if (outputBytesCount + lineBytes > maxBytes) {
            truncatedBy = "bytes";
            break;
        }

        outputLinesArr.push(line);
        outputBytesCount += lineBytes;
    }

    // If we exited due to line limit
    if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
        truncatedBy = "lines";
    }

    const outputContent = outputLinesArr.join("\n");
    const finalOutputBytes = utf8ByteLength(outputContent);

    return {
        content: outputContent,
        firstLineExceedsLimit: false,
        lastLinePartial: false,
        maxBytes,
        maxLines,
        outputBytes: finalOutputBytes,
        outputLines: outputLinesArr.length,
        totalBytes,
        totalLines,
        truncated: true,
        truncatedBy,
    };
}

/**
 * Truncate content from the tail (keep last N lines/bytes).
 * Suitable for bash output where you want to see the end (errors, final results).
 *
 * May return partial first line if the last line of original content exceeds byte limit.
 */
export function truncateTail(
    content: string,
    options: TruncationOptions = {}
): TruncationResult {
    const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

    const totalBytes = utf8ByteLength(content);
    const lines = splitLinesForCounting(content);
    const totalLines = lines.length;

    // Check if no truncation needed
    if (totalLines <= maxLines && totalBytes <= maxBytes) {
        return {
            content,
            firstLineExceedsLimit: false,
            lastLinePartial: false,
            maxBytes,
            maxLines,
            outputBytes: totalBytes,
            outputLines: totalLines,
            totalBytes,
            totalLines,
            truncated: false,
            truncatedBy: null,
        };
    }

    // Work backwards from the end
    const outputLinesArr: string[] = [];
    let outputBytesCount = 0;
    let truncatedBy: "lines" | "bytes" = "lines";
    let lastLinePartial = false;

    for (
        let i = lines.length - 1;
        i >= 0 && outputLinesArr.length < maxLines;
        i -= 1
    ) {
        const line = lines[i];
        const lineBytes =
            utf8ByteLength(line) + (outputLinesArr.length > 0 ? 1 : 0); // +1 for newline

        if (outputBytesCount + lineBytes > maxBytes) {
            truncatedBy = "bytes";
            // Edge case: if we haven't added ANY lines yet and this line exceeds maxBytes,
            // take the end of the line (partial)
            if (outputLinesArr.length === 0) {
                const truncatedLine = truncateStringToBytesFromEnd(
                    line,
                    maxBytes
                );
                outputLinesArr.unshift(truncatedLine);
                outputBytesCount = utf8ByteLength(truncatedLine);
                lastLinePartial = true;
            }
            break;
        }

        outputLinesArr.unshift(line);
        outputBytesCount += lineBytes;
    }

    // If we exited due to line limit
    if (outputLinesArr.length >= maxLines && outputBytesCount <= maxBytes) {
        truncatedBy = "lines";
    }

    const outputContent = outputLinesArr.join("\n");
    const finalOutputBytes = utf8ByteLength(outputContent);

    return {
        content: outputContent,
        firstLineExceedsLimit: false,
        lastLinePartial,
        maxBytes,
        maxLines,
        outputBytes: finalOutputBytes,
        outputLines: outputLinesArr.length,
        totalBytes,
        totalLines,
        truncated: true,
        truncatedBy,
    };
}

/**
 * Truncate a string to fit within a byte limit (from the end).
 * Handles multi-byte UTF-8 characters correctly.
 */
function truncateStringToBytesFromEnd(str: string, maxBytes: number): string {
    if (maxBytes <= 0) {
        return "";
    }

    let outputBytes = 0;
    let start = str.length;
    let needsReplacement = false;
    for (let i = str.length; i > 0; ) {
        let characterStart = i - 1;
        const code = str.charCodeAt(characterStart);
        let characterBytes: number;
        let unpairedSurrogate = false;
        if (code >= 0xdc_00 && code <= 0xdf_ff && characterStart > 0) {
            const previous = str.charCodeAt(characterStart - 1);
            if (previous >= 0xd8_00 && previous <= 0xdb_ff) {
                characterStart -= 1;
                characterBytes = 4;
            } else {
                characterBytes = 3;
                unpairedSurrogate = true;
            }
        } else if (code >= 0xd8_00 && code <= 0xdf_ff) {
            characterBytes = 3;
            unpairedSurrogate = true;
        } else if (code <= 0x7f) {
            characterBytes = 1;
        } else if (code <= 0x7_ff) {
            characterBytes = 2;
        } else {
            characterBytes = 3;
        }
        if (outputBytes + characterBytes > maxBytes) {
            break;
        }
        outputBytes += characterBytes;
        start = characterStart;
        needsReplacement ||= unpairedSurrogate;
        i = characterStart;
    }

    const output = str.slice(start);
    return needsReplacement ? replaceUnpairedSurrogates(output) : output;
}

/**
 * Truncate a single line to max characters, adding [truncated] suffix.
 * Used for grep match lines.
 */
export function truncateLine(
    line: string,
    maxChars: number = GREP_MAX_LINE_LENGTH
): { text: string; wasTruncated: boolean } {
    if (line.length <= maxChars) {
        return { text: line, wasTruncated: false };
    }
    return {
        text: `${line.slice(0, maxChars)}... [truncated]`,
        wasTruncated: true,
    };
}

/**
 * Truncate a string to a char budget.
 * Keeps surrogate pairs intact and trims space at the cut.
 * Appends ellipsis within the budget, so output never exceeds maxChars.
 * Use empty ellipsis for hard cuts. Use "..." for model outputs.
 */
export function truncateChars(
    value: string,
    maxChars: number,
    ellipsis = ""
): string {
    const limit = Math.floor(maxChars);
    if (limit <= 0) {
        return "";
    }
    if (value.length <= limit) {
        return value;
    }
    if (ellipsis.length >= limit) {
        return ellipsis.slice(0, limit);
    }

    let end = limit - ellipsis.length;
    const last = value.charCodeAt(end - 1);
    const next = value.charCodeAt(end);
    const isHighSurrogate = last >= 0xd8_00 && last <= 0xdb_ff;
    const isLowSurrogateNext = next >= 0xdc_00 && next <= 0xdf_ff;
    if (isHighSurrogate && isLowSurrogateNext) {
        end -= 1;
    }

    return `${value.slice(0, end).trimEnd()}${ellipsis}`;
}
