import useSWR from "swr";
import { type Oembed, OembedSchema } from "@/lib/common/oembed";

export type OembedResolution =
    | {
          oembed: Oembed;
          resolution: "found";
      }
    | {
          resolution: "not-found" | "unsupported";
      };

type OembedSWRKey = readonly [base: "oembed", url: string];

async function fetchOembed(key: OembedSWRKey): Promise<OembedResolution> {
    const response = await fetch(
        `/api/oembed?url=${encodeURIComponent(key[1])}`,
        {
            headers: { Accept: "application/json" },
        }
    );
    if (response.status === 404) {
        return { resolution: "unsupported" };
    }
    if (!response.ok) {
        return { resolution: "not-found" };
    }
    const parsed = OembedSchema.safeParse(await response.json());
    return parsed.success
        ? { oembed: parsed.data, resolution: "found" }
        : { resolution: "not-found" };
}

function getOembedKey(url: string | null): OembedSWRKey | null {
    return url === null ? null : ["oembed", url];
}

export function useOembed(url: string | null) {
    const { data, error, isLoading, mutate } = useSWR<OembedResolution, Error>(
        getOembedKey(url),
        fetchOembed,
        {
            revalidateIfStale: false,
            revalidateOnFocus: false,
            revalidateOnReconnect: false,
            shouldRetryOnError: false,
        }
    );

    return {
        data,
        error,
        isLoading,
        mutate,
    };
}
