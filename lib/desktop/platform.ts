import type { DesktopPlatform } from "@/lib/desktop/constants";

const MOBILE_UA_RE = /Android|iPhone|iPad|iPod|Mobile/i;
const WINDOWS_UA_RE = /Windows/i;
const MACOS_UA_RE = /Mac OS X|Macintosh/i;
const LINUX_UA_RE = /Linux|X11|CrOS/i;

/**
 * Best-effort desktop OS from a user-agent string.
 * Returns null on mobile or when the OS cannot be classified.
 * When `userAgent` is omitted, uses `navigator.userAgent` in the browser.
 */
export function detectDesktopPlatform(
    userAgent?: string | null
): DesktopPlatform | null {
    let resolvedUserAgent: string | null;
    if (userAgent !== undefined) {
        resolvedUserAgent = userAgent;
    } else if (typeof navigator === "undefined") {
        resolvedUserAgent = null;
    } else {
        resolvedUserAgent = navigator.userAgent;
    }

    if (
        typeof resolvedUserAgent !== "string" ||
        resolvedUserAgent.length === 0
    ) {
        return null;
    }

    if (MOBILE_UA_RE.test(resolvedUserAgent)) {
        return null;
    }

    if (WINDOWS_UA_RE.test(resolvedUserAgent)) {
        return "windows";
    }

    if (MACOS_UA_RE.test(resolvedUserAgent)) {
        return "macos";
    }

    if (LINUX_UA_RE.test(resolvedUserAgent)) {
        return "linux";
    }

    return null;
}

let pakeDesktopAppResult: boolean | undefined;

/**
 * Checks whether the current page is running inside the Pake-packaged
 * desktop app (Tauri v1/v2 webview).  Returns `false` for all regular
 * browsers and SSR.
 *
 * Detection relies on Tauri globals that do not exist in standard
 * browser environments:
 *   - `window.__TAURI__`           (Tauri v1)
 *   - `window.__TAURI_INTERNALS__` (Tauri v2)
 *
 * The result is cached after the first call because the runtime
 * environment does not change during a session.
 */
export function isDesktopApp(): boolean {
    if (pakeDesktopAppResult !== undefined) {
        return pakeDesktopAppResult;
    }

    if (typeof window === "undefined") {
        pakeDesktopAppResult = false;
        return false;
    }

    const hasTauriGlobal =
        (window as unknown as Record<string, unknown>).__TAURI__ !==
            undefined ||
        (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !==
            undefined;

    pakeDesktopAppResult = hasTauriGlobal;
    return hasTauriGlobal;
}
