import { BASE_URL } from "@/lib/common/constants";

export function GET() {
    return new Response(null, {
        headers: {
            "Cache-Control": "public, max-age=86400",
            Location: `${BASE_URL}/.well-known/security.txt`,
        },
        status: 301,
    });
}
