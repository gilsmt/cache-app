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
import { isTrustedCacheWebOrigin } from "@/lib/common/security/origins";
import { isMcpScope, type McpScope } from "@/lib/session/mcp/auth";
import { McpLibraryItemError } from "@/lib/session/mcp/error";
import {
    McpAddLibraryItemInputSchema,
    McpCollectionListOutputSchema,
    McpDeleteLibraryItemInputSchema,
    McpDeleteLibraryItemOutputSchema,
    McpGetLibraryItemInputSchema,
    McpLibraryItemListInputSchema,
    McpLibraryItemListOutputSchema,
    McpLibraryItemSchema,
} from "@/lib/session/mcp/protocol";
import {
    checkMcpRateLimit,
    MCP_RATE_BUCKETS,
} from "@/lib/session/mcp/rate-limit";
import {
    addLibraryItem,
    toMcpLibraryItem,
    verifyMcpAuthToken,
} from "@/lib/session/mcp/service";

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
    const scopes = (authInfo?.scopes ?? []).filter(isMcpScope);
    return { scopes, userId };
}

function textErrorResult(message: string): CallToolResult {
    return {
        content: [{ text: message, type: "text" }],
        isError: true,
    };
}

function okResult<T extends Record<string, unknown>>(
    payload: T,
    text?: string
): CallToolResult {
    return {
        content: [{ text: text ?? JSON.stringify(payload), type: "text" }],
        structuredContent: payload,
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
        return {
            result: textErrorResult("Unauthorized: missing or invalid token."),
        };
    }
    if (!auth.scopes.includes(required)) {
        return {
            result: textErrorResult(
                `Forbidden: token grants fewer scopes than required for this tool (need \`${required}\`).`
            ),
        };
    }
    const bucket =
        required === "library:write"
            ? MCP_RATE_BUCKETS.write
            : MCP_RATE_BUCKETS.read;
    const gate = await checkMcpRateLimit(auth.userId, bucket);
    if (gate.limited) {
        return {
            result: rateLimitResult(
                bucket,
                gate.retryAfterSeconds,
                auth.userId
            ),
        };
    }
    return { userId: auth.userId };
}

function rateLimitResult(
    bucket: { limit: number; name: string },
    retryAfterSeconds: number,
    userId: string
): CallToolResult {
    log.warn(`rate limit hit (${bucket.name})`, {
        retryAfterSeconds,
        userId,
    });
    return {
        content: [
            {
                text: `Rate limit reached for \`${bucket.name}\` operations. Retry in about ${retryAfterSeconds} seconds.`,
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
            ...(hasMore ? { nextOffset } : {}),
            offset: args.offset,
            total,
        };
        return okResult(payload);
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
        return okResult(payload);
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
        return okResult(payload, `Saved. ${JSON.stringify(payload)}`);
    } catch (error) {
        // Client-facing validation failures are safe to echo because the
        // type gate below admits only this module's own error: every message
        // in `McpLibraryItemError` is an authored static string, never
        // infrastructure leakage. The 5xx case (`reload_failed`) still falls
        // through to the generic handler.
        if (McpLibraryItemError.isInstance(error)) {
            const status = error.data.status;
            if (status >= 400 && status < 500) {
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
        const payload = McpDeleteLibraryItemOutputSchema.parse({
            alreadyDeleted: false,
            ok: true,
        });
        return okResult(payload, "Library item deleted.");
    } catch (error) {
        if (
            LibraryCollectionError.isInstance(error) &&
            error.data.code === "not_found"
        ) {
            // Treat already-trashed or never-existed as a successful no-op
            // so MCP clients can retry safely after a network blip. The
            // `alreadyDeleted` flag keeps the typed result truthful so
            // callers that rely on `structuredContent` can distinguish the
            // no-op without parsing human-readable text.
            const payload = McpDeleteLibraryItemOutputSchema.parse({
                alreadyDeleted: true,
                ok: true,
            });
            return okResult(payload, "Library item was already removed.");
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
        return okResult(payload);
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

const TOOL_ANNOTATIONS = {
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
                annotations: TOOL_ANNOTATIONS.ReadOnly,
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
                annotations: TOOL_ANNOTATIONS.ReadOnly,
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
                annotations: TOOL_ANNOTATIONS.Mutating,
                description:
                    "Save a new item to the user's library. Two shapes are accepted (the schema is `oneOf`): provide `{ url, caption? }` to save a bookmark (dedupes by URL so re-saving is safe, including caption updates), or `{ noteContentText }` to save a note (every call creates a new note, so retries after a network blip can duplicate). Sending both or neither is rejected at validation time.",
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
                    ...TOOL_ANNOTATIONS.Destructive,
                    idempotentHint: true,
                },
                description:
                    "Delete a library item by ID. Idempotent — calling on an already-deleted item returns ok with `alreadyDeleted: true`.",
                inputSchema: McpDeleteLibraryItemInputSchema,
                outputSchema: McpDeleteLibraryItemOutputSchema,
                title: "Delete Library Item",
            },
            handleDeleteLibraryItem
        );

        server.registerTool(
            "list_collections",
            {
                annotations: TOOL_ANNOTATIONS.ReadOnly,
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
// `authorizeToolCall`. The default `resource_metadata` challenge URL resolves
// to `app/.well-known/oauth-protected-resource/route.ts`.
const mcpHandler = withMcpAuth(baseHandler, verifyMcpAuthToken, {
    required: false,
});

/**
 * Browser MCP clients need CORS on both the OPTIONS preflight and the real
 * GET/POST response. `mcp-handler` does not attach ACAO on streamable HTTP,
 * so we own the full CORS surface here:
 * - The app's own web origins only (never `*`) so `Authorization` can be sent
 * - Same allow-list on preflight and actual responses
 * - `mcp-protocol-version` and `last-event-id` are allow-listed because the
 *   SDK reads them off post-initialize and SSE-resume requests; without them
 *   browser preflight fails and the client stalls after `initialize`.
 */
const CORS_ALLOWED_HEADERS =
    "authorization,content-type,accept,mcp-session-id,mcp-protocol-version,last-event-id";
const CORS_ALLOWED_METHODS = "POST, GET, DELETE, OPTIONS";
const CORS_EXPOSED_HEADERS = "mcp-session-id, mcp-protocol-version";
const CORS_MAX_AGE = "86400";

function applyCorsHeaders(request: Request, headers: Headers): void {
    const origin = request.headers.get("origin") ?? "";
    headers.set("Vary", "Origin");
    if (!isTrustedCacheWebOrigin(origin)) {
        return;
    }
    headers.set("Access-Control-Allow-Origin", origin);
}

/**
 * The Streamable HTTP transport spec requires servers to validate the
 * `Origin` header on every request and answer 403 when it is present but
 * untrusted (DNS rebinding defense). Non-browser clients send no `Origin`
 * and pass through. CORS alone is not enough: it only tells browsers what
 * to block, while this rejects the request server-side.
 */
function invalidOriginResponse(request: Request): Response | null {
    const origin = request.headers.get("origin");
    if (!origin || isTrustedCacheWebOrigin(origin)) {
        return null;
    }
    log.warn("mcp request rejected: untrusted origin", { origin });
    return new Response(
        JSON.stringify({
            error: { code: -32_000, message: "Invalid origin." },
            id: null,
            jsonrpc: "2.0",
        }),
        {
            headers: {
                "Cache-Control": "private, no-store",
                "Content-Type": "application/json",
                Vary: "Origin",
            },
            status: 403,
        }
    );
}

function withCors(request: Request, response: Response): Response {
    const headers = new Headers(response.headers);
    // The MCP transport spec requires no-store on all HTTP responses.
    headers.set("Cache-Control", "private, no-store");
    headers.set("Access-Control-Expose-Headers", CORS_EXPOSED_HEADERS);
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
    const rejected = invalidOriginResponse(request);
    if (rejected) {
        return rejected;
    }
    return withCors(request, await mcpHandler(request));
}

export async function POST(request: Request): Promise<Response> {
    const rejected = invalidOriginResponse(request);
    if (rejected) {
        return rejected;
    }
    return withCors(request, await mcpHandler(request));
}

// The server runs the SDK in stateless mode and never issues session IDs, so
// there is nothing to terminate. The transport spec permits answering DELETE
// with 405 when the server does not support client-initiated termination;
// exporting it (instead of letting Next.js answer) keeps the CORS and
// no-store surface identical to GET/POST for trusted origins.
export function DELETE(request: Request): Response {
    const rejected = invalidOriginResponse(request);
    if (rejected) {
        return rejected;
    }
    return withCors(
        request,
        new Response(
            JSON.stringify({
                error: { code: -32_000, message: "Method not allowed." },
                id: null,
                jsonrpc: "2.0",
            }),
            {
                headers: { "Content-Type": "application/json" },
                status: 405,
            }
        )
    );
}
