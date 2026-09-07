import { APPLE_DOMAIN_ASSOCIATION } from "@/lib/common/constants";

export function GET() {
    return new Response(APPLE_DOMAIN_ASSOCIATION, {
        headers: {
            "Cache-Control": "public, max-age=86400",
        },
        status: 200,
    });
}
