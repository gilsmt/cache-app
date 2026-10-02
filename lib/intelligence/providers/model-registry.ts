export type RegisteredModel = `${string}/${string}`;

export const DEFAULT_REGISTERED_MODEL: RegisteredModel =
    "google/gemini-3.8-flash";

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
