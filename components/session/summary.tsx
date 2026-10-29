"use client";

import { cn } from "cn";
import * as HeatGraph from "heat-graph";
import {
    CalendarDays,
    ChartPie,
    Clock,
    Files,
    GlobeX,
    Grid2x2,
    type LucideIcon,
    Star,
} from "lucide-react";
import type * as React from "react";
import { TextMorph } from "torph/react";
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

interface DataListRow {
    icon: LucideIcon;
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

function formatItemCount(count: number): string {
    return `${count} item${count === 1 ? "" : "s"}`;
}

export function Summary(props: React.ComponentProps<typeof Popover>) {
    return <Popover {...props} />;
}

interface SummaryTriggerProps
    extends React.ComponentProps<typeof PopoverTrigger> {
    render: React.ReactElement;
    resultsSummary: string;
    sectionCount: number;
    showSectionCount: boolean;
}

export function SummaryTrigger({
    resultsSummary,
    sectionCount,
    showSectionCount,
    openOnHover = true,
    ...props
}: SummaryTriggerProps) {
    return (
        <PopoverTrigger {...props} openOnHover={openOnHover}>
            <Grid2x2
                aria-hidden
                className="inline-block size-3.5 shrink-0"
                focusable="false"
            />
            <span className="min-w-0 truncate">
                &nbsp;Showing <TextMorph>{resultsSummary}</TextMorph>
                {showSectionCount ? (
                    <>
                        , <TextMorph>{sectionCount}</TextMorph> group
                        {sectionCount === 1 ? "" : "s"}
                    </>
                ) : null}
            </span>
        </PopoverTrigger>
    );
}

interface SummaryPopupProps extends React.ComponentProps<typeof PopoverPopup> {
    metrics: LibraryMetricsSnapshot;
    onClearFilters?: () => void;
}

export function SummaryPopup({
    className,
    metrics,
    onClearFilters,
    side = "top",
    align = "start",
    positionMethod = "fixed",
    ...props
}: SummaryPopupProps) {
    return (
        <PopoverPopup
            {...props}
            align={align}
            className={cn("min-w-72", className)}
            positionMethod={positionMethod}
            side={side}
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

interface SummaryDataListProps
    extends Omit<React.ComponentProps<typeof DataList>, "children"> {
    actions?: React.ReactNode;
    metrics: LibraryMetricsSnapshot;
}

function SummaryDataList({
    actions,
    className,
    metrics,
    ...props
}: SummaryDataListProps) {
    const {
        addedActivity,
        addedInLast30DaysCount,
        duplicateCount,
        favoriteCount,
        itemCount,
        sourceSegments,
        unreachableCount,
    } = metrics;

    const rows: readonly DataListRow[] = [
        { icon: Star, label: "Favorites", value: favoriteCount },
        {
            icon: Clock,
            label: "Added in last 30 days",
            value: addedInLast30DaysCount,
        },
        {
            icon: Files,
            label: "Duplicates",
            value: duplicateCount,
        },
        {
            icon: GlobeX,
            label: "Unreachable",
            value: unreachableCount,
        },
    ];

    const hasSourceSegments = sourceSegments.length > 0;

    return (
        <DataList {...props} className={cn("-my-2", className)}>
            {actions ? (
                <>
                    {actions}
                    <DataListSeparator />
                </>
            ) : null}
            <DataListSection defaultOpen>
                <DataListSectionTrigger
                    endAddon={
                        hasSourceSegments ? (
                            <DataListChart
                                className="ml-auto max-w-1/3 group-data-open/collapsible:hidden"
                                isDecorative
                                segments={sourceSegments}
                            />
                        ) : null
                    }
                >
                    Summary
                </DataListSectionTrigger>
                <DataListSectionContent>
                    {hasSourceSegments ? (
                        <>
                            <DataListChart
                                isDecorative
                                segments={sourceSegments}
                            />
                            <DataListGroup>
                                {sourceSegments.map((segment) => (
                                    <DataListItem key={segment.key}>
                                        <DataListLabel>
                                            {segment.label}
                                        </DataListLabel>
                                        <DataListValue>
                                            <span className="flex size-4 shrink-0 items-center justify-center sm:size-3.5">
                                                <span
                                                    aria-hidden
                                                    className="size-2 shrink-0 rounded-full"
                                                    style={{
                                                        backgroundColor:
                                                            segment.color,
                                                    }}
                                                />
                                            </span>
                                            {formatShareValue(
                                                segment.value,
                                                itemCount
                                            )}
                                        </DataListValue>
                                    </DataListItem>
                                ))}
                            </DataListGroup>
                        </>
                    ) : (
                        <SummaryEmpty
                            description="Saved items show up here grouped by source."
                            icon={ChartPie}
                            title="No sources yet"
                        />
                    )}
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
                                    <Icon aria-hidden focusable="false" />
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
                    <ActivityHeatGraph activity={addedActivity} />
                </DataListSectionContent>
            </DataListSection>
        </DataList>
    );
}

interface ActivityHeatGraphProps {
    activity: LibraryMetricsSnapshot["addedActivity"];
}

function ActivityHeatGraph({ activity }: ActivityHeatGraphProps) {
    const totalAddedCount = activity.reduce(
        (total, point) => total + point.count,
        0
    );

    if (totalAddedCount <= 0) {
        return (
            <SummaryEmpty
                description="New saves light up this year view."
                icon={CalendarDays}
                title="No activity yet"
            />
        );
    }

    return (
        <div className="col-span-full grid w-full min-w-0 gap-2">
            <HeatGraph.Root
                aria-label={`Daily activity graph over the past year, ${formatItemCount(totalAddedCount)} added`}
                className="grid gap-2"
                colorScale={ACTIVITY_COLOR_SCALE}
                data={[...activity]}
                role="img"
                weekStart="monday"
            >
                <div className="text-muted-foreground/80 relative h-3 text-[10px]">
                    <HeatGraph.MonthLabels>
                        {({ label, totalWeeks }) =>
                            label.month % 3 === 0 ? (
                                <span
                                    className={cn(
                                        "absolute text-nowrap",
                                        label.column === totalWeeks - 1 &&
                                            "-translate-x-full"
                                    )}
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
                <HeatGraph.Grid className="gap-px">
                    {() => (
                        <HeatGraph.Cell className="aspect-square rounded-[1px]" />
                    )}
                </HeatGraph.Grid>
                <HeatGraph.Tooltip className="bg-popover text-popover-foreground z-50 rounded-md border px-2 py-1 text-xs shadow-md">
                    {({ cell }) => (
                        <>
                            {formatItemCount(cell.count)} added{" "}
                            {ACTIVITY_DATE_FORMATTER.format(cell.date)}
                        </>
                    )}
                </HeatGraph.Tooltip>
            </HeatGraph.Root>
            <div
                aria-hidden="true"
                className="text-muted-foreground flex items-center justify-end gap-0.75 text-[10px]"
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

interface SummaryEmptyProps {
    description: string;
    icon: LucideIcon;
    title: string;
}

function SummaryEmpty({ description, icon: Icon, title }: SummaryEmptyProps) {
    return (
        <div className="col-span-full flex flex-col items-center gap-1.5 px-2 py-6 text-center">
            <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full">
                <Icon aria-hidden className="size-4" focusable="false" />
            </span>
            <p className="text-foreground text-xs leading-tight font-medium">
                {title}
            </p>
            <p className="text-muted-foreground max-w-55 text-xs leading-snug text-balance">
                {description}
            </p>
        </div>
    );
}
