import * as z from "zod";
import { NamedError } from "@/lib/common/error";

export const MCP_LIBRARY_ITEM_ERROR_MESSAGES = {
    idempotencyKeyConflict:
        "This idempotencyKey was already used for different note text. Reuse the original text to retry, or use a new key for a new note.",
    idempotencyKeyDeleted:
        "This note was already deleted. Use a new idempotencyKey to create another note.",
    invalidUrl: "The provided URL is not valid.",
    reloadFailed: "Bookmark was saved but could not be reloaded.",
} as const;

const MCP_LIBRARY_ITEM_ERROR_MESSAGE_SCHEMA = z.enum([
    MCP_LIBRARY_ITEM_ERROR_MESSAGES.idempotencyKeyConflict,
    MCP_LIBRARY_ITEM_ERROR_MESSAGES.idempotencyKeyDeleted,
    MCP_LIBRARY_ITEM_ERROR_MESSAGES.invalidUrl,
    MCP_LIBRARY_ITEM_ERROR_MESSAGES.reloadFailed,
]);

/**
 * Failures from the MCP library-item path (`addLibraryItem`).
 *
 * The closed message schema keeps echoed 4xx responses to authored text.
 * Never interpolate user input, URLs, or upstream text here.
 */
export const McpLibraryItemError = NamedError.create(
    "McpLibraryItemError",
    z.object({
        code: z.enum([
            "idempotency_key_conflict",
            "idempotency_key_deleted",
            "invalid_url",
            "reload_failed",
        ]),
        message: MCP_LIBRARY_ITEM_ERROR_MESSAGE_SCHEMA,
        operation: z.string(),
        status: z.number(),
    })
);
