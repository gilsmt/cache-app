import { isRecord } from "@/lib/common/object";

/**
 * Returns true when a storage write failed because the origin reached its
 * quota. Covers the standard `QuotaExceededError`, the legacy Firefox name,
 * and the numeric codes reported by WebKit (1014) and Firefox (22).
 */
export function isStorageQuotaExceededError(error: unknown): boolean {
    if (!isRecord(error)) {
        return false;
    }

    return (
        error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        error.code === 22 ||
        error.code === 1014
    );
}
