import { Buffer } from "node:buffer";
import type { FilePart, ModelMessage } from "ai";
import { CHARS_PER_TOKEN, estimateTokens } from "@/lib/session/ai/usage";

// Model-independent reservation, not measured usage. Allow room for image tiling
// without charging the base64 transport encoding as if it were prompt text.
const IMAGE_TOKEN_RESERVATION = 8192;
// Page counts need a PDF parser. Use a floor and a decoded-byte estimate instead.
const DOCUMENT_TOKEN_RESERVATION_MIN = 8192;

export function estimateThreadRequestTokens(args: {
    modelMessages: ModelMessage[];
    outputTokenLimit: number;
    system: string;
}): number {
    let fileTokens = 0;
    const messagesForTokenEstimate = args.modelMessages.map((message) => {
        if (typeof message.content === "string") {
            return message;
        }
        return {
            ...message,
            content: message.content.map((part) => {
                if (part.type === "image") {
                    const { image: _image, ...rest } = part;
                    fileTokens += IMAGE_TOKEN_RESERVATION;
                    return rest;
                }
                if (part.type === "file" || part.type === "reasoning-file") {
                    const { data, ...rest } = part;
                    fileTokens += estimateFileTokens(data, part.mediaType);
                    return rest;
                }
                return part;
            }),
        };
    });

    return (
        estimateTokens(
            `${args.system}\n${JSON.stringify(messagesForTokenEstimate)}`,
            args.outputTokenLimit
        ) + fileTokens
    );
}

function estimateFileTokens(data: FilePart["data"], mediaType: string): number {
    if (mediaType === "image" || mediaType.startsWith("image/")) {
        return IMAGE_TOKEN_RESERVATION;
    }
    if (data instanceof URL) {
        // Do not fetch URLs to estimate usage. The thread boundary permits only
        // inline data; provider references and remote files have no local size.
        if (data.protocol !== "data:") {
            return DOCUMENT_TOKEN_RESERVATION_MIN;
        }
        return estimateFileTokens(data.href, mediaType);
    }
    if (typeof data === "string") {
        const base64 = data.startsWith("data:")
            ? data.slice(data.indexOf(",") + 1)
            : data;
        if (mediaType === "text/plain") {
            return estimateTokens(
                Buffer.from(base64, "base64").toString("utf8")
            );
        }
        const padding = base64.endsWith("==")
            ? 2
            : Number(base64.endsWith("="));
        return Math.max(
            DOCUMENT_TOKEN_RESERVATION_MIN,
            Math.ceil(((base64.length / 4) * 3 - padding) / CHARS_PER_TOKEN)
        );
    }
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
        if (mediaType === "text/plain") {
            return estimateTokens(new TextDecoder().decode(data));
        }
        return Math.max(
            DOCUMENT_TOKEN_RESERVATION_MIN,
            Math.ceil(data.byteLength / CHARS_PER_TOKEN)
        );
    }
    switch (data.type) {
        case "data":
            return estimateFileTokens(data.data, mediaType);
        case "url":
            return estimateFileTokens(data.url, mediaType);
        case "text":
            if (mediaType === "text/plain") {
                return estimateTokens(data.text);
            }
            return Math.max(
                DOCUMENT_TOKEN_RESERVATION_MIN,
                Math.ceil(
                    Buffer.byteLength(data.text, "utf8") / CHARS_PER_TOKEN
                )
            );
        default:
            return DOCUMENT_TOKEN_RESERVATION_MIN;
    }
}
