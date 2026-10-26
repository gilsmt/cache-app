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
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;")
        .replace(/"/gu, "&quot;")
        .replace(/'/gu, "&apos;");
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

        const itemEntries: string[] = [];
        for (const release of releases || []) {
            if (release.prerelease) {
                continue;
            }
            itemEntries.push(`
        <item>
          <title>${escapeXml(release.name || release.tag_name)}</title>
          <link>${release.html_url}</link>
          <guid isPermaLink="true">${release.html_url}</guid>
          <pubDate>${new Date(release.published_at).toUTCString()}</pubDate>
          <description>${escapeXml(release.body || "")}</description>
        </item>
      `);
        }
        const items = itemEntries.join("");

        const xml = `<?xml version="1.0" encoding="UTF-8" ?>
      <rss version="2.0">
        <channel>
          <title>Cache App Changelog</title>
          <link>${BASE_URL}/changelog</link>
          <description>Latest changes, fixes and updates in Cache App.</description>
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
