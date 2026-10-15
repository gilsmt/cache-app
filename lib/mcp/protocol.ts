/**
 * Wire-format contracts for the MCP server.
 *
 * The zod schemas here are the single source of truth for the JSON that
 * flows into (tool args) and out of (`structuredContent`) every MCP tool.
 * Both `lib/mcp/service.ts` and `app/mcp/route.ts`
 * consume these — routes for `registerTool`'s `inputSchema` / `outputSchema`,
 * services via `z.infer` for their return types. There's no parallel
 * TypeScript type definition: drift between validator and consumer is
 * structurally impossible.
 */

import * as z from "zod";
import { LibraryItemKind } from "@/prisma/client/enums";

const LIBRARY_ITEM_ID_MAX_LENGTH = 64;
const COLLECTION_ID_MAX_LENGTH = 64;
const SEARCH_QUERY_MIN_LENGTH = 2;
const SEARCH_QUERY_MAX_LENGTH = 200;
const URL_MAX_LENGTH = 2048;
const CAPTION_MAX_LENGTH = 500;
const NOTE_TEXT_MAX_LENGTH = 100_000;
const LIBRARY_ITEM_LIST_LIMIT_MAX = 50;
const LIBRARY_ITEM_LIST_LIMIT_DEFAULT = 20;

export const McpCollectionItemSchema = z.object({
    id: z.string(),
    name: z.string(),
});

export const McpLibraryItemSchema = z.object({
    caption: z.string().nullable(),
    collections: z.array(McpCollectionItemSchema),
    createdAt: z.iso.datetime(),
    favoritedAt: z.iso.datetime().nullable(),
    id: z.string(),
    isFavorite: z.boolean(),
    kind: z.enum(LibraryItemKind),
    noteContentText: z.string().nullable(),
    source: z.string(),
    updatedAt: z.iso.datetime(),
    url: z.string(),
});

// Standalone collections payload includes item counts because the tool
// description promises them. `McpCollectionItemSchema` (with only id+name)
// is reused for collections nested inside a LibraryItem — those don't carry
// counts because the per-item payload would need a separate aggregated
// fetch for each one's collections. Keep the two schemas distinct so the
// difference stays explicit at every call site.
export const McpCollectionWithCountItemSchema = z.object({
    id: z.string(),
    itemCount: z.number().int().nonnegative(),
    name: z.string(),
});

export const McpLibraryItemListOutputSchema = z.object({
    hasMore: z.boolean(),
    items: z.array(McpLibraryItemSchema),
    nextOffset: z.number().int().nonnegative().optional(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
});

export const McpLibraryItemListInputSchema = z.object({
    collectionId: z
        .string()
        .trim()
        .min(1)
        .max(COLLECTION_ID_MAX_LENGTH)
        .optional()
        .describe(
            "Filter results to a specific collection ID. Must be a non-blank, trimmed string; empty values are rejected so call sites don't silently pass an empty string as a filter."
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .max(LIBRARY_ITEM_LIST_LIMIT_MAX)
        .default(LIBRARY_ITEM_LIST_LIMIT_DEFAULT)
        .describe(
            `Maximum number of items to return. Defaults to ${LIBRARY_ITEM_LIST_LIMIT_DEFAULT}. Capped at ${LIBRARY_ITEM_LIST_LIMIT_MAX}.`
        ),
    offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe(
            "Number of items to skip for pagination. Use alongside `limit` to page through results."
        ),
    search: z
        .string()
        .trim()
        .min(SEARCH_QUERY_MIN_LENGTH)
        .max(SEARCH_QUERY_MAX_LENGTH)
        .optional()
        .describe(
            "Case-insensitive substring matched against captions, URLs, and note text."
        ),
});

const McpItemIdInputSchema = z.object({
    itemId: z
        .string()
        .trim()
        .min(1)
        .max(LIBRARY_ITEM_ID_MAX_LENGTH)
        .describe(
            "The unique ID of a library item. Shared by the get and delete tools."
        ),
});

// `_get` and `_delete` consume the same `{itemId}` shape. Each tool's
// semantic is conveyed by the tool's `description`; the schema stays
// canonical here so we don't drift.
export const McpGetLibraryItemInputSchema = McpItemIdInputSchema;
export const McpDeleteLibraryItemInputSchema = McpItemIdInputSchema;

// `add_library_item` enforces two semantic rules:
//
//   1. `noteContentText` and `url` are mutually exclusive: callers must
//      choose one.
//   2. `url` must be http(s); `parseStandaloneUrl` (lib/common/url) also
//      rejects non-http schemes, so the validator must match.
//
// The schema is a `zod.union` of two strict shapes so the XOR survives the
// MCP SDK's per-field normalization (`normalizeObjectSchema` constructs
// `z4mini.object(shape)` from individual fields, which cannot carry
// cross-field `superRefine`). The route dispatches on which branch matched
// instead of re-running the XOR.
const McpAddLibraryNoteSchema = z.strictObject({
    noteContentText: z
        .string()
        .trim()
        .min(1)
        .max(NOTE_TEXT_MAX_LENGTH)
        .describe("Plain text for a note."),
});

const McpAddLibraryBookmarkSchema = z.strictObject({
    caption: z
        .string()
        .trim()
        .max(CAPTION_MAX_LENGTH)
        .optional()
        .describe("Optional caption or title for the saved bookmark."),
    url: z
        .string()
        .trim()
        .max(URL_MAX_LENGTH)
        .refine(
            (value) =>
                value.startsWith("http://") || value.startsWith("https://"),
            { message: "URL must use the http or https scheme." }
        )
        .describe(
            "Fully qualified http(s) URL to save as a bookmark. Save dedupes by URL, so calling twice with the same URL is safe."
        ),
});

export const McpAddLibraryItemInputSchema = z.union([
    McpAddLibraryNoteSchema,
    McpAddLibraryBookmarkSchema,
]);

export const McpDeleteLibraryItemOutputSchema = z.object({
    alreadyDeleted: z.boolean(),
    ok: z.literal(true),
});

export const McpCollectionListOutputSchema = z.object({
    collections: z.array(McpCollectionWithCountItemSchema),
    total: z.number().int().nonnegative(),
});
