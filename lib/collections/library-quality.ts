import { ITEM_KIND_BOOKMARK } from "@/lib/common/constants";
import { canonicalBookmarkUrl } from "@/lib/common/url";
import { LibraryItemSource } from "@/prisma/client/enums";

/** Platform sources that routinely block automated checks. */
export const LINK_PROBE_SKIP_SOURCES = new Set<LibraryItemSource>([
    LibraryItemSource.instagram,
    LibraryItemSource.reddit_saved,
    LibraryItemSource.tiktok,
    LibraryItemSource.x_bookmarks,
]);

/** Max item ids per reachability probe request (client + server). */
export const LINK_REACHABILITY_BATCH_MAX = 25;

/** Consecutive probe failures (thrown errors or failed results) before giving up. */
export const LINK_PROBE_MAX_RETRIES = 5;

/** Base delay before retrying a failed probe; doubles per consecutive failure. */
export const LINK_PROBE_RETRY_BACKOFF_BASE_MS = 3000;

export interface LibraryQualityItem {
    id: string;
    kind: string;
    source: LibraryItemSource;
    url: string;
}

export type LinkReachabilityStatus =
    | "reachable"
    | "unreachable"
    | "ambiguous"
    | "skipped";

/**
 * Item ids that share a canonical bookmark URL with at least one other
 * bookmark in the provided set. Notes and non-http URLs never participate.
 */
export function collectDuplicateBookmarkItemIds(
    items: readonly LibraryQualityItem[]
): Set<string> {
    const idsByCanonical = new Map<string, string[]>();

    for (const item of items) {
        if (item.kind !== ITEM_KIND_BOOKMARK) {
            continue;
        }

        const canonical = canonicalBookmarkUrl(item.url);
        if (!canonical) {
            continue;
        }

        const bucket = idsByCanonical.get(canonical);
        if (bucket) {
            bucket.push(item.id);
        } else {
            idsByCanonical.set(canonical, [item.id]);
        }
    }

    const duplicateIds = new Set<string>();
    for (const ids of idsByCanonical.values()) {
        if (ids.length < 2) {
            continue;
        }
        for (const id of ids) {
            duplicateIds.add(id);
        }
    }

    return duplicateIds;
}

export function isLinkProbeCandidate(item: LibraryQualityItem): boolean {
    if (item.kind !== ITEM_KIND_BOOKMARK) {
        return false;
    }
    if (LINK_PROBE_SKIP_SOURCES.has(item.source)) {
        return false;
    }
    return canonicalBookmarkUrl(item.url) !== null;
}

export function needsLinkReachabilityProbe(
    item: LibraryQualityItem & {
        linkCheckedAt?: Date | string | null;
    }
): boolean {
    if (!isLinkProbeCandidate(item)) {
        return false;
    }
    return item.linkCheckedAt === null || item.linkCheckedAt === undefined;
}

export function itemCanonicalGroupKey(item: LibraryQualityItem): string {
    return canonicalBookmarkUrl(item.url) ?? item.id;
}
