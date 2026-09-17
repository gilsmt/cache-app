import {
    extensionIngestCorsHeaders,
    runExtensionIngestImport,
} from "@/lib/integrations/extension-ingest/route";
import {
    importInstagramSaved,
    instagramSavedBodySchema,
} from "@/lib/integrations/instagram/service";
import { scheduleSmartCollections } from "@/lib/intelligence/collections/schedule";

export function OPTIONS(request: Request) {
    return new Response(null, {
        headers: extensionIngestCorsHeaders(request),
        status: 204,
    });
}

export function POST(request: Request) {
    return runExtensionIngestImport(request, {
        bodySchema: instagramSavedBodySchema,
        genericError: "Failed to import items from Instagram",
        importFn: ({ body, userId }) =>
            importInstagramSaved({
                items: body.items,
                userId,
            }),
        onSmartCollectionItemIds: scheduleSmartCollections,
    });
}
