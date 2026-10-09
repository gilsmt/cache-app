import useSWR from "swr";
import type { CollectionTemplateOption } from "@/lib/collections/templates";
import { ACTION_STATUS } from "@/lib/common/constants";
import { getCollectionSuggestions } from "@/lib/intelligence/actions";

const COLLECTIONS_SUGGESTIONS_SWR_KEY = ["collections-suggestions"] as const;

async function fetchCollectionSuggestions(): Promise<
    CollectionTemplateOption[]
> {
    const result = await getCollectionSuggestions();
    if (result.status !== ACTION_STATUS.SUCCESS) {
        throw new Error(result.message);
    }
    return result.suggestions;
}

export function useCollectionsSuggestions() {
    const {
        data = [],
        error,
        isLoading,
        mutate,
    } = useSWR<CollectionTemplateOption[], Error>(
        COLLECTIONS_SUGGESTIONS_SWR_KEY,
        fetchCollectionSuggestions,
        {
            dedupingInterval: 60_000,
            keepPreviousData: true,
            revalidateOnFocus: false,
            shouldRetryOnError: false,
        }
    );

    return {
        error,
        isLoading,
        items: data,
        mutate,
    };
}
