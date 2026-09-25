import { z } from "zod";
import {
    DESKTOP_ASSETS,
    DESKTOP_GITHUB_REPO,
    DESKTOP_PLATFORMS,
    type DesktopPlatform,
} from "@/lib/desktop/constants";

export const GITHUB_RELEASE_SCHEMA = z.object({
    assets: z.array(
        z.object({
            browser_download_url: z.url({ protocol: /^https$/ }),
            name: z.string(),
        })
    ),
    html_url: z.url({ protocol: /^https$/ }),
    tag_name: z.string(),
});

export interface DesktopDownload {
    fileName: string;
    label: string;
    platform: DesktopPlatform;
    url: string;
}

export interface DesktopReleaseDownloads {
    downloads: DesktopDownload[];
    htmlUrl: string;
    tagName: string;
    version: string;
}

export type GitHubRelease = z.infer<typeof GITHUB_RELEASE_SCHEMA>;

const CANONICAL_FILE_BY_PLATFORM: Record<DesktopPlatform, string> = {
    linux: DESKTOP_ASSETS.linux.fileName,
    macos: DESKTOP_ASSETS.macos.fileName,
    windows: DESKTOP_ASSETS.windows.fileName,
};

const LINUX_SUFFIX_PRIORITY = [".appimage", ".deb", ".rpm"] as const;

/**
 * Stable latest-download URL for a platform (GitHub redirects to the
 * newest release that contains the named asset).
 */
export function getDesktopLatestDownloadUrl(platform: DesktopPlatform): string {
    const fileName = CANONICAL_FILE_BY_PLATFORM[platform];
    return `https://github.com/${DESKTOP_GITHUB_REPO}/releases/latest/download/${fileName}`;
}

export function getDesktopReleasesPageUrl(): string {
    return `https://github.com/${DESKTOP_GITHUB_REPO}/releases`;
}

export function getDesktopLatestReleaseApiUrl(): string {
    return `https://api.github.com/repos/${DESKTOP_GITHUB_REPO}/releases/latest`;
}

/**
 * Map a release asset file name to a desktop platform.
 * Canonical names win; otherwise fall back to extension heuristics.
 */
export function matchDesktopPlatform(fileName: string): DesktopPlatform | null {
    const lower = fileName.toLowerCase();

    for (const platform of Object.keys(
        CANONICAL_FILE_BY_PLATFORM
    ) as DesktopPlatform[]) {
        if (lower === CANONICAL_FILE_BY_PLATFORM[platform].toLowerCase()) {
            return platform;
        }
    }

    if (lower.endsWith(".dmg")) {
        return "macos";
    }
    if (lower.endsWith(".msi") || lower.endsWith(".exe")) {
        return "windows";
    }
    if (
        lower.endsWith(".appimage") ||
        lower.endsWith(".deb") ||
        lower.endsWith(".rpm")
    ) {
        return "linux";
    }

    return null;
}

/**
 * Build the public download DTO from a GitHub release payload.
 * Prefers canonical asset names; for Linux prefers AppImage over deb/rpm.
 */
export function buildDesktopReleaseDownloads(
    release: GitHubRelease
): DesktopReleaseDownloads | null {
    const byPlatform = new Map<
        DesktopPlatform,
        { fileName: string; url: string; rank: number }
    >();

    for (const asset of release.assets) {
        const platform = matchDesktopPlatform(asset.name);
        if (!platform) {
            continue;
        }

        const rank = rankDesktopAsset(platform, asset.name);
        const existing = byPlatform.get(platform);
        if (!existing || rank < existing.rank) {
            byPlatform.set(platform, {
                fileName: asset.name,
                rank,
                url: asset.browser_download_url,
            });
        }
    }

    if (byPlatform.size === 0) {
        return null;
    }

    const downloads: DesktopDownload[] = DESKTOP_PLATFORMS.flatMap(
        (platform) => {
            const matched = byPlatform.get(platform);
            if (!matched) {
                return [];
            }
            return [
                {
                    fileName: matched.fileName,
                    label: DESKTOP_ASSETS[platform].label,
                    platform,
                    url: matched.url,
                },
            ];
        }
    );

    if (downloads.length === 0) {
        return null;
    }

    return {
        downloads,
        htmlUrl: release.html_url,
        tagName: release.tag_name,
        version: normalizeReleaseVersion(release.tag_name),
    };
}

/** Static fallbacks when the GitHub API is unavailable but assets ship. */
export function getStaticDesktopDownloads(): DesktopDownload[] {
    return DESKTOP_PLATFORMS.map((platform) => ({
        fileName: DESKTOP_ASSETS[platform].fileName,
        label: DESKTOP_ASSETS[platform].label,
        platform,
        url: getDesktopLatestDownloadUrl(platform),
    }));
}

function rankDesktopAsset(platform: DesktopPlatform, fileName: string): number {
    const lower = fileName.toLowerCase();
    const canonical = CANONICAL_FILE_BY_PLATFORM[platform].toLowerCase();
    if (lower === canonical) {
        return 0;
    }
    if (platform !== "linux") {
        return 1;
    }
    const index = LINUX_SUFFIX_PRIORITY.findIndex((suffix) =>
        lower.endsWith(suffix)
    );
    return index === -1 ? 99 : index + 1;
}

function normalizeReleaseVersion(tagName: string): string {
    const trimmed = tagName.trim();
    if (trimmed.startsWith("v") || trimmed.startsWith("V")) {
        return trimmed.slice(1);
    }
    if (trimmed.toLowerCase().startsWith("desktop-v")) {
        return trimmed.slice("desktop-v".length);
    }
    return trimmed;
}
