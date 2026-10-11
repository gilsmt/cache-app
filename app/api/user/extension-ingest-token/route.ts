import { requireRouteUserId } from "@/lib/auth/session";
import { extensionTokenCorsHeaders } from "@/lib/extension/ingest/adapter";
import {
    getOrCreateExtensionIngestToken,
    rotateExtensionIngestToken,
} from "@/lib/extension/ingest/service";

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

    const token = await getOrCreateExtensionIngestToken({ userId });
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
