import type {
    CallToolResult,
    McpServer,
    ServerContext,
} from "@modelcontextprotocol/server";
import {
    createMcpHandler,
    type McpHandlerOptions,
    withMcpAuth,
} from "mcp-handler";
import * as z from "zod";
import { LibraryCollectionError } from "@/lib/collections/error";
import {
    deleteLibraryItem,
    getLibraryItem,
    listCollections,
    listLibraryItems,
} from "@/lib/collections/service";
import { createLogger } from "@/lib/common/logs/console/logger";
import { tryParseUrl } from "@/lib/common/url";
import { IntegrationApiError } from "@/lib/integrations/error";
import { MCP_SCOPES, type McpScope } from "@/lib/integrations/mcp/auth";
import {
    McpAddLibraryItemInputSchema,
    McpCollectionListOutputSchema,
    McpDeleteLibraryItemInputSchema,
    McpDeleteLibraryItemOutputSchema,
    McpGetLibraryItemInputSchema,
    McpLibraryItemListInputSchema,
    McpLibraryItemListOutputSchema,
    McpLibraryItemSchema,
} from "@/lib/integrations/mcp/protocol";
import {
    incrementMcpRateCounter,
    isOverLimit,
    MCP_RATE_BUCKETS,
} from "@/lib/integrations/mcp/rate-limit";
import {
    addLibraryItem,
    toMcpLibraryItem,
    verifyMcpAuthToken,
} from "@/lib/integrations/mcp/service";

const log = createLogger("mcp.route");

function resolveAuth(extra: ServerContext): {
    scopes: McpScope[];
    userId: string;
} | null {
    const authInfo = extra.http?.authInfo;
    let userId: string | null = null;
    if (typeof authInfo?.extra?.userId === "string") {
        userId = authInfo.extra.userId;
    } else if (typeof authInfo?.clientId === "string") {
        userId = authInfo.clientId;
    }
    if (!userId) {
        return null;
    }
    const scopes = (authInfo?.scopes ?? []).filter((scope): scope is McpScope =>
        (MCP_SCOPES as readonly string[]).includes(scope)
    );
    return { scopes, userId };
}

function unauthorizedResult(): CallToolResult {
    return {
        content: [
            {
                text: "Unauthorized: missing or invalid token.",
                type: "text",
            },
        ],
        isError: true,
    };
}

function insufficientScopeResult(needed: McpScope): CallToolResult {
    return {
        content: [
            {
                text: `Forbidden: token grants fewer scopes than required for this tool (need \`${needed}\`).`,
                type: "text",
            },
        ],
        isError: true,
    };
}

function textErrorResult(message: string): CallToolResult {
    return {
        content: [{ text: message, type: "text" }],
        isError: true,
    };
}

/**
 * Validate the resolved auth before executing a tool. `required` is the scope
 * the tool needs to run. Returning a `CallToolResult` short-circuits the
 * tool call with a structured "user-facing" error so MCP clients can adapt
 * (rotate to a write-capable token, etc.) instead of receiving an opaque
 * `tools/call` exception.
 *
 * The `auth.scopes.includes(required)` check filters out read-only tokens
 * for write-capable tools, so a future exporters/observability integration
 * running with `library:read` cannot upsert or delete library data.
 */
async function authorizeToolCall(
    extra: ServerContext,
    required: McpScope
): Promise<{ userId: string } | { result: CallToolResult }> {
    const auth = resolveAuth(extra);
    if (!auth) {
        return { result: unauthorizedResult() };
    }
    if (!auth.scopes.includes(required)) {
        return { result: insufficientScopeResult(required) };
    }
    const bucket =
        required === "library:write"
            ? MCP_RATE_BUCKETS.write
            : MCP_RATE_BUCKETS.read;
    const decision = await incrementMcpRateCounter(auth.userId, bucket);
    if (decision !== null && isOverLimit(decision, bucket)) {
        return { result: rateLimitResult(bucket, decision) };
    }
    return { userId: auth.userId };
}

function rateLimitResult(
    bucket: { limit: number; name: string },
    decision: { retryAfterSeconds: number }
): CallToolResult {
    log.warn(`rate limit hit (${bucket.name})`, {
        retryAfterSeconds: decision.retryAfterSeconds,
    });
    return {
        content: [
            {
                text: `Rate limit reached for \`${bucket.name}\` operations. Retry in about ${decision.retryAfterSeconds} seconds.`,
                type: "text",
            },
        ],
        isError: true,
    };
}

/**
 * Logs the underlying error with full context and returns a stable,
 * machine-readable message to the MCP client. We never echo
 * `error.message` because it can carry DB schema names, stack paths, or
 * third-party API hints that aid an attacker probing the integration.
 */
function handleToolError(
    toolName: string,
    fallbackMessage: string,
    userId: string,
    error: unknown
): CallToolResult {
    log.error(`${toolName} failed`, { error, userId });
    return textErrorResult(fallbackMessage);
}

// ---------------------------------------------------------------------------
// Tool handlers. The MCP SDK validates input against `inputSchema` before
// invoking the callback, so the typed `args` are already safe.
// ---------------------------------------------------------------------------

async function handleListLibraryItems(
    args: z.infer<typeof McpLibraryItemListInputSchema>,
    extra: ServerContext
): Promise<CallToolResult> {
    const auth = await authorizeToolCall(extra, "library:read");
    if ("result" in auth) {
        return auth.result;
    }
    const { userId } = auth;

    try {
        const { items, total } = await listLibraryItems({
            collectionId: args.collectionId,
            limit: args.limit,
            offset: args.offset,
            search: args.search,
            userId,
        });
        const mcpItems = items.map(toMcpLibraryItem);
        const nextOffset = args.offset + args.limit;
        const hasMore = total > nextOffset;
        const payload = {
            hasMore,
            items: mcpItems,
            nextOffset: hasMore ? nextOffset : undefined,
            offset: args.offset,
            total,
        };
        return {
            content: [{ text: JSON.stringify(payload), type: "text" }],
            structuredContent: payload,
        };
    } catch (error) {
        return handleToolError(
            "list_library_items",
            "Could not list library items.",
            userId,
            error
        );
    }
}

async function handleGetLibraryItem(
    args: z.infer<typeof McpGetLibraryItemInputSchema>,
    extra: ServerContext
): Promise<CallToolResult> {
    const auth = await authorizeToolCall(extra, "library:read");
    if ("result" in auth) {
        return auth.result;
    }
    const { userId } = auth;

    try {
        const item = await getLibraryItem({
            itemId: args.itemId,
            userId,
        });
        if (!item) {
            return textErrorResult("Library item not found.");
        }
        const payload = toMcpLibraryItem(item);
        return {
            content: [{ text: JSON.stringify(payload), type: "text" }],
            structuredContent: payload,
        };
    } catch (error) {
        return handleToolError(
            "get_library_item",
            "Could not retrieve the library item.",
            userId,
            error
        );
    }
}

async function handleAddLibraryItem(
    args: z.infer<typeof McpAddLibraryItemInputSchema>,
    extra: ServerContext
): Promise<CallToolResult> {
    const auth = await authorizeToolCall(extra, "library:write");
    if ("result" in auth) {
        return auth.result;
    }
    const { userId } = auth;

    // The input schema is `noteContentText | url`, so only one branch can be
    // present in any given parse. The XOR previously lived in `superRefine`
    // (protocol.ts) but the MCP SDK normalizes raw shapes field-by-field and
    // drops cross-field rules; the union moves the constraint onto the wire.
    const noteContentText =
        "noteContentText" in args ? args.noteContentText : undefined;
    const url = "url" in args ? args.url : undefined;
    const caption = "caption" in args ? args.caption : undefined;

    try {
        const item = await addLibraryItem({
            caption,
            noteContentText,
            url,
            userId,
        });
        const payload = toMcpLibraryItem(item);
        return {
            content: [
                { text: `Saved. ${JSON.stringify(payload)}`, type: "text" },
            ],
            structuredContent: payload,
        };
    } catch (error) {
        // Client-facing validation failures (XOR / invalid URL) are safe to
        // echo: they are authored strings, not infrastructure leakage.
        if (IntegrationApiError.isInstance(error)) {
            const status = error.data.status;
            if (typeof status === "number" && status >= 400 && status < 500) {
                return textErrorResult(error.data.message);
            }
        }
        return handleToolError(
            "add_library_item",
            "Could not save the library item.",
            userId,
            error
        );
    }
}

async function handleDeleteLibraryItem(
    args: z.infer<typeof McpDeleteLibraryItemInputSchema>,
    extra: ServerContext
): Promise<CallToolResult> {
    const auth = await authorizeToolCall(extra, "library:write");
    if ("result" in auth) {
        return auth.result;
    }
    const { userId } = auth;

    try {
        await deleteLibraryItem({ itemId: args.itemId, userId });
        const payload = McpDeleteLibraryItemOutputSchema.parse({ ok: true });
        return {
            content: [
                {
                    text: "Library item deleted.",
                    type: "text",
                },
            ],
            structuredContent: payload,
        };
    } catch (error) {
        if (
            LibraryCollectionError.isInstance(error) &&
            error.data.code === "not_found"
        ) {
            // Treat already-trashed or never-existed as a successful no-op
            // so MCP clients can retry safely after a network blip. The
            // tool's `outputSchema` (and the `{ ok: true }` payload) is
            // unchanged so callers that rely on the typed result can keep
            // doing so without branching.
            const payload = McpDeleteLibraryItemOutputSchema.parse({
                ok: true,
            });
            return {
                content: [
                    {
                        text: "Library item was already removed.",
                        type: "text",
                    },
                ],
                structuredContent: payload,
            };
        }
        return handleToolError(
            "delete_library_item",
            "Could not delete the library item.",
            userId,
            error
        );
    }
}

async function handleListCollections(
    _args: object,
    extra: ServerContext
): Promise<CallToolResult> {
    const auth = await authorizeToolCall(extra, "library:read");
    if ("result" in auth) {
        return auth.result;
    }
    const { userId } = auth;

    try {
        const collections = await listCollections({ userId });
        const payload = {
            collections: collections.map((c) => ({
                id: c.id,
                itemCount: c.itemCount,
                name: c.name,
            })),
            total: collections.length,
        };
        return {
            content: [{ text: JSON.stringify(payload), type: "text" }],
            structuredContent: payload,
        };
    } catch (error) {
        return handleToolError(
            "list_collections",
            "Could not list collections.",
            userId,
            error
        );
    }
}

const EMPTY_INPUT_SCHEMA = z.object({});

const LibAnn = {
    Destructive: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
    },
    Mutating: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
    },
    ReadOnly: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
    },
} as const;

// ---------------------------------------------------------------------------
// MCP server bootstrap.
// ---------------------------------------------------------------------------

type McpHandlerEvent = Parameters<NonNullable<McpHandlerOptions["onEvent"]>>[0];

function logMcpEvent(event: McpHandlerEvent): void {
    if (event.type === "ERROR") {
        const meta = {
            context: event.context,
            error: event.error,
            source: event.source,
        };
        if (event.severity === "warning") {
            log.warn("mcp handler warning", meta);
        } else {
            log.error("mcp handler error", meta);
        }
        return;
    }
    // `REQUEST_RECEIVED` carries nothing `REQUEST_COMPLETED` doesn't already
    // report (method, duration, outcome); logging both doubles the noise.
    if (event.type === "REQUEST_RECEIVED") {
        return;
    }
    const meta = { durationMs: event.duration, method: event.method };
    if (event.status === "success") {
        log.info("mcp request completed", meta);
    } else {
        log.warn("mcp request failed", meta);
    }
}

const baseHandler = createMcpHandler(
    (server: McpServer) => {
        server.registerTool(
            "list_library_items",
            {
                annotations: LibAnn.ReadOnly,
                description:
                    "List library items for the authenticated user. Supports optional `search` (substring match across captions, URLs, and note text), optional `collectionId` filter, and paginated results via `limit`/`offset`. Returns `hasMore` and `nextOffset` for pagination. Read-only; idempotent.",
                inputSchema: McpLibraryItemListInputSchema,
                outputSchema: McpLibraryItemListOutputSchema,
                title: "List Library Items",
            },
            handleListLibraryItems
        );

        server.registerTool(
            "get_library_item",
            {
                annotations: LibAnn.ReadOnly,
                description:
                    "Fetch a single library item by ID. Read-only; returns not-found text when the ID does not exist for the user.",
                inputSchema: McpGetLibraryItemInputSchema,
                outputSchema: McpLibraryItemSchema,
                title: "Get Library Item",
            },
            handleGetLibraryItem
        );

        server.registerTool(
            "add_library_item",
            {
                annotations: LibAnn.Mutating,
                description:
                    "Save a new item to the user's library. Two shapes are accepted (the schema is `oneOf`): provide `{ url, caption? }` to save a bookmark (dedupes by URL so re-saving is safe), or `{ noteContentText }` to save a note. Sending both or neither is rejected at validation time.",
                inputSchema: McpAddLibraryItemInputSchema,
                outputSchema: McpLibraryItemSchema,
                title: "Add Library Item",
            },
            handleAddLibraryItem
        );

        server.registerTool(
            "delete_library_item",
            {
                annotations: {
                    ...LibAnn.Destructive,
                    idempotentHint: true,
                },
                description:
                    "Delete a library item by ID. Idempotent — calling on an already-deleted item returns ok.",
                inputSchema: McpDeleteLibraryItemInputSchema,
                outputSchema: McpDeleteLibraryItemOutputSchema,
                title: "Delete Library Item",
            },
            handleDeleteLibraryItem
        );

        server.registerTool(
            "list_collections",
            {
                annotations: LibAnn.ReadOnly,
                description:
                    "List the authenticated user's collections with item counts. Read-only; idempotent.",
                inputSchema: EMPTY_INPUT_SCHEMA,
                outputSchema: McpCollectionListOutputSchema,
                title: "List Collections",
            },
            handleListCollections
        );
    },
    {
        onEvent: logMcpEvent,
        serverInfo: {
            name: "cache",
            version: "1.0.0",
        },
    }
);

// `withMcpAuth` first so MCP session headers stay intact. `required: false`
// lets `initialize` / `tools/list` run without a token; tools still gate via
// `authorizeToolCall`.
const mcpHandler = withMcpAuth(baseHandler, verifyMcpAuthToken, {
    required: false,
});

/**
 * Browser MCP clients need CORS on both the OPTIONS preflight and the real
 * GET/POST response. `mcp-handler` does not attach ACAO on streamable HTTP,
 * so we own the full CORS surface here:
 * - Allowlisted Origin only (never `*`) so `Authorization` can be sent
 * - Same allow-list on preflight and actual responses
 */
const CORS_ALLOWED_HEADERS = "authorization,content-type,accept,mcp-session-id";
const CORS_ALLOWED_METHODS = "POST, GET, OPTIONS";
const CORS_MAX_AGE = "86400";

function isAllowedOrigin(origin: string): boolean {
    if (!origin) {
        return false;
    }
    const host = tryParseUrl(origin)?.hostname;
    return (
        host === "cachd.app" ||
        host?.endsWith(".cachd.app") === true ||
        host === "localhost" ||
        host === "127.0.0.1"
    );
}

function applyCorsHeaders(request: Request, headers: Headers): void {
    const origin = request.headers.get("origin") ?? "";
    headers.set("Vary", "Origin");
    if (!isAllowedOrigin(origin)) {
        return;
    }
    headers.set("Access-Control-Allow-Origin", origin);
}

function withCors(request: Request, response: Response): Response {
    const headers = new Headers(response.headers);
    // The MCP transport spec requires no-store on all HTTP responses.
    headers.set("Cache-Control", "private, no-store");
    applyCorsHeaders(request, headers);
    return new Response(response.body, {
        headers,
        status: response.status,
        statusText: response.statusText,
    });
}

export function OPTIONS(request: Request): Response {
    const headers = new Headers({
        "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
        "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
        "Access-Control-Max-Age": CORS_MAX_AGE,
    });
    applyCorsHeaders(request, headers);
    if (headers.has("Access-Control-Allow-Origin")) {
        headers.append("Vary", "Access-Control-Request-Headers");
    }
    return new Response(null, { headers, status: 204 });
}

export async function GET(request: Request): Promise<Response> {
    return withCors(request, await mcpHandler(request));
}

export async function POST(request: Request): Promise<Response> {
    return withCors(request, await mcpHandler(request));
}
