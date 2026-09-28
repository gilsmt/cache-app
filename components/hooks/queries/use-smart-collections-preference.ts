import useSWR from "swr";
import { getSmartCollectionsPreference } from "@/lib/collections/actions";

const SMART_COLLECTIONS_PREFERENCE_KEY = "smart-collections-preference";

async function fetchSmartCollectionsPreference() {
    try {
        const result = await getSmartCollectionsPreference();
        if (result.status !== "SUCCESS") {
            throw new Error(result.message);
        }
        return { disabled: result.disabled };
    } catch (error) {
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(
            typeof error === "string"
                ? error
                : "Failed to load smart collections preference",
            { cause: error }
        );
    }
}

export function useSmartCollectionsPreference() {
    const { data, error, isLoading, mutate } = useSWR<
        { disabled: boolean },
        Error
    >(SMART_COLLECTIONS_PREFERENCE_KEY, fetchSmartCollectionsPreference, {
        keepPreviousData: true,
    });

    return {
        data,
        disabled: data?.disabled,
        error,
        isLoading,
        mutate,
    };
}
