import { type BuiltInLocales, localization } from "better-auth-localization";
import { DEFAULT_LOCALE, type SupportedLocale } from "@/lib/common/constants";

const LOCALE_COOKIE_KEY = "generaltranslation.locale";
const FALLBACK_LOCALE = "default" satisfies BuiltInLocales;

type NonDefaultSupportedLocale = Exclude<
    SupportedLocale,
    typeof DEFAULT_LOCALE
>;

/** Map to `default` when Better Auth should keep its original error message. */
const APP_TO_AUTH_LOCALE = {
    "es-ES": "es-ES",
} as const satisfies Record<NonDefaultSupportedLocale, BuiltInLocales>;

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
): locale is keyof typeof APP_TO_AUTH_LOCALE {
    return Object.hasOwn(APP_TO_AUTH_LOCALE, locale);
}

/** @internal */
function toBuiltInLocale(locale: string): BuiltInLocales {
    if (locale === DEFAULT_LOCALE) {
        return FALLBACK_LOCALE;
    }
    if (isBuiltInAppLocale(locale)) {
        return APP_TO_AUTH_LOCALE[locale];
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
