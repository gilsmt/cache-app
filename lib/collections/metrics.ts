import { collectDuplicateBookmarkItemIds } from "@/lib/collections/library-quality";
import { getChartColorsFromKeys } from "@/lib/common/color";
import { ITEM_KIND_NOTE } from "@/lib/common/constants";
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

export interface LibraryMetricsSnapshot {
    addedInLast30DaysCount: number;
    duplicateCount: number;
    favoriteCount: number;
    itemCount: number;
    noteCount: number;
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
    const nowMs = Date.now();
    let addedInLast30DaysCount = 0;
    let favoriteCount = 0;
    let noteCount = 0;
    let unreachableCount = 0;

    for (const item of items) {
        sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);

        const addedAt = parseDate(item.createdAt);
        if (addedAt) {
            const ageMs = nowMs - addedAt.getTime();
            if (ageMs >= 0 && ageMs < RECENT_ITEM_WINDOW_MS) {
                addedInLast30DaysCount += 1;
            }
        }
        if (item.favoritedAt !== null) {
            favoriteCount += 1;
        }
        if (item.kind === ITEM_KIND_NOTE) {
            noteCount += 1;
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
        addedInLast30DaysCount,
        duplicateCount: collectDuplicateBookmarkItemIds(items).size,
        favoriteCount,
        itemCount: items.length,
        noteCount,
        sourceSegments,
        unreachableCount,
    };
}
