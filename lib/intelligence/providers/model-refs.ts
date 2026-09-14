export type ModelRef = `${string}/${string}`;

export const DEFAULT_MODEL_REF: ModelRef = "google/gemini-3.5-flash-lite";

export const FALLBACK_MODEL_REFS = [
    "google/gemini-3.1-flash-lite",
] as const satisfies readonly ModelRef[];

export const MODEL_REFS = [
    DEFAULT_MODEL_REF,
    ...FALLBACK_MODEL_REFS,
] as const satisfies readonly ModelRef[];

export interface ParsedModelRef {
    modelId: string;
    vendor: string;
}

export const MODEL_REF_PATTERN =
    /^[a-z0-9][a-z0-9-]*\/[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/i;

export function parseModelRef(ref: string): ParsedModelRef | null {
    if (!MODEL_REF_PATTERN.test(ref)) {
        return null;
    }
    const separatorIndex = ref.indexOf("/");
    if (separatorIndex <= 0 || separatorIndex === ref.length - 1) {
        return null;
    }
    return {
        modelId: ref.slice(separatorIndex + 1),
        vendor: ref.slice(0, separatorIndex).toLowerCase(),
    };
}
