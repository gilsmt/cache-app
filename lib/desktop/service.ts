import "server-only";

import { createLogger } from "@/lib/common/logs/console/logger";
import { fetchWithTimeout } from "@/lib/common/timeout";
import {
    buildDesktopReleaseDownloads,
    type DesktopReleaseDownloads,
    GithubReleaseSchema,
    getDesktopLatestReleaseApiUrl,
} from "@/lib/desktop/releases";

const log = createLogger("desktop:releases");

const GITHUB_RELEASE_TIMEOUT_MS = 8000;

export async function getLatestDesktopDownloads(): Promise<DesktopReleaseDownloads | null> {
    try {
        const response = await fetchWithTimeout(
            getDesktopLatestReleaseApiUrl(),
            {
                headers: {
                    Accept: "application/vnd.github+json",
                    "User-Agent": "Cache-App-Desktop-Downloads",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
            },
            GITHUB_RELEASE_TIMEOUT_MS
        );

        if (response.status === 404) {
            return null;
        }

        if (!response.ok) {
            log.warn("GitHub latest release request failed", {
                status: response.status,
            });
            return null;
        }

        const payload: unknown = await response.json();
        const release = GithubReleaseSchema.safeParse(payload);
        if (!release.success) {
            log.warn("GitHub latest release payload was invalid", {
                issues: release.error.issues,
            });
            return null;
        }

        return buildDesktopReleaseDownloads(release.data);
    } catch (error) {
        log.error("Failed to load desktop release downloads", error);
        return null;
    }
}
