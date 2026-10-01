import useSWR from "swr";
import { ACTION_STATUS } from "@/lib/common/constants";
import { getSectionDescription } from "@/lib/intelligence/actions";
import { SectionDescriptionRequestSchema } from "@/lib/intelligence/overview";

interface SectionDescriptionResponse {
    summary: string;
}

type SectionDescriptionSWRKey = readonly [requestBody: string];

async function fetchSectionDescription([
    payload,
]: SectionDescriptionSWRKey): Promise<SectionDescriptionResponse> {
    let rawInput: unknown;
    try {
        rawInput = JSON.parse(payload);
    } catch (error) {
        throw new Error(
            "Failed to parse section description request payload.",
            {
                cause: error,
            }
        );
    }

    const parsed = SectionDescriptionRequestSchema.safeParse(rawInput);
    if (!parsed.success) {
        throw new Error(
            "Section description request failed schema validation."
        );
    }

    const result = await getSectionDescription(parsed.data);

    if (result.status !== ACTION_STATUS.SUCCESS) {
        throw new Error(result.message);
    }

    const summary = result.summary.trim();
    if (summary.length === 0) {
        throw new Error("Section description response was empty.");
    }

    return { summary };
}

function getSectionDescriptionSWRKey(
    payload: string,
    itemCount: number
): SectionDescriptionSWRKey | null {
    return itemCount > 0 ? [payload] : null;
}

export function useSectionDescription(payload: string, itemCount: number) {
    const { data, error, isLoading, isValidating, mutate } = useSWR<
        SectionDescriptionResponse,
        Error
    >(
        getSectionDescriptionSWRKey(payload, itemCount),
        fetchSectionDescription,
        {
            dedupingInterval: 60_000,
            keepPreviousData: true,
            revalidateOnFocus: false,
            shouldRetryOnError: false,
        }
    );

    return {
        data,
        error,
        isLoading,
        isValidating,
        mutate,
    };
}
