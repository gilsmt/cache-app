import type { GenerationUsage, RawGenerationUsage } from "./generate";

export const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string, outputTokenLimit = 0): number {
    return Math.max(
        1,
        Math.ceil(text.length / CHARS_PER_TOKEN) + outputTokenLimit
    );
}

export function summarizeStepUsage(
    steps: Array<{ usage?: RawGenerationUsage }>
): GenerationUsage | undefined {
    if (steps.length === 0) {
        return undefined;
    }

    let cachedInputTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    for (const step of steps) {
        cachedInputTokens +=
            step.usage?.inputTokenDetails?.cacheReadTokens ?? 0;
        inputTokens += step.usage?.inputTokens ?? 0;
        outputTokens += step.usage?.outputTokens ?? 0;
        totalTokens += step.usage?.totalTokens ?? 0;
    }

    return { cachedInputTokens, inputTokens, outputTokens, totalTokens };
}
