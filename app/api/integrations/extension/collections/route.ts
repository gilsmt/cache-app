import * as z from "zod";
import { LibraryCollectionError } from "@/lib/collections/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import { extensionCreateCollectionBodySchema } from "@/lib/integrations/extension-clip/schema";
import {
    createExtensionCollection,
    listExtensionCollections,
} from "@/lib/integrations/extension-clip/service";
import {
    authenticateExtensionIngest,
    extensionIngestCorsHeaders,
} from "@/lib/integrations/extension-ingest/route";

const log = createLogger("api:integrations:extension:collections");

export function OPTIONS(request: Request) {
    return new Response(null, {
        headers: extensionIngestCorsHeaders(request),
        status: 204,
    });
}

export async function GET(request: Request) {
    const authResult = await authenticateExtensionIngest(request);
    if (authResult instanceof Response) {
        return authResult;
    }
    const { cors, userId } = authResult;

    // Collection lists are user-specific, so no shared cache may store them.
    const responseHeaders = new Headers(cors);
    responseHeaders.set("Cache-Control", "private, no-store");

    try {
        const result = await listExtensionCollections({ userId });
        return Response.json(
            { ok: true, ...result },
            {
                headers: responseHeaders,
            }
        );
    } catch (error) {
        log.error("List extension collections failed", { error, userId });
        return Response.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to list collections",
            },
            { headers: responseHeaders, status: 500 }
        );
    }
}

export async function POST(request: Request) {
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

    const parsed = extensionCreateCollectionBodySchema.safeParse(json);
    if (!parsed.success) {
        return Response.json(
            { error: z.treeifyError(parsed.error) },
            { headers: cors, status: 400 }
        );
    }

    try {
        const result = await createExtensionCollection({
            description: parsed.data.description,
            name: parsed.data.name,
            userId,
        });
        return Response.json({ ok: true, ...result }, { headers: cors });
    } catch (error) {
        if (
            LibraryCollectionError.isInstance(error) &&
            error.data.code === "duplicate_name"
        ) {
            return Response.json(
                { error: error.data.message },
                { headers: cors, status: 409 }
            );
        }

        log.error("Create extension collection failed", { error, userId });
        return Response.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to create collection",
            },
            { headers: cors, status: 500 }
        );
    }
}
