import { headers } from "next/headers";
import { auth } from "@/lib/auth/server";
import { generateMcpSetupPrompt } from "@/lib/integrations/mcp/service";

/**
 * Generates an MCP setup prompt for the authenticated user.
 *
 * The response carries two fields so both copy-paste and programmatic
 * configuration clients can consume the same payload:
 *
 * - `prompt`: a freeform block of text (intended for a target agent's
 *   context window). The token appears inline in two places — Claude Desktop
 *   config snippet and the literal `Authorization` header — because
 *   non-JSON-aware tools (Cursor's plain-text field, etc.) parse this block.
 * - `endpoint`/`token`: easy programmatic access for clients that want to
 *   build their own config without parsing prompt text.
 */
export async function POST(): Promise<Response> {
    const session = await auth.api.getSession({
        headers: await headers(),
    });
    const userId = session?.user?.id;

    if (!userId) {
        return Response.json(
            { error: "Unauthorized" },
            {
                headers: { "Cache-Control": "no-store, private" },
                status: 401,
            }
        );
    }

    const { endpoint, prompt, token } = await generateMcpSetupPrompt(userId);

    return Response.json(
        { endpoint, prompt, token },
        {
            headers: { "Cache-Control": "no-store, private, max-age=0" },
        }
    );
}
