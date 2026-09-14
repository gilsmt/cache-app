import { getLocales } from "gt-next";
import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/common/constants";

const DISALLOWED_TOP_LEVEL_PATHS = ["/mcp", "/api/"];

const DISALLOWED_PATHS = [
    "/library",
    "/automations",
    "/recently-deleted",
    "/inbox",
    "/signin",
    "/logout",
    "/c/",
];

export default function robots(): MetadataRoute.Robots {
    // Preview and development deployments must never be indexed. Only the
    // production deployment is crawlable.
    if (process.env.VERCEL_ENV !== "production") {
        return {
            rules: {
                disallow: "/",
                userAgent: "*",
            },
        };
    }

    return {
        rules: {
            allow: "/",
            disallow: [
                ...DISALLOWED_TOP_LEVEL_PATHS,
                ...DISALLOWED_PATHS,
                ...getLocales().flatMap((locale) =>
                    DISALLOWED_PATHS.map((path) => `/${locale}${path}`)
                ),
            ],
            userAgent: "*",
        },
        sitemap: `${BASE_URL}/sitemap.xml`,
    };
}
