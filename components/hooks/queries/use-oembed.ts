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

async function resolveOembed(url: string): Promise<OembedResolution> {
    const response = await fetch(`/api/oembed?url=${encodeURIComponent(url)}`, {
        headers: { Accept: "application/json" },
    });
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

export function useOembed(url: string | null) {
    const { data, error, mutate } = useSWR<OembedResolution, Error>(
        url,
        resolveOembed,
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
        mutate,
    };
}
