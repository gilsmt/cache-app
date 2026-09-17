import * as z from "zod";
import { createLogger } from "@/lib/common/logs/console/logger";
import { extensionClipBodySchema } from "@/lib/integrations/extension-clip/schema";
import {
    clipPageFromExtension,
    ExtensionClipError,
} from "@/lib/integrations/extension-clip/service";
import {
    authenticateExtensionIngest,
    extensionIngestCorsHeaders,
} from "@/lib/integrations/extension-ingest/route";
import { scheduleSmartCollections } from "@/lib/intelligence/collections/schedule";

const log = createLogger("api:integrations:extension:clip");

export function OPTIONS(request: Request) {
    return new Response(null, {
        headers: extensionIngestCorsHeaders(request),
        status: 204,
    });
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

    const parsed = extensionClipBodySchema.safeParse(json);
    if (!parsed.success) {
        return Response.json(
            { error: z.treeifyError(parsed.error) },
            { headers: cors, status: 400 }
        );
    }

    try {
        const result = await clipPageFromExtension({
            body: parsed.data,
            userId,
        });
        const { smartCollectionItemIds, ...response } = result;
        if (smartCollectionItemIds.length > 0) {
            scheduleSmartCollections(userId, smartCollectionItemIds);
        }

        return Response.json({ ok: true, ...response }, { headers: cors });
    } catch (error) {
        if (ExtensionClipError.isInstance(error)) {
            const status =
                error.data.code === "invalid_url" ||
                error.data.code === "invalid_collections"
                    ? 400
                    : 500;
            return Response.json(
                { error: error.data.message },
                { headers: cors, status }
            );
        }

        log.error("Extension clip failed", { error, userId });
        return Response.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to clip page",
            },
            { headers: cors, status: 500 }
        );
    }
}
