import { requireRouteUserId } from "@/lib/auth/session";
import { generateMcpSetupPrompt, rotateMcpTokens } from "@/lib/mcp/service";

const UNAUTHORIZED_RESPONSE_HEADERS = {
    "Cache-Control": "no-store, private",
};

/**
 * Mint and revoke surface for MCP bearer tokens.
 *
 * POST generates an MCP setup prompt for the authenticated user. The response
 * carries two fields so both copy-paste and programmatic configuration clients
 * can consume the same payload:
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
export async function POST(): Promise<Response> {
    const auth = await requireRouteUserId({
        unauthorizedResponseHeaders: UNAUTHORIZED_RESPONSE_HEADERS,
    });
    if (auth instanceof Response) {
        return auth;
    }

    const { endpoint, prompt, token } = await generateMcpSetupPrompt(
        auth.userId
    );

    return Response.json(
        { endpoint, prompt, token },
        {
            headers: { "Cache-Control": "no-store, private, max-age=0" },
        }
    );
}

/**
 * Revokes every MCP token minted for the authenticated user so far. Existing
 * MCP clients stop working until they are reconfigured with a new token.
 */
export async function DELETE(): Promise<Response> {
    const auth = await requireRouteUserId({
        unauthorizedResponseHeaders: UNAUTHORIZED_RESPONSE_HEADERS,
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
