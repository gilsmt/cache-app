import useSWR from "swr";
import {
    getSideTabFavicons,
    type SideTabFaviconsResult,
} from "@/lib/collections/actions";
import { unique } from "@/lib/common/array";
import { ACTION_STATUS } from "@/lib/common/constants";

const EMPTY_FAVICON_MAP: Readonly<Record<string, string | null>> = {};

type FaviconKey = readonly [
    base: "favicon",
    userId: string,
    urls: readonly string[],
];

function fetchFavicons(key: FaviconKey): Promise<SideTabFaviconsResult> {
    return getSideTabFavicons({ urls: [...key[2]] });
}

function getFaviconKey(
    userId: string | null,
    urls: string[] | null
): FaviconKey | null {
    if (userId === null || urls === null || urls.length === 0) {
        return null;
    }
    return ["favicon", userId, unique(urls).sort()];
}

export function useFavicon(
    userId: string | null,
    urls: string[] | null
): Readonly<Record<string, string | null>> {
    const key = getFaviconKey(userId, urls);
    const { data } = useSWR<SideTabFaviconsResult, Error>(key, fetchFavicons, {
        revalidateIfStale: false,
        revalidateOnFocus: false,
        revalidateOnReconnect: false,
        shouldRetryOnError: false,
    });

    if (key === null || data?.status !== ACTION_STATUS.SUCCESS) {
        return EMPTY_FAVICON_MAP;
    }

    return Object.fromEntries(
        key[2].map((url, index) => [url, data.faviconUrls[index] ?? null])
    );
}
