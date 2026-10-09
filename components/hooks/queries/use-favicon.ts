import useSWR from "swr";
import {
    getSideTabFavicons,
    type SideTabFaviconsResult,
} from "@/lib/collections/actions";
import { unique } from "@/lib/common/array";
import { ACTION_STATUS } from "@/lib/common/constants";

const EMPTY_FAVICON_MAP: Readonly<Record<string, string | null>> = {};

type FaviconSWRKey = readonly [
    base: "favicon",
    userId: string,
    urls: readonly string[],
];

const FAVICON_SWR_OPTIONS = {
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
};

function fetchFavicons(key: FaviconSWRKey): Promise<SideTabFaviconsResult> {
    return getSideTabFavicons({ urls: [...key[2]] });
}

function getFaviconKey(
    userId: string | null,
    urls: string[] | null
): FaviconSWRKey | null {
    if (userId === null || urls === null || urls.length === 0) {
        return null;
    }
    // Sort URLs so equal sets share one cache entry and stay aligned
    // with the favicon URLs returned for the same key.
    return ["favicon", userId, unique(urls).sort()];
}

export function useFavicon(
    userId: string | null,
    urls: string[] | null
): Readonly<Record<string, string | null>> {
    const key = getFaviconKey(userId, urls);
    const { data } = useSWR<SideTabFaviconsResult, Error>(
        key,
        fetchFavicons,
        FAVICON_SWR_OPTIONS
    );

    if (key === null || data?.status !== ACTION_STATUS.SUCCESS) {
        return EMPTY_FAVICON_MAP;
    }

    return Object.fromEntries(
        key[2].map((url, index) => [url, data.faviconUrls[index] ?? null])
    );
}
