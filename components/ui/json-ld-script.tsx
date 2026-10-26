// biome-ignore-all lint/security/noDangerouslySetInnerHtml: JSON-LD structured data is rendered server-side and sanitized per Next.js docs.

import "server-only";

interface JsonLdScriptProps {
    data: Record<string, unknown>;
}

export function JsonLdScript({ data }: JsonLdScriptProps) {
    return (
        <script
            dangerouslySetInnerHTML={{
                __html: JSON.stringify(data).replace(/</gu, "\\u003c"),
            }}
            type="application/ld+json"
        />
    );
}
