/**
 * RFC9728 Protected Resource Metadata for the MCP endpoint.
 *
 * This server does not run an OAuth authorization server: clients authenticate
 * with out-of-band bearer tokens minted at `/mcp/prompt` (see
 * `generateMcpSetupPrompt`). This document exists so the `resource_metadata`
 * URL advertised in `WWW-Authenticate` challenges resolves to a truthful
 * statement instead of a 404. It deliberately lists no
 * `authorization_servers` — there is no server to direct an OAuth client to.
 */

export function OPTIONS(): Response {
    return new Response(null, {
        headers: {
            "Access-Control-Allow-Headers": "content-type",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Max-Age": "86400",
        },
        status: 204,
    });
}

export function GET(request: Request): Response {
    const resource = new URL("/mcp", request.url).toString();
    return Response.json(
        { resource },
        {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600",
            },
        }
    );
}
