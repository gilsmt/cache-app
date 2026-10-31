import useSWR from "swr";
import { ACTION_STATUS } from "@/lib/common/constants";
import { getOverview } from "@/lib/session/summaries/actions";
import { OverviewRequestSchema } from "@/lib/session/summaries/schema";

interface OverviewResponse {
    summary: string;
}

type OverviewSWRKey = readonly [base: "overview", requestBody: string];

async function fetchOverview([
    ,
    payload,
]: OverviewSWRKey): Promise<OverviewResponse> {
    let rawInput: unknown;
    try {
        rawInput = JSON.parse(payload);
    } catch (error) {
        throw new Error("Failed to parse overview request payload.", {
            cause: error,
        });
    }

    const parsed = OverviewRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
        throw new Error("Overview request failed schema validation.");
    }

    const result = await getOverview(parsed.data);

    if (result.status !== ACTION_STATUS.SUCCESS) {
        throw new Error(result.message);
    }

    const summary = result.summary.trim();
    if (summary.length === 0) {
        throw new Error("Overview response was empty.");
    }

    return { summary };
}

export function useOverview(payload: string, itemCount: number) {
    const key: OverviewSWRKey | null =
        itemCount > 0 ? ["overview", payload] : null;
    const { data, error, isLoading, isValidating, mutate } = useSWR<
        OverviewResponse,
        Error
    >(key, fetchOverview, {
        dedupingInterval: 60_000,
        keepPreviousData: true,
        revalidateOnFocus: false,
        shouldRetryOnError: false,
    });

    return {
        data,
        error,
        isLoading,
        isValidating,
        mutate,
    };
}
