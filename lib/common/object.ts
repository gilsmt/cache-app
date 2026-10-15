export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function asRecord(value: unknown): Record<string, unknown> | null {
    return isRecord(value) ? value : null;
}

/** Drops `undefined` values so optional fields are absent rather than present-but-undefined. */
export function compact<T extends object>(value: T): T {
    return Object.fromEntries(
        Object.entries(value).filter(([, item]) => item !== undefined)
    ) as T;
}
