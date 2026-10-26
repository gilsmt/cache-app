import { serverEnv } from "@/env/server";
import { BASE_URL, CACHE_EXTENSION_ID } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { isExactWebOrigin } from "@/lib/common/security/origins";
import { tryParseUrl } from "@/lib/common/url";

const log = createLogger("auth:trusted-origins");

const CHROME_EXTENSION_ID_PATTERN = /^[a-p]{32}$/u;

export const BASE_AUTH_URL = serverEnv.BETTER_AUTH_URL ?? BASE_URL;

function isChromeExtensionId(value: string): boolean {
    return CHROME_EXTENSION_ID_PATTERN.test(value);
}

/**
 * better-auth matches non-http(s) origins with startsWith. Reject short or
 * wildcard values so a mis-set env cannot trust every chrome-extension origin.
 */
function isExactTrustedOrigin(origin: string): boolean {
    if (isExactWebOrigin(origin)) {
        return true;
    }

    const parsed = tryParseUrl(origin);
    if (parsed?.protocol !== "chrome-extension:") {
        return false;
    }
    return (
        (parsed.pathname === "" || parsed.pathname === "/") &&
        parsed.search === "" &&
        parsed.hash === "" &&
        isChromeExtensionId(parsed.hostname)
    );
}

function resolveChromeExtensionId(): string {
    const override = serverEnv.CACHE_EXTENSION_ID?.trim();
    if (!override) {
        return CACHE_EXTENSION_ID;
    }
    if (isChromeExtensionId(override)) {
        return override;
    }
    log.warn("Ignoring invalid CACHE_EXTENSION_ID override", {
        length: override.length,
    });
    return CACHE_EXTENSION_ID;
}

function parseEnvTrustedOrigins(rawOrigins: string | undefined): string[] {
    const trustedOrigins: string[] = [];
    for (const rawOrigin of (rawOrigins ?? "").split(",")) {
        const origin = rawOrigin.trim();
        if (origin.length === 0) {
            continue;
        }
        if (!isExactTrustedOrigin(origin)) {
            log.warn("Ignoring invalid TRUSTED_ORIGINS entry", { origin });
            continue;
        }
        trustedOrigins.push(origin);
    }
    return trustedOrigins;
}

/** Vercel preview traffic can use the deployment URL or the branch alias. */
function getVercelPreviewOrigins(): string[] {
    if (serverEnv.VERCEL_ENV !== "preview") {
        return [];
    }

    const origins: string[] = [];
    for (const host of [serverEnv.VERCEL_URL, serverEnv.VERCEL_BRANCH_URL]) {
        if (!host) {
            continue;
        }

        const origin = `https://${host}`;
        if (!isExactTrustedOrigin(origin)) {
            log.warn("Ignoring invalid Vercel preview origin", { origin });
            continue;
        }
        origins.push(origin);
    }
    return origins;
}

const extensionId = resolveChromeExtensionId();

const envTrustedOrigins = parseEnvTrustedOrigins(serverEnv.TRUSTED_ORIGINS);
const VERCEL_PREVIEW_ORIGINS = getVercelPreviewOrigins();

export const trustedOrigins = [
    BASE_AUTH_URL,
    `chrome-extension://${extensionId}`,
    ...envTrustedOrigins,
    ...VERCEL_PREVIEW_ORIGINS,
];
