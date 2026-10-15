import { type BuiltInLocales, localization } from "better-auth-localization";
import { DEFAULT_LOCALE } from "@/lib/common/constants";

/** App locales that better-auth-localization also ships (excluding DEFAULT → plugin default). */
const BUILT_IN_APP_LOCALES = {
    "es-ES": "es-ES",
} as const satisfies Record<string, BuiltInLocales>;
const LOCALE_COOKIE_KEY = "generaltranslation.locale";
const FALLBACK_LOCALE = "default" satisfies BuiltInLocales;

/** @internal */
function readCookieValue(header: string, key: string): string | undefined {
    const prefix = `${key}=`;
    for (const part of header.split(";")) {
        const trimmed = part.trim();
        if (!trimmed.startsWith(prefix)) {
            continue;
        }
        const raw = trimmed.slice(prefix.length);
        if (!raw) {
            return;
        }
        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }
}

/** @internal */
function isBuiltInAppLocale(
    locale: string
): locale is keyof typeof BUILT_IN_APP_LOCALES {
    return Object.hasOwn(BUILT_IN_APP_LOCALES, locale);
}

/** @internal */
function toBuiltInLocale(locale: string): BuiltInLocales {
    if (locale === DEFAULT_LOCALE) {
        return FALLBACK_LOCALE;
    }
    if (isBuiltInAppLocale(locale)) {
        return BUILT_IN_APP_LOCALES[locale];
    }
    return FALLBACK_LOCALE;
}

export function i18nPlugin() {
    return localization({
        defaultLocale: FALLBACK_LOCALE,
        fallbackLocale: FALLBACK_LOCALE,
        getLocale: (request) => {
            if (!request) {
                return FALLBACK_LOCALE;
            }
            const cookies = request.headers.get("cookie");
            if (!cookies) {
                return FALLBACK_LOCALE;
            }
            const locale = readCookieValue(cookies, LOCALE_COOKIE_KEY);
            if (!locale) {
                return FALLBACK_LOCALE;
            }
            return toBuiltInLocale(locale);
        },
    });
}
