import useSWR from "swr";
import { getSmartCollectionsPreference } from "@/lib/collections/actions";
import { ACTION_STATUS } from "@/lib/common/constants";

const SMART_COLLECTIONS_PREFERENCE_SWR_KEY = [
    "smart-collections-preference",
] as const;

async function fetchSmartCollectionsPreference(): Promise<{
    disabled: boolean;
}> {
    const result = await getSmartCollectionsPreference();
    if (result.status !== ACTION_STATUS.SUCCESS) {
        throw new Error(result.message);
    }
    return { disabled: result.disabled };
}

export function useSmartCollectionsPreference() {
    const { data, error, isLoading, mutate } = useSWR<
        { disabled: boolean },
        Error
    >(SMART_COLLECTIONS_PREFERENCE_SWR_KEY, fetchSmartCollectionsPreference, {
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
