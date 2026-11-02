import * as z from "zod";
import { requireRouteUserId } from "@/lib/auth/session";
import { MCP_SCOPES, type McpScope } from "@/lib/session/mcp/auth";
import {
    generateMcpSetupPrompt,
    rotateMcpTokens,
} from "@/lib/session/mcp/service";

const PRIVATE_RESPONSE_HEADERS = {
    "Cache-Control": "no-store, private",
};

const MCP_PROMPT_REQUEST_MAX_BYTES = 1024;

const MCP_PROMPT_REQUEST_SCHEMA = z.strictObject({
    scopes: z
        .array(z.enum(MCP_SCOPES))
        .min(1)
        .max(MCP_SCOPES.length)
        .refine((scopes) => new Set(scopes).size === scopes.length)
        .default([...MCP_SCOPES]),
});

/**
 * Mint and revoke surface for MCP bearer tokens.
 *
 * POST generates an MCP setup prompt for the authenticated user. An optional
 * `scopes` array narrows the token; an empty body keeps the existing full-access
 * behavior. The response carries fields for copy-paste and programmatic clients:
 *
 * - `prompt`: a freeform block of text (intended for a target agent's
 *   context window). The token appears inline in two places — Claude Desktop
 *   config snippet and the literal `Authorization` header — because
 *   non-JSON-aware tools (Cursor's plain-text field, etc.) parse this block.
 * - `endpoint`/`token`: easy programmatic access for clients that want to
 *   build their own config without parsing prompt text.
 *
 * DELETE revokes every MCP token minted for the user so far. Call it when a
 * token leaks, then POST again to configure the client with a fresh one.
 */
export async function POST(request: Request): Promise<Response> {
    const auth = await requireRouteUserId({
        unauthorizedResponseHeaders: PRIVATE_RESPONSE_HEADERS,
    });
    if (auth instanceof Response) {
        return auth;
    }

    const requestedScopes = await readRequestedScopes(request);
    if ("response" in requestedScopes) {
        return requestedScopes.response;
    }

    const { endpoint, prompt, token } = await generateMcpSetupPrompt(
        auth.userId,
        requestedScopes.scopes
    );

    return Response.json(
        { endpoint, prompt, token },
        {
            headers: { "Cache-Control": "no-store, private, max-age=0" },
        }
    );
}

async function readRequestedScopes(
    request: Request
): Promise<{ scopes: readonly McpScope[] } | { response: Response }> {
    const reader = request.body?.getReader();
    if (!reader) {
        return { scopes: MCP_SCOPES };
    }

    const decoder = new TextDecoder();
    let bodyText = "";
    let bodyByteLength = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            bodyText += decoder.decode();
            break;
        }
        bodyByteLength += value.byteLength;
        if (bodyByteLength > MCP_PROMPT_REQUEST_MAX_BYTES) {
            await reader.cancel();
            return {
                response: Response.json(
                    {
                        error: `Request body exceeds ${MCP_PROMPT_REQUEST_MAX_BYTES} bytes.`,
                    },
                    { headers: PRIVATE_RESPONSE_HEADERS, status: 413 }
                ),
            };
        }
        bodyText += decoder.decode(value, { stream: true });
    }

    if (!bodyText.trim()) {
        return { scopes: MCP_SCOPES };
    }

    let body: unknown;
    try {
        body = JSON.parse(bodyText);
    } catch (error) {
        if (!(error instanceof SyntaxError)) {
            throw error;
        }
        return {
            response: Response.json(
                { error: "Request body must be valid JSON." },
                { headers: PRIVATE_RESPONSE_HEADERS, status: 400 }
            ),
        };
    }

    const parsed = MCP_PROMPT_REQUEST_SCHEMA.safeParse(body);
    if (!parsed.success) {
        return {
            response: Response.json(
                {
                    error: `scopes must contain one or more unique values from: ${MCP_SCOPES.join(", ")}.`,
                },
                { headers: PRIVATE_RESPONSE_HEADERS, status: 400 }
            ),
        };
    }

    return { scopes: parsed.data.scopes };
}

/**
 * Revokes every MCP token minted for the authenticated user so far. Existing
 * MCP clients stop working until they are reconfigured with a new token.
 */
export async function DELETE(): Promise<Response> {
    const auth = await requireRouteUserId({
        unauthorizedResponseHeaders: PRIVATE_RESPONSE_HEADERS,
    });
    if (auth instanceof Response) {
        return auth;
    }

    await rotateMcpTokens(auth.userId);

    return new Response(null, {
        headers: { "Cache-Control": "no-store, private" },
        status: 204,
    });
}
