import "server-only";

import { cacheLife } from "next/cache";
import { GenAiGenerationError, GenAiProtectionError } from "../ai/error";
import type { OverviewRequest } from "./schema";
import {
    type GenerateCollectionDescriptionInput,
    type GenerateCollectionDescriptionResult,
    type GenerateOverviewInput,
    type GenerateOverviewResult,
    generateCollectionDescription,
    generateOverview,
    OVERVIEW_FALLBACK_TEXT,
    prepareOverview,
} from "./service";

type CachedGenerationResult<T> =
    | { value: T }
    | {
          error:
              | ReturnType<
                    InstanceType<typeof GenAiProtectionError>["toObject"]
                >
              | ReturnType<
                    InstanceType<typeof GenAiGenerationError>["toObject"]
                >;
      };

export async function getCachedOverview(
    input: OverviewRequest & { userId: string }
): Promise<CachedGenerationResult<GenerateOverviewResult>> {
    const prepared = prepareOverview(input);
    if (!prepared) {
        return { value: { summary: OVERVIEW_FALLBACK_TEXT } };
    }

    return await generateCachedOverview(prepared);
}

export async function getCachedCollectionDescription(
    input: GenerateCollectionDescriptionInput
): Promise<CachedGenerationResult<GenerateCollectionDescriptionResult>> {
    "use cache";
    cacheLife("minutes");

    return await cacheGeneration(() => generateCollectionDescription(input));
}

async function generateCachedOverview(
    input: GenerateOverviewInput
): Promise<CachedGenerationResult<GenerateOverviewResult>> {
    "use cache";
    cacheLife("minutes");

    return await cacheGeneration(() => generateOverview(input));
}

async function cacheGeneration<T>(
    generate: () => Promise<T>
): Promise<CachedGenerationResult<T>> {
    try {
        return { value: await generate() };
    } catch (error) {
        if (
            !(
                GenAiProtectionError.isInstance(error) ||
                GenAiGenerationError.isInstance(error)
            )
        ) {
            throw error;
        }

        // RSC error serialization drops tagged payloads. Return them as data,
        // and expire failures immediately so quota recovery can retry.
        cacheLife({ expire: 0, revalidate: 0, stale: 0 });
        return { error: error.toObject() };
    }
}
