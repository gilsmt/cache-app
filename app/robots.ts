import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/common/constants";

const DISALLOWED_PATHS = [
    "/mcp",
    "/api/",
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
            disallow: DISALLOWED_PATHS,
            userAgent: "*",
        },
        sitemap: `${BASE_URL}/sitemap.xml`,
    };
}
