import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

mock.module("@/lib/collections/service", () => ({
    deleteLibraryItem: async () => undefined,
    getLibraryItem: async () => undefined,
    listCollections: async () => [],
    listLibraryItems: async () => [],
}));

mock.module("@/lib/integrations/mcp/service", () => ({
    addLibraryItem: async () => undefined,
    toMcpLibraryItem: (item: unknown) => item,
    verifyMcpAuthToken: async () => undefined,
}));

const { GET, OPTIONS, POST } = await import("./route");

const MCP_URL = "https://cachd.app/mcp";

const CORS_ORIGIN_CASES = [
    { allowed: true, origin: "https://cachd.app" },
    { allowed: true, origin: "https://www.cachd.app" },
    { allowed: true, origin: "http://localhost:3000" },
    { allowed: true, origin: "http://127.0.0.1:3000" },
    { allowed: false, origin: "https://docs.cachd.app" },
    { allowed: false, origin: "https://preview.cachd.app" },
    { allowed: false, origin: "https://anything.cachd.app" },
    { allowed: false, origin: "http://cachd.app" },
    { allowed: false, origin: "https://cachd.app.evil.com" },
];

function preflightRequest(origin: string): Request {
    return new Request(MCP_URL, {
        headers: {
            "access-control-request-headers": "authorization,mcp-session-id",
            "access-control-request-method": "POST",
            origin,
        },
        method: "OPTIONS",
    });
}

function toolListRequest(origin: string): Request {
    return new Request(MCP_URL, {
        body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
        headers: {
            accept: "application/json, text/event-stream",
            "content-type": "application/json",
            origin,
        },
        method: "POST",
    });
}

describe("MCP CORS allowlist", () => {
    test("echoes the origin only for the app's own web origins", () => {
        for (const { allowed, origin } of CORS_ORIGIN_CASES) {
            const response = OPTIONS(preflightRequest(origin));
            expect(response.status).toBe(204);
            expect(response.headers.get("access-control-allow-origin")).toBe(
                allowed ? origin : null
            );
            expect(response.headers.get("vary")).toContain("Origin");
        }
    });

    test("grants no CORS on the responses a browser would actually read", async () => {
        for (const { allowed, origin } of CORS_ORIGIN_CASES) {
            for (const response of [
                await POST(toolListRequest(origin)),
                await GET(toolListRequest(origin)),
            ]) {
                expect(
                    response.headers.get("access-control-allow-origin")
                ).toBe(allowed ? origin : null);
                expect(response.headers.get("vary")).toContain("Origin");
                await response.body?.cancel();
            }
        }
    });
});
