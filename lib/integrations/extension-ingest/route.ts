import "server-only";

import * as z from "zod";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    isChromeExtensionOrigin,
    isTrustedCacheWebOrigin,
} from "@/lib/integrations/extension-ingest/origins";
import { resolveExtensionIngestUserId } from "@/lib/integrations/extension-ingest/service";

const log = createLogger("integrations:extension-ingest");

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

const INGEST_CORS_HEADERS = {
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
} as const;

const TOKEN_CORS_HEADERS = {
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
} as const;

function trustedOriginForRequest(
    request: Request,
    config: { allowChromeExtensionOrigin: boolean }
): string | null {
    const origin = request.headers.get("origin")?.trim();
    if (!origin) {
        return null;
    }
    if (isTrustedCacheWebOrigin(origin)) {
        return origin;
    }
    if (config.allowChromeExtensionOrigin && isChromeExtensionOrigin(origin)) {
        return origin;
    }
    return null;
}

function corsHeadersForOrigin(
    headers: Record<string, string>,
    allowOrigin: string | null,
    config: { allowCredentials: boolean }
): HeadersInit {
    return {
        ...headers,
        ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
        ...(allowOrigin && config.allowCredentials
            ? { "Access-Control-Allow-Credentials": "true" }
            : {}),
        Vary: "Origin",
    };
}

/**
 * CORS headers for the extension ingest POST endpoints. The extension
 * posts saved items with an `Authorization: Bearer` header, so these are
 * not credentialed.
 */
export function extensionIngestCorsHeaders(request: Request): HeadersInit {
    return corsHeadersForOrigin(
        INGEST_CORS_HEADERS,
        trustedOriginForRequest(request, { allowChromeExtensionOrigin: true }),
        { allowCredentials: false }
    );
}

/**
 * CORS headers for endpoints that rely on cookie/session credentials
 * (e.g. the extension ingest token endpoint). Credentialed CORS cannot use a
 * wildcard origin, so untrusted origins receive no allow-origin header.
 */
export function extensionTokenCorsHeaders(request: Request): HeadersInit {
    return corsHeadersForOrigin(
        TOKEN_CORS_HEADERS,
        trustedOriginForRequest(request, { allowChromeExtensionOrigin: false }),
        { allowCredentials: true }
    );
}

// ---------------------------------------------------------------------------
// Bearer auth
// ---------------------------------------------------------------------------

function parseBearerToken(request: Request): string | null {
    const raw = request.headers.get("authorization");
    if (!raw?.startsWith("Bearer ")) {
        return null;
    }
    const token = raw.slice("Bearer ".length).trim();
    return token.length > 0 ? token : null;
}

/**
 * Authenticates an extension ingest request by Bearer token.
 *
 * The CORS headers are computed once and attached to every response,
 * including the failure paths, so the browser can read the error body.
 *
 * @returns The CORS headers and resolved user id, or a 401 Response if
 *   authentication fails.
 */
export async function authenticateExtensionIngest(
    request: Request
): Promise<{ cors: HeadersInit; userId: string } | Response> {
    const cors = extensionIngestCorsHeaders(request);
    const bearer = parseBearerToken(request);
    if (!bearer) {
        return Response.json(
            { error: "Missing Authorization: Bearer <extension ingest token>" },
            { headers: cors, status: 401 }
        );
    }

    const userId = await resolveExtensionIngestUserId(bearer);
    if (!userId) {
        return Response.json(
            { error: "Unauthorized" },
            { headers: cors, status: 401 }
        );
    }

    return { cors, userId };
}

// ---------------------------------------------------------------------------
// Generic import route adapter
// ---------------------------------------------------------------------------

interface ExtensionIngestImportResult {
    smartCollectionItemIds: string[];
}

interface ExtensionIngestImportConfig<
    TBody,
    TImportResult extends ExtensionIngestImportResult,
> {
    bodySchema: z.ZodType<TBody>;
    genericError: string;
    importFn: (args: { body: TBody; userId: string }) => Promise<TImportResult>;
    onSmartCollectionItemIds: (userId: string, itemIds: string[]) => void;
    response?: (args: {
        body: TBody;
        result: Omit<TImportResult, "smartCollectionItemIds">;
    }) => Record<string, unknown>;
}

/**
 * Route adapter for the per-provider extension ingest endpoints.
 *
 * Pipeline:
 * 1. Authenticate via `Authorization: Bearer <token>` (returns CORS-aware
 *    401 on failure).
 * 2. Parse the request body and validate it against the provider-specific
 *    schema.
 * 3. Call the provider-specific import service.
 * 4. Schedule the request-scoped auto-tagging side-effect.
 * 5. Return a CORS-aware JSON response.
 *
 * The provider-specific `importFn` is a pure service (e.g. `importTiktokSaved`)
 * and has no knowledge of HTTP.
 */
export async function runExtensionIngestImport<
    TBody,
    TImportResult extends ExtensionIngestImportResult,
>(
    request: Request,
    config: ExtensionIngestImportConfig<TBody, TImportResult>
): Promise<Response> {
    const authResult = await authenticateExtensionIngest(request);
    if (authResult instanceof Response) {
        return authResult;
    }
    const { cors, userId } = authResult;

    let json: unknown;
    try {
        json = await request.json();
    } catch {
        return Response.json(
            { error: "Invalid JSON" },
            { headers: cors, status: 400 }
        );
    }

    const parsed = config.bodySchema.safeParse(json);
    if (!parsed.success) {
        return Response.json(
            { error: z.treeifyError(parsed.error) },
            { headers: cors, status: 400 }
        );
    }

    try {
        const result = await config.importFn({
            body: parsed.data,
            userId,
        });
        const { smartCollectionItemIds, ...response } = result;
        config.onSmartCollectionItemIds(userId, smartCollectionItemIds);

        return Response.json(
            {
                ok: true,
                ...(config.response
                    ? config.response({ body: parsed.data, result: response })
                    : response),
            },
            { headers: cors }
        );
    } catch (error) {
        log.error("Extension ingest import failed", {
            error,
            userId,
        });
        return Response.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : config.genericError,
            },
            { headers: cors, status: 500 }
        );
    }
}
