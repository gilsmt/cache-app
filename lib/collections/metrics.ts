import { collectDuplicateBookmarkItemIds } from "@/lib/collections/library-quality";
import { getChartColorsFromKeys } from "@/lib/common/color";
import { parseDate } from "@/lib/common/date";
import {
    LibraryItemLinkReachability,
    type LibraryItemSource,
} from "@/prisma/client/enums";

const RECENT_ITEM_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface LibraryMetricsSegment<TKey extends string = string> {
    color: string;
    key: TKey;
    label: string;
    value: number;
}

export interface LibraryMetricsActivityPoint {
    count: number;
    date: string;
}

export interface LibraryMetricsSnapshot {
    addedActivity: readonly LibraryMetricsActivityPoint[];
    addedInLast30DaysCount: number;
    duplicateCount: number;
    favoriteCount: number;
    itemCount: number;
    sourceSegments: readonly LibraryMetricsSegment<LibraryItemSource>[];
    unreachableCount: number;
}

interface LibraryMetricsItem {
    collections: readonly { id: string }[];
    createdAt: Date | string;
    favoritedAt: Date | string | null;
    id: string;
    kind: string;
    linkReachability?: LibraryItemLinkReachability | null;
    source: LibraryItemSource;
    url: string;
}

export function buildComposerMetrics({
    getSourceLabel,
    items,
}: {
    getSourceLabel: (source: LibraryItemSource) => string;
    items: readonly LibraryMetricsItem[];
}): LibraryMetricsSnapshot {
    const sourceCounts = new Map<LibraryItemSource, number>();
    const addedCountsByDate = new Map<string, number>();
    const nowMs = Date.now();
    let addedInLast30DaysCount = 0;
    let favoriteCount = 0;
    let unreachableCount = 0;

    for (const item of items) {
        sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);

        const addedAt = parseDate(item.createdAt);
        if (addedAt) {
            const ageMs = nowMs - addedAt.getTime();
            if (ageMs >= 0) {
                if (ageMs < RECENT_ITEM_WINDOW_MS) {
                    addedInLast30DaysCount += 1;
                }

                const date = [
                    String(addedAt.getFullYear()).padStart(4, "0"),
                    String(addedAt.getMonth() + 1).padStart(2, "0"),
                    String(addedAt.getDate()).padStart(2, "0"),
                ].join("-");
                addedCountsByDate.set(
                    date,
                    (addedCountsByDate.get(date) ?? 0) + 1
                );
            }
        }
        if (item.favoritedAt !== null) {
            favoriteCount += 1;
        }
        if (item.linkReachability === LibraryItemLinkReachability.unreachable) {
            unreachableCount += 1;
        }
    }

    const sourceEntries = Array.from(sourceCounts.entries());
    const colorsBySource = getChartColorsFromKeys(
        sourceEntries.map(([source]) => source)
    );

    const sourceSegments = sourceEntries
        .map(([source, value]) => {
            const label = getSourceLabel(source);
            const color = colorsBySource.get(source);
            if (!color) {
                throw new Error(
                    `Invariant violated: missing chart color for source ${source}`
                );
            }
            return {
                color,
                key: source,
                label,
                value,
            } satisfies LibraryMetricsSegment<LibraryItemSource>;
        })
        .sort(
            (first, second) =>
                second.value - first.value ||
                first.label.localeCompare(second.label)
        );

    return {
        addedActivity: Array.from(addedCountsByDate, ([date, count]) => ({
            count,
            date,
        })),
        addedInLast30DaysCount,
        duplicateCount: collectDuplicateBookmarkItemIds(items).size,
        favoriteCount,
        itemCount: items.length,
        sourceSegments,
        unreachableCount,
    };
}
