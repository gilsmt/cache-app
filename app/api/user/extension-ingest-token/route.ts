import { requireRouteUserId } from "@/lib/auth/session";
import { mintExtensionIngestToken } from "@/lib/integrations/extension-ingest/auth";
import { extensionTokenCorsHeaders } from "@/lib/integrations/extension-ingest/route";
import { rotateExtensionIngestToken } from "@/lib/integrations/extension-ingest/service";

export function OPTIONS(request: Request) {
    return new Response(null, {
        headers: extensionTokenCorsHeaders(request),
        status: 204,
    });
}

export async function GET(request: Request) {
    const cors = extensionTokenCorsHeaders(request);
    const session = await requireRouteUserId({
        unauthorizedResponseHeaders: cors,
    });
    if (session instanceof Response) {
        return session;
    }
    const { userId } = session;

    const token = mintExtensionIngestToken(userId);
    // The ingest token is a bearer secret, so it must never be cached.
    const responseHeaders = new Headers(cors);
    responseHeaders.set("Cache-Control", "private, no-store");
    return Response.json({ token }, { headers: responseHeaders });
}

export async function POST(request: Request) {
    const cors = extensionTokenCorsHeaders(request);
    const session = await requireRouteUserId({
        unauthorizedResponseHeaders: cors,
    });
    if (session instanceof Response) {
        return session;
    }
    const { userId } = session;

    const token = await rotateExtensionIngestToken({ userId });
    // The ingest token is a bearer secret, so it must never be cached.
    const responseHeaders = new Headers(cors);
    responseHeaders.set("Cache-Control", "private, no-store");
    return Response.json({ token }, { headers: responseHeaders });
}
