"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useEffect, useSyncExternalStore } from "react";
import { getOwnerDocument, getOwnerWindow } from "@/lib/common/dom";
import type { Theme } from "@/lib/common/theme";
import {
    isTheme,
    THEME_MEDIA_QUERY,
    THEME_STORAGE_KEY,
} from "@/lib/common/theme";

export type { Theme } from "@/lib/common/theme";

interface ThemeSnapshot {
    systemDark: boolean;
    theme: Theme;
}

const DEFAULT_THEME_SNAPSHOT: ThemeSnapshot = {
    systemDark: false,
    theme: "system",
};
const THEME_COLOR_META_NAME = "theme-color";
const DYNAMIC_THEME_COLOR_SELECTOR = `meta[name="${THEME_COLOR_META_NAME}"][data-dynamic-theme-color="true"]`;

// The store is the sole writer of theme state on the DOM. Application points,
// in timing order: module init below (pre-hydration), ThemeSync's effect (post
// -mount, once stylesheets and layout surfaces exist), setTheme, and the
// external sync handlers.
let listeners: Array<() => void> = [];
let lastSnapshot: ThemeSnapshot | null = null;
let mediaQuery: MediaQueryList | null = null;
// Latest theme whose persistence failed (blocked or unavailable storage). Wins
// over storage reads so the UI still reflects the user's choice for this
// session; a cross-tab storage event clears it, proving storage works again.
let unpersistedTheme: Theme | null = null;

function emitChange() {
    for (const listener of listeners) {
        listener();
    }
}

function getMediaQuery(): MediaQueryList {
    // Lazily created: this module also evaluates during SSR, where DOM APIs
    // must never run.
    mediaQuery ??= getOwnerWindow().matchMedia(THEME_MEDIA_QUERY);
    return mediaQuery;
}

function getSystemDark() {
    return getMediaQuery().matches;
}

function getStored(): Theme {
    if (unpersistedTheme) {
        return unpersistedTheme;
    }
    // Accessing localStorage itself throws SecurityError when storage is
    // blocked, so the guard and the read share one try/catch.
    try {
        const raw = getOwnerWindow().localStorage.getItem(THEME_STORAGE_KEY);
        if (isTheme(raw)) {
            return raw;
        }
    } catch {
        return DEFAULT_THEME_SNAPSHOT.theme;
    }
    return DEFAULT_THEME_SNAPSHOT.theme;
}

function normalizeThemeColor(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    if (!trimmed) {
        return null;
    }
    const normalized = trimmed.toLowerCase();
    if (
        normalized === "transparent" ||
        normalized === "rgba(0, 0, 0, 0)" ||
        normalized === "rgba(0 0 0 / 0)"
    ) {
        return null;
    }
    return trimmed;
}

function resolveBrowserChromeSurface(): HTMLElement {
    const ownerDocument = getOwnerDocument();
    return (
        ownerDocument.querySelector<HTMLElement>(
            "main[data-slot='sidebar-inset']"
        ) ??
        ownerDocument.querySelector<HTMLElement>(
            "[data-slot='sidebar-inner']"
        ) ??
        ownerDocument.body
    );
}

function ensureThemeColorMetaTag(): HTMLMetaElement {
    const ownerDocument = getOwnerDocument();
    let element = ownerDocument.querySelector<HTMLMetaElement>(
        DYNAMIC_THEME_COLOR_SELECTOR
    );
    if (element) {
        return element;
    }
    element = ownerDocument.createElement("meta");
    element.name = THEME_COLOR_META_NAME;
    element.setAttribute("data-dynamic-theme-color", "true");
    ownerDocument.head.append(element);
    return element;
}

function syncBrowserChromeTheme() {
    const ownerDocument = getOwnerDocument();
    const ownerWindow = getOwnerWindow();
    // Keep chrome backgrounds on the CSS token so theme flips re-resolve.
    // Baking a computed rgb here used to stick forever (inline > stylesheet).
    const tokenBackground = "var(--background)";
    ownerDocument.documentElement.style.backgroundColor = tokenBackground;
    ownerDocument.body.style.backgroundColor = tokenBackground;

    const surface = resolveBrowserChromeSurface();
    const surfaceColor = normalizeThemeColor(
        ownerWindow.getComputedStyle(surface).backgroundColor
    );
    const fallbackColor = normalizeThemeColor(
        ownerWindow.getComputedStyle(ownerDocument.body).backgroundColor
    );
    const themeColor = surfaceColor ?? fallbackColor;
    if (themeColor) {
        ensureThemeColorMetaTag().setAttribute("content", themeColor);
    }
}

function resolveIsDark(theme: Theme, systemDark: boolean) {
    return theme === "dark" || (theme === "system" && systemDark);
}

function applyTheme(theme: Theme, suppressTransitions = false) {
    const ownerDocument = getOwnerDocument();
    const ownerWindow = getOwnerWindow();
    const { documentElement } = ownerDocument;
    if (suppressTransitions) {
        documentElement.classList.add("no-transitions");
    }
    const isDark = resolveIsDark(
        theme,
        theme === "system" ? getSystemDark() : false
    );
    documentElement.classList.toggle("dark", isDark);
    documentElement.style.colorScheme = isDark ? "dark" : "light";
    syncBrowserChromeTheme();
    if (suppressTransitions) {
        documentElement.getBoundingClientRect();
        ownerWindow.requestAnimationFrame(() => {
            documentElement.classList.remove("no-transitions");
        });
    }
}

function getSnapshot(): ThemeSnapshot {
    const theme = getStored();
    const systemDark = theme === "system" ? getSystemDark() : false;

    if (
        lastSnapshot &&
        lastSnapshot.theme === theme &&
        lastSnapshot.systemDark === systemDark
    ) {
        return lastSnapshot;
    }
    lastSnapshot = { systemDark, theme };
    return lastSnapshot;
}

function getServerSnapshot() {
    return DEFAULT_THEME_SNAPSHOT;
}

function handleSystemSchemeChange() {
    if (getStored() === "system") {
        applyTheme("system", true);
    }
    emitChange();
}

function handleCrossTabStorageChange(event: StorageEvent) {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
        unpersistedTheme = null;
        applyTheme(getStored(), true);
        emitChange();
    }
}

function startExternalSync() {
    const ownerWindow = getOwnerWindow();
    getMediaQuery().addEventListener("change", handleSystemSchemeChange);
    ownerWindow.addEventListener("storage", handleCrossTabStorageChange);
}

function stopExternalSync() {
    const ownerWindow = getOwnerWindow();
    getMediaQuery().removeEventListener("change", handleSystemSchemeChange);
    ownerWindow.removeEventListener("storage", handleCrossTabStorageChange);
}

function subscribe(listener: () => void): () => void {
    if (listeners.length === 0) {
        startExternalSync();
    }
    listeners.push(listener);

    return () => {
        listeners = listeners.filter((l) => l !== listener);
        if (listeners.length === 0) {
            stopExternalSync();
        }
    };
}

if (typeof document !== "undefined") {
    // Tries syncing browser chrome (backgrounds and theme-color meta)
    // before hydration, which the blocking bootstrap script cannot do.
    applyTheme(getStored());
}

export function useTheme() {
    const snapshot = useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
    );
    const isDark = resolveIsDark(snapshot.theme, snapshot.systemDark);
    const resolvedTheme: "light" | "dark" = isDark ? "dark" : "light";

    const setTheme = useStableCallback((next: Theme) => {
        unpersistedTheme = null;
        try {
            getOwnerWindow().localStorage.setItem(THEME_STORAGE_KEY, next);
        } catch {
            // Storage unavailable or blocked: keep the theme for this session.
            unpersistedTheme = next;
        }
        applyTheme(next, true);
        emitChange();
    });

    return { resolvedTheme, setTheme, theme: snapshot.theme } as const;
}

/**
 * Root-layout anchor for the theme store. Its subscription keeps external sync
 * alive app-wide, and its post-mount effect is the canonical application pass
 * that runs once stylesheets and layout surfaces have settled.
 */
export function ThemeSync() {
    const { theme } = useTheme();

    useEffect(() => {
        applyTheme(theme);
    }, [theme]);

    return null;
}
