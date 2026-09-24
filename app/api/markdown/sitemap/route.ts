import sitemap from "@/app/sitemap";
import { MIME_TYPES } from "@/lib/common/constants";

const MARKDOWN_SITEMAP = [
    "# Cache sitemap",
    "",
    "Public pages for Cache:",
    "",
    ...Array.from(
        new Set(
            sitemap().flatMap(({ url, alternates }) => [
                url,
                ...Object.values(alternates?.languages ?? {}),
            ])
        )
    ).map((url) => `- <${url}>`),
    "",
].join("\n");

export function GET(): Response {
    return new Response(MARKDOWN_SITEMAP, {
        headers: {
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
            "Content-Type": `${MIME_TYPES.markdown}; charset=utf-8`,
        },
    });
}
