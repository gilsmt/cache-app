"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { Calligraph } from "calligraph";
import { cn } from "cn";
import * as HeatGraph from "heat-graph";
import {
    Clock,
    Files,
    GlobeX,
    Grid2x2,
    Grid2x2X,
    type LucideIcon,
    Star,
} from "lucide-react";
import type * as React from "react";
import { useState } from "react";
import {
    DataList,
    DataListChart,
    DataListGroup,
    DataListItem,
    DataListItemButton,
    DataListLabel,
    DataListSection,
    DataListSectionContent,
    DataListSectionTrigger,
    DataListSeparator,
    DataListValue,
} from "@/components/ui/data-list";
import {
    Popover,
    PopoverClose,
    PopoverPopup,
    PopoverTrigger,
} from "@/components/ui/popover";
import type { LibraryMetricsSnapshot } from "@/lib/collections/metrics";
import { formatSharePercent } from "@/lib/common/number";

const ACTIVITY_COLOR_SCALE = [
    "var(--muted)",
    "color-mix(in oklch, var(--primary) 20%, var(--muted))",
    "color-mix(in oklch, var(--primary) 40%, var(--muted))",
    "color-mix(in oklch, var(--primary) 65%, var(--muted))",
    "var(--primary)",
];

const ACTIVITY_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
});

interface LibraryRow {
    icon: LucideIcon;
    isHiddenWhenEmpty?: boolean;
    label: string;
    value: number;
}

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
    actions?: React.ReactNode;
    metrics: LibraryMetricsSnapshot;
}

function SummaryDataList({ actions, metrics, ...props }: SummaryDataListProps) {
    const {
        addedActivity,
        addedInLast30DaysCount,
        duplicateCount,
        favoriteCount,
        itemCount,
        sourceSegments,
        unreachableCount,
    } = metrics;

    const rows: readonly LibraryRow[] = [
        { icon: Star, label: "Favorites", value: favoriteCount },
        {
            icon: Clock,
            isHiddenWhenEmpty: true,
            label: "Added in last 30 days",
            value: addedInLast30DaysCount,
        },
        {
            icon: Files,
            isHiddenWhenEmpty: true,
            label: "Duplicates",
            value: duplicateCount,
        },
        {
            icon: GlobeX,
            isHiddenWhenEmpty: true,
            label: "Unreachable",
            value: unreachableCount,
        },
    ].filter((row) => !row.isHiddenWhenEmpty || row.value > 0);

    return (
        <DataList {...props} className={cn("-my-2", props.className)}>
            {actions ? (
                <>
                    {actions}
                    <DataListSeparator />
                </>
            ) : null}
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
                            <DataListItem key={segment.key}>
                                <DataListLabel>{segment.label}</DataListLabel>
                                <DataListValue>
                                    <span className="flex size-4 shrink-0 items-center justify-center sm:size-3.5">
                                        <span
                                            aria-hidden
                                            className="size-2 shrink-0 rounded-full"
                                            style={{
                                                backgroundColor: segment.color,
                                            }}
                                        />
                                    </span>
                                    {formatShareValue(segment.value, itemCount)}
                                </DataListValue>
                            </DataListItem>
                        ))}
                    </DataListGroup>
                </DataListSectionContent>
            </DataListSection>
            <DataListSeparator />
            <DataListSection>
                <DataListSectionTrigger>Library</DataListSectionTrigger>
                <DataListSectionContent>
                    <DataListGroup>
                        {rows.map(({ icon: Icon, label, value }) => (
                            <DataListItem key={label}>
                                <DataListLabel>{label}</DataListLabel>
                                <DataListValue>
                                    <Icon
                                        aria-hidden
                                        className="size-4 sm:size-3.5"
                                        focusable="false"
                                    />
                                    {formatShareValue(value, itemCount)}
                                </DataListValue>
                            </DataListItem>
                        ))}
                    </DataListGroup>
                </DataListSectionContent>
            </DataListSection>
            <DataListSeparator />
            <DataListSection>
                <DataListSectionTrigger>Activity</DataListSectionTrigger>
                <DataListSectionContent>
                    <ActivityHeatmap activity={addedActivity} />
                </DataListSectionContent>
            </DataListSection>
        </DataList>
    );
}

export function Summary(props: React.ComponentProps<typeof Popover>) {
    return <Popover {...props} />;
}

interface SummaryTriggerProps
    extends Omit<
        React.ComponentProps<typeof PopoverTrigger>,
        "children" | "render"
    > {
    hasActiveFilters: boolean;
    render: React.ReactElement;
    resultsSummary: string;
    sectionCount: number;
    showSectionCount: boolean;
}

export function SummaryTrigger({
    hasActiveFilters,
    render,
    resultsSummary,
    sectionCount,
    showSectionCount,
    ...props
}: SummaryTriggerProps) {
    return (
        <PopoverTrigger openOnHover {...props} render={render}>
            {hasActiveFilters ? (
                <Grid2x2X className="inline-block size-3.5 shrink-0" />
            ) : (
                <Grid2x2 className="inline-block size-3.5 shrink-0" />
            )}
            <span className="min-w-0 truncate tabular-nums">
                &nbsp;Showing <Calligraph>{resultsSummary}</Calligraph>
                {showSectionCount ? (
                    <>
                        , <Calligraph>{sectionCount}</Calligraph> group
                        {sectionCount === 1 ? "" : "s"}
                    </>
                ) : null}
            </span>
        </PopoverTrigger>
    );
}

interface SummaryPopupProps
    extends Omit<React.ComponentProps<typeof PopoverPopup>, "children"> {
    metrics: LibraryMetricsSnapshot;
    onClearFilters?: () => void;
}

export function SummaryPopup({
    className,
    metrics,
    onClearFilters,
    ...props
}: SummaryPopupProps) {
    return (
        <PopoverPopup
            align="start"
            {...props}
            className={cn("w-72", className)}
            positionMethod="fixed"
            side="top"
        >
            <SummaryDataList
                actions={
                    onClearFilters ? (
                        <PopoverClose
                            render={
                                <DataListItemButton onClick={onClearFilters} />
                            }
                        >
                            Reset filters
                        </PopoverClose>
                    ) : undefined
                }
                metrics={metrics}
            />
        </PopoverPopup>
    );
}

interface ActivityHeatmapProps {
    activity: LibraryMetricsSnapshot["addedActivity"];
}

function ActivityHeatmap({ activity }: ActivityHeatmapProps) {
    const [activeLabel, setActiveLabel] = useState<string | null>(null);

    const clearActiveLabel = useStableCallback(() => {
        setActiveLabel(null);
    });

    return (
        <div className="col-span-full grid min-w-0 gap-3">
            <HeatGraph.Root
                aria-label="Daily item additions over the past year. Focus a filled day to see its count."
                className="grid min-w-0 gap-2"
                colorScale={ACTIVITY_COLOR_SCALE}
                data={[...activity]}
                role="group"
                weekStart="monday"
            >
                <div className="relative h-3 overflow-clip text-[10px] text-muted-foreground/80">
                    <HeatGraph.MonthLabels>
                        {({ label, totalWeeks }) =>
                            label.month % 3 === 0 ? (
                                <span
                                    className="absolute"
                                    style={{
                                        left: `${(label.column / totalWeeks) * 100}%`,
                                    }}
                                >
                                    {HeatGraph.MONTH_SHORT[label.month]}
                                </span>
                            ) : null
                        }
                    </HeatGraph.MonthLabels>
                </div>
                <HeatGraph.Grid className="gap-0.5">
                    {({ cell }) => {
                        const isActiveDay = cell.count > 0;
                        const label = isActiveDay
                            ? `${cell.count} item${cell.count === 1 ? "" : "s"} added ${ACTIVITY_DATE_FORMATTER.format(cell.date)}`
                            : undefined;

                        return (
                            <HeatGraph.Cell
                                aria-hidden={!isActiveDay}
                                aria-label={label}
                                className="aspect-square min-w-0 rounded-[1px] focus-visible:ring-2 focus-visible:ring-ring"
                                onBlur={clearActiveLabel}
                                onFocus={
                                    label
                                        ? () => setActiveLabel(label)
                                        : undefined
                                }
                                role={isActiveDay ? "img" : undefined}
                                tabIndex={isActiveDay ? 0 : undefined}
                            />
                        );
                    }}
                </HeatGraph.Grid>
                <HeatGraph.Tooltip className="z-50 rounded-md border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-md">
                    {({ cell }) => (
                        <>
                            {cell.count} item{cell.count === 1 ? "" : "s"} added{" "}
                            {ACTIVITY_DATE_FORMATTER.format(cell.date)}
                        </>
                    )}
                </HeatGraph.Tooltip>
                {activeLabel ? (
                    <p className="text-[11px] text-muted-foreground">
                        {activeLabel}
                    </p>
                ) : null}
            </HeatGraph.Root>
            <div
                aria-hidden="true"
                className="flex items-center justify-end gap-1 text-[9px] text-muted-foreground"
            >
                <span>Less</span>
                {ACTIVITY_COLOR_SCALE.map((color) => (
                    <span
                        className="size-1.5 rounded-xs"
                        key={color}
                        style={{ backgroundColor: color }}
                    />
                ))}
                <span>More</span>
            </div>
        </div>
    );
}
