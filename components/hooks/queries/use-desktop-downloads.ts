import useSWR from "swr";
import { ACTION_STATUS } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { getDesktopDownloads } from "@/lib/desktop/actions";
import {
    type DesktopDownload,
    getStaticDesktopDownloads,
} from "@/lib/desktop/releases";

const DESKTOP_DOWNLOADS_SWR_KEY = ["desktop-downloads"] as const;

const log = createLogger("use-desktop-downloads");

async function fetchDesktopDownloads(): Promise<{
    downloads: DesktopDownload[];
    version?: string;
}> {
    try {
        const result = await getDesktopDownloads();

        if (result.status === ACTION_STATUS.SUCCESS) {
            return {
                downloads: result.data.downloads,
                version: result.data.version,
            };
        }
    } catch (error) {
        log.warn("Desktop downloads action failed; using static URLs", error);
    }

    return { downloads: getStaticDesktopDownloads() };
}

export function useDesktopDownloads() {
    return useSWR(DESKTOP_DOWNLOADS_SWR_KEY, fetchDesktopDownloads, {
        revalidateOnFocus: false,
        shouldRetryOnError: false,
    });
}
