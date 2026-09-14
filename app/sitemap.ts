import { getDefaultLocale, getLocales, resolveCanonicalLocale } from "gt-next";
import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/common/constants";
import { normalizeURL } from "@/lib/common/url";

interface SitemapRoute {
    changeFrequency?: MetadataRoute.Sitemap[number]["changeFrequency"];
    path: `/${string}`;
    priority: number;
}

/**
 * Public static routes that do not require authentication.
 * Authenticated-only routes (e.g. /library) are intentionally excluded
 * because they redirect anonymous users and should not be indexed.
 * Redirect-only paths (/changelog, /security → docs.cachd.app) are also
 * excluded to avoid sitemap redirect chains.
 */
const PUBLIC_STATIC_ROUTES = [
    { changeFrequency: "weekly", path: "/", priority: 1 },
    { changeFrequency: "monthly", path: "/legal", priority: 0.7 },
    {
        changeFrequency: "yearly",
        path: "/legal/terms-of-service",
        priority: 0.5,
    },
    {
        changeFrequency: "yearly",
        path: "/legal/privacy-policy",
        priority: 0.5,
    },
    { changeFrequency: "yearly", path: "/legal/dpa", priority: 0.3 },
] satisfies SitemapRoute[];

function getLocalizedUrl(locale: string, path: SitemapRoute["path"]) {
    return normalizeURL(
        path === "/" ? `${BASE_URL}/${locale}` : `${BASE_URL}/${locale}${path}`
    );
}

export default function sitemap(): MetadataRoute.Sitemap {
    const locales = getLocales();
    const defaultLocale = getDefaultLocale();

    return PUBLIC_STATIC_ROUTES.map((entry) => ({
        alternates: {
            languages: {
                ...Object.fromEntries(
                    locales.map((locale) => [
                        resolveCanonicalLocale(locale),
                        getLocalizedUrl(locale, entry.path),
                    ])
                ),
                "x-default": getLocalizedUrl(defaultLocale, entry.path),
            },
        },
        changeFrequency: entry.changeFrequency ?? "weekly",
        priority: entry.priority,
        url: getLocalizedUrl(defaultLocale, entry.path),
    }));
}
