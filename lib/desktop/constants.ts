/** GitHub repository that hosts desktop installers. */
export const DESKTOP_GITHUB_REPO = "gilsmt/cache-app" as const;

/**
 * Product name passed to Pake (`--name`). Keep in sync with
 * `.github/workflows/desktop-release.yml` asset renames.
 */
export const DESKTOP_APP_NAME = "Cache" as const;

/** URL packaged into the desktop shell. */
export const DESKTOP_APP_URL = "https://www.cachd.app" as const;

/** Public icon used by Pake packaging (PNG; Pake converts per platform). */
export const DESKTOP_APP_ICON_URL =
    "https://www.cachd.app/web-app-manifest-512x512.png" as const;

/**
 * Canonical installer file names published to GitHub Releases.
 * CI renames Pake output to these so download URLs stay stable.
 */
export const DESKTOP_ASSETS = {
    linux: {
        fileName: "Cache_x86_64.AppImage",
        label: "Linux",
    },
    macos: {
        fileName: "Cache.dmg",
        label: "macOS",
    },
    windows: {
        fileName: "Cache_x64.msi",
        label: "Windows",
    },
} as const;

export type DesktopPlatform = keyof typeof DESKTOP_ASSETS;

/** Menu / DTO display order (not alphabetical). */
export const DESKTOP_PLATFORMS = [
    "macos",
    "windows",
    "linux",
] as const satisfies readonly DesktopPlatform[];
