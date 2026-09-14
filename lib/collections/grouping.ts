import type {
    CollectionSortField,
    LibraryCollectionSummary,
} from "@/lib/collections/utils";
import type { Dayjs } from "@/lib/common/dayjs";

export interface CollectionGrouping<TGroupId extends string = string> {
    /** Group ids in display order; empty groups are omitted from output. */
    groupIds: readonly TGroupId[];
    resolveGroupId: (
        collection: LibraryCollectionSummary,
        now: Dayjs
    ) => TGroupId;
}

export interface CollectionSection {
    collections: LibraryCollectionSummary[];
    groupId: string;
}

const MS_PER_DAY = 86_400_000;
const LAST_3_DAYS_MAX_AGE_MS = 3 * MS_PER_DAY;
const LAST_7_DAYS_MAX_AGE_MS = 7 * MS_PER_DAY;
const LAST_30_DAYS_MAX_AGE_MS = 30 * MS_PER_DAY;

export type RelativeDateGroupId =
    | "last-3-days"
    | "last-7-days"
    | "last-30-days"
    | "older";

const RELATIVE_DATE_GROUP_IDS: readonly RelativeDateGroupId[] = [
    "last-3-days",
    "last-7-days",
    "last-30-days",
    "older",
];

function resolveRelativeDateGroupId(
    timestamp: Date,
    now: Dayjs
): RelativeDateGroupId {
    const ageMs = now.valueOf() - timestamp.valueOf();
    if (ageMs < 0) {
        return "older";
    }
    if (ageMs < LAST_3_DAYS_MAX_AGE_MS) {
        return "last-3-days";
    }
    if (ageMs < LAST_7_DAYS_MAX_AGE_MS) {
        return "last-7-days";
    }
    if (ageMs < LAST_30_DAYS_MAX_AGE_MS) {
        return "last-30-days";
    }
    return "older";
}

function createRelativeDateGrouping(
    pickTimestamp: (collection: LibraryCollectionSummary) => Date
): CollectionGrouping<RelativeDateGroupId> {
    return {
        groupIds: RELATIVE_DATE_GROUP_IDS,
        resolveGroupId: (collection, now) =>
            resolveRelativeDateGroupId(pickTimestamp(collection), now),
    };
}

const GROUPING_BY_SORT_FIELD: Partial<
    Record<CollectionSortField, CollectionGrouping>
> = {
    created: createRelativeDateGrouping((collection) => collection.createdAt),
    updated: createRelativeDateGrouping((collection) => collection.updatedAt),
};

function bucketSortedCollections(
    collections: readonly LibraryCollectionSummary[],
    grouping: CollectionGrouping,
    sortField: CollectionSortField,
    now: Dayjs
): CollectionSection[] {
    const sections = grouping.groupIds.map((groupId) => ({
        collections: [] as LibraryCollectionSummary[],
        groupId,
    }));
    const sectionByGroupId = new Map<string, CollectionSection>(
        sections.map((section): [string, CollectionSection] => [
            section.groupId,
            section,
        ])
    );

    for (const collection of collections) {
        const groupId = grouping.resolveGroupId(collection, now);
        const section = sectionByGroupId.get(groupId);
        if (section === undefined) {
            throw new Error(
                `Grouping for "${sortField}" resolved "${groupId}", which is not a declared group.`
            );
        }
        section.collections.push(collection);
    }

    return sections;
}

export function groupCollectionsBySortField(
    collections: readonly LibraryCollectionSummary[],
    sortField: CollectionSortField,
    now: Dayjs
): CollectionSection[] | null {
    const grouping = GROUPING_BY_SORT_FIELD[sortField];
    if (!grouping) {
        return null;
    }

    return bucketSortedCollections(
        collections,
        grouping,
        sortField,
        now
    ).filter((section) => section.collections.length > 0);
}
