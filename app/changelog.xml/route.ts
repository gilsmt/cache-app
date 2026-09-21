import { BASE_URL } from "@/lib/common/constants";

const revalidate = 3600;

interface Release {
    body: string;
    html_url: string;
    id: number;
    name: string;
    prerelease: boolean;
    published_at: string;
    tag_name: string;
}

function escapeXml(str: string) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export async function GET() {
    try {
        const response = await fetch(
            "https://api.github.com/repos/gilsmt/cache-app/releases",
            {
                headers: { Accept: "application/vnd.github+json" },
                next: { revalidate },
            }
        );
        const releases: Release[] = await response.json();

        const items = (releases || [])
            .filter((r) => !r.prerelease)
            .map(
                (r) => `
        <item>
          <title>${escapeXml(r.name || r.tag_name)}</title>
          <link>${r.html_url}</link>
          <guid isPermaLink="true">${r.html_url}</guid>
          <pubDate>${new Date(r.published_at).toUTCString()}</pubDate>
          <description><![CDATA[${r.body || ""}]]></description>
        </item>
      `
            )
            .join("");

        const xml = `<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0">
        <channel>
          <title>Cache Changelog</title>
          <link>${BASE_URL}/changelog</link>
          <description>Latest changes, fixes and updates in Cache.</description>
          <language>en-us</language>
          ${items}
        </channel>
      </rss>`;

        return new Response(xml, {
            headers: {
                "Cache-Control": `public, s-maxage=${revalidate}, stale-while-revalidate=${revalidate}`,
                "Content-Type": "application/rss+xml; charset=utf-8",
            },
            status: 200,
        });
    } catch {
        return new Response("Service Unavailable", { status: 503 });
    }
}
