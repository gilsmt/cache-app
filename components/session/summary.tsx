"use client";

import { Files, Folders, GlobeX, Inbox, NotebookPen, Star } from "lucide-react";
import type * as React from "react";
import {
    DataList,
    DataListChart,
    DataListGroup,
    DataListItem,
    DataListSection,
    DataListSectionContent,
    DataListSectionTrigger,
    DataListSeparator,
} from "@/components/ui/data-list";
import type { LibraryMetricsSnapshot } from "@/lib/collections/metrics";
import { formatSharePercent } from "@/lib/common/number";

function formatShareValue(value: number, total: number): React.ReactNode {
    if (total <= 0) {
        return value;
    }

    return (
        <>
            {value}
            <span className="text-muted-foreground/80 tabular-nums">
                {" "}
                · {formatSharePercent(value, total)}
            </span>
        </>
    );
}

interface SummaryDataListProps
    extends Omit<React.ComponentProps<typeof DataList>, "children"> {
    children?: React.ReactNode;
    metrics: LibraryMetricsSnapshot;
}

export function SummaryDataList({
    children,
    metrics,
    ...props
}: SummaryDataListProps) {
    const {
        duplicateCount,
        favoriteCount,
        inCollectionCount,
        itemCount,
        noteCount,
        sourceSegments,
        uncollectedCount,
        unreachableCount,
    } = metrics;

    const additionalRows = [
        {
            icon: (
                <Inbox
                    aria-hidden
                    className="size-4 sm:size-3.5"
                    focusable="false"
                />
            ),
            key: "uncollected",
            label: "Not in Collections",
            value: uncollectedCount,
        },
        {
            icon: (
                <Files
                    aria-hidden
                    className="size-4 sm:size-3.5"
                    focusable="false"
                />
            ),
            key: "duplicates",
            label: "Duplicates",
            value: duplicateCount,
        },
        {
            icon: (
                <GlobeX
                    aria-hidden
                    className="size-4 sm:size-3.5"
                    focusable="false"
                />
            ),
            key: "unreachable",
            label: "Unreachable",
            value: unreachableCount,
        },
    ].filter((row) => row.value > 0);

    return (
        <DataList {...props}>
            {children}
            <DataListSection defaultOpen>
                <DataListSectionTrigger
                    endAddon={
                        <DataListChart
                            className="ml-auto max-w-1/3 group-data-open/collapsible:hidden"
                            segments={sourceSegments}
                        />
                    }
                >
                    Summary
                </DataListSectionTrigger>
                <DataListSectionContent>
                    <DataListChart segments={sourceSegments} />
                    <DataListGroup>
                        {sourceSegments.map((segment) => (
                            <DataListItem
                                color={segment.color}
                                key={segment.key}
                                label={segment.label}
                                value={formatShareValue(
                                    segment.value,
                                    itemCount
                                )}
                            />
                        ))}
                    </DataListGroup>
                </DataListSectionContent>
            </DataListSection>
            <DataListSeparator />
            <DataListSection>
                <DataListSectionTrigger>Library</DataListSectionTrigger>
                <DataListSectionContent>
                    <DataListGroup>
                        <DataListItem
                            icon={
                                <Star
                                    aria-hidden
                                    className="size-4 sm:size-3.5"
                                    focusable="false"
                                />
                            }
                            label="Favorites"
                            value={formatShareValue(favoriteCount, itemCount)}
                        />
                        <DataListItem
                            icon={
                                <NotebookPen
                                    aria-hidden
                                    className="size-4 sm:size-3.5"
                                    focusable="false"
                                />
                            }
                            label="Notes"
                            value={formatShareValue(noteCount, itemCount)}
                        />
                        <DataListItem
                            icon={
                                <Folders
                                    aria-hidden
                                    className="size-4 sm:size-3.5"
                                    focusable="false"
                                />
                            }
                            label="In Collections"
                            value={formatShareValue(
                                inCollectionCount,
                                itemCount
                            )}
                        />
                        {additionalRows.map((row) => (
                            <DataListItem
                                icon={row.icon}
                                key={row.key}
                                label={row.label}
                                value={formatShareValue(row.value, itemCount)}
                            />
                        ))}
                    </DataListGroup>
                </DataListSectionContent>
            </DataListSection>
        </DataList>
    );
}
