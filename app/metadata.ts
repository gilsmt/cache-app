import { getDefaultLocale, getLocales, resolveCanonicalLocale } from "gt-next";
import type { Metadata } from "next";
import { BASE_URL } from "@/lib/common/constants";

interface BuildPageMetadataArgs {
    description: string;
    keywords?: string[];
    locale?: string;
    ogImage?: string;
    ogType?: "website" | "article";
    path: `/${string}`;
    title: string | { absolute: string };
}

export const DEFAULT_OG_IMAGE = `${BASE_URL}/opengraph-image.png`;
export const DEFAULT_OG_IMAGE_ALT =
    "The word 'Cache' in bold abstract lettering on a warm off-white background";

/**
 * Builds a standard Metadata object with alternates, Open Graph, and Twitter
 * card fields filled in. Callers provide page-specific title, description,
 * and optional keywords; common wiring (canonical URLs, card type, etc.) is
 * applied automatically.
 *
 * A default OG image is included so every page has a social preview. Callers
 * can override with a page-specific image via `ogImage`.
 */
export function buildPageMetadata({
    description,
    keywords,
    locale,
    ogImage = DEFAULT_OG_IMAGE,
    ogType = "website",
    path,
    title,
}: BuildPageMetadataArgs): Metadata {
    const defaultLocale = getDefaultLocale();
    const resolvedLocale = locale ?? defaultLocale;
    const url = getLocalizedUrl(resolvedLocale, path);

    return {
        alternates: buildLocaleAlternates(path, locale),
        description,
        keywords,
        metadataBase: new URL(BASE_URL),
        openGraph: {
            description,
            images: [
                {
                    alt: DEFAULT_OG_IMAGE_ALT,
                    height: 630,
                    url: ogImage,
                    width: 1200,
                },
            ],
            locale: toOpenGraphLocale(resolvedLocale),
            siteName: "Cache App",
            title,
            type: ogType,
            url,
        },
        title,
        twitter: {
            card: "summary_large_image",
            description,
            images: [
                {
                    alt: DEFAULT_OG_IMAGE_ALT,
                    height: 630,
                    url: ogImage,
                    width: 1200,
                },
            ],
            title,
        },
    };
}

/**
 * Open Graph requires `language_TERRITORY` (e.g. `en_US`) while the app
 * uses BCP-47 (`en-US`), so the separator must be converted.
 */
export function toOpenGraphLocale(locale: string) {
    return locale.replaceAll("-", "_");
}

function getLocalizedUrl(locale: string, path: `/${string}`) {
    return path === "/"
        ? `${BASE_URL}/${locale}`
        : `${BASE_URL}/${locale}${path}`;
}

export function buildLocaleAlternates(
    path: `/${string}`,
    locale?: string
): NonNullable<Metadata["alternates"]> {
    const defaultLocale = getDefaultLocale();
    const resolvedLocale = locale ?? defaultLocale;
    const languages = Object.fromEntries(
        getLocales().map((loc) => [
            resolveCanonicalLocale(loc),
            getLocalizedUrl(loc, path),
        ])
    );
    const canonical = getLocalizedUrl(resolvedLocale, path);

    return {
        canonical,
        languages: {
            ...languages,
            "x-default": getLocalizedUrl(defaultLocale, path),
        },
    };
}
