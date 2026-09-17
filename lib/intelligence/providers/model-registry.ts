export type RegisteredModel = `${string}/${string}`;

export const DEFAULT_REGISTERED_MODEL: RegisteredModel =
    "google/gemini-3.5-flash-lite";

export const FALLBACK_REGISTERED_MODELS = [
    "google/gemini-3.1-flash-lite",
] as const satisfies readonly RegisteredModel[];

export const MODEL_REGISTRY = [
    DEFAULT_REGISTERED_MODEL,
    ...FALLBACK_REGISTERED_MODELS,
] as const satisfies readonly RegisteredModel[];

export interface ParsedRegisteredModel {
    modelId: string;
    vendor: string;
}

export const REGISTERED_MODEL_PATTERN =
    /^[a-z0-9][a-z0-9-]*\/[a-z0-9._-]+(?:\/[a-z0-9._-]+)*$/i;

export function parseRegisteredModel(
    value: string
): ParsedRegisteredModel | null {
    if (!REGISTERED_MODEL_PATTERN.test(value)) {
        return null;
    }
    const separatorIndex = value.indexOf("/");
    if (separatorIndex <= 0 || separatorIndex === value.length - 1) {
        return null;
    }
    return {
        modelId: value.slice(separatorIndex + 1),
        vendor: value.slice(0, separatorIndex).toLowerCase(),
    };
}
