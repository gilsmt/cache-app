import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { generateMcpSetupPrompt, rotateMcpTokens } from "@/lib/mcp/service";

async function getSessionUserId(): Promise<string | null> {
    const session = await auth.api.getSession({
        headers: await headers(),
    });
    return session?.user?.id ?? null;
}

function unauthorizedResponse(): Response {
    return Response.json(
        { error: "Unauthorized" },
        {
            headers: { "Cache-Control": "no-store, private" },
            status: 401,
        }
    );
}

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
    const userId = await getSessionUserId();
    if (!userId) {
        return unauthorizedResponse();
    }

    const { endpoint, prompt, token } = await generateMcpSetupPrompt(userId);

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
    const userId = await getSessionUserId();
    if (!userId) {
        return unauthorizedResponse();
    }

    await rotateMcpTokens(userId);

    return new Response(null, {
        headers: { "Cache-Control": "no-store, private" },
        status: 204,
    });
}
