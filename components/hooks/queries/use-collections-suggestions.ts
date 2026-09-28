import useSWR from "swr";
import type { CollectionTemplateOption } from "@/lib/collections/templates";
import { getCollectionSuggestions } from "@/lib/intelligence/actions";

const COLLECTION_SUGGESTIONS_KEY = "collection-suggestions";

async function fetchCollectionSuggestions() {
    try {
        const result = await getCollectionSuggestions();
        if (result.status !== "SUCCESS") {
            throw new Error(result.message);
        }
        return result.suggestions;
    } catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(
            typeof error === "string"
                ? error
                : "Failed to load collection suggestions",
            { cause: error }
        );
    }
}

export function useCollectionsSuggestions() {
    const {
        data = [],
        error,
        isLoading,
        mutate,
    } = useSWR<CollectionTemplateOption[], Error>(
        COLLECTION_SUGGESTIONS_KEY,
        fetchCollectionSuggestions,
        {
            dedupingInterval: 60_000,
            keepPreviousData: true,
        }
    );

    return {
        error,
        isLoading,
        items: data,
        mutate,
    };
}
