"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { formatSharePercent } from "@/lib/common/number";

const FULL_WIDTH_BLEED = "-mx-2.5 w-[calc(100%+(--spacing(5)))]";

interface DataListContext {
    activeSegmentKey: string | null;
    setActiveSegmentKey: React.Dispatch<React.SetStateAction<string | null>>;
}

const DataListContext = React.createContext<DataListContext | null>(null);

function useDataListContext() {
    return React.useContext(DataListContext);
}

export function DataList({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const [activeSegmentKey, setActiveSegmentKey] = React.useState<
        string | null
    >(null);
    const defaultProps = {
        className: cn(
            "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-1.5 [&>*]:col-span-2",
            className
        ),
        "data-slot": "data-list",
    };

    const contextValue = { activeSegmentKey, setActiveSegmentKey };

    return (
        <DataListContext value={contextValue}>
            {useRender({
                defaultTagName: "div",
                props: mergeProps<"div">(defaultProps, props),
                render,
            })}
        </DataListContext>
    );
}

export function DataListSection({
    className,
    ...props
}: React.ComponentProps<typeof Collapsible>) {
    return (
        <Collapsible
            {...props}
            className={cn(
                "group/collapsible col-span-2 grid min-w-0 grid-cols-subgrid gap-2",
                className
            )}
        />
    );
}

export function DataListSectionTrigger({
    children,
    className,
    endAddon = null,
    ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
    endAddon?: React.ReactNode;
}) {
    return (
        <CollapsibleTrigger
            {...props}
            className={cn(
                "group text-muted-foreground hover:bg-accent focus-visible:ring-ring focus-visible:ring-offset-background col-span-2 flex min-h-8 items-center gap-1.5 rounded-lg px-2.5 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-offset-1 sm:min-h-7 pointer-coarse:min-h-11",
                FULL_WIDTH_BLEED,
                className
            )}
        >
            <span className="min-w-0 truncate">{children}</span>
            <ChevronDown
                aria-hidden
                className="size-3.5 -rotate-90 transition-transform group-data-open/collapsible:rotate-0 group-data-open/collapsible:opacity-0 group-data-open/collapsible:group-hover:opacity-100"
                focusable="false"
            />
            {endAddon}
        </CollapsibleTrigger>
    );
}

export function DataListSectionContent({
    className,
    ...props
}: React.ComponentProps<typeof CollapsiblePanel>) {
    return (
        <CollapsiblePanel
            {...props}
            className={cn(
                "col-span-full grid min-w-0 grid-cols-subgrid gap-3",
                className
            )}
        />
    );
}

export function DataListGroup({
    className,
    children,
    render,
    ...props
}: useRender.ComponentProps<"ul">) {
    const defaultProps = {
        children,
        className: cn(
            "col-span-2 m-0 mt-0.5 grid min-w-0 list-none grid-cols-subgrid gap-x-3 gap-y-2 p-0 pb-1.5",
            className
        ),
        "data-slot": "data-list-group",
    };

    return useRender({
        defaultTagName: "ul",
        props: mergeProps<"ul">(defaultProps, props),
        render,
    });
}

interface DataListItemProps extends useRender.ComponentProps<"li"> {
    segmentKey?: string;
}

export function DataListItem({
    className,
    children,
    render,
    segmentKey,
    ...props
}: DataListItemProps) {
    const hoverContext = useDataListContext();
    const activeSegmentKey = hoverContext?.activeSegmentKey ?? null;
    const defaultProps = {
        children: (
            <dl className="col-span-2 grid grid-cols-subgrid items-center gap-x-3 text-sm sm:text-xs">
                {children}
            </dl>
        ),
        className: cn(
            "data-[highlighted=true]:bg-accent/50 col-span-2 grid min-w-0 list-none grid-cols-subgrid rounded-md data-[dimmed=true]:opacity-50",
            className
        ),
        "data-dimmed":
            segmentKey !== undefined &&
            activeSegmentKey !== null &&
            segmentKey !== activeSegmentKey
                ? "true"
                : undefined,
        "data-highlighted":
            segmentKey !== undefined && segmentKey === activeSegmentKey
                ? "true"
                : undefined,
        "data-slot": "data-list-item",
        onPointerEnter: () => {
            if (segmentKey !== undefined) {
                hoverContext?.setActiveSegmentKey(segmentKey);
            }
        },
        onPointerLeave: () => {
            if (segmentKey === undefined) {
                return;
            }
            hoverContext?.setActiveSegmentKey((activeKey) =>
                activeKey === segmentKey ? null : activeKey
            );
        },
    };

    return useRender({
        defaultTagName: "li",
        props: mergeProps<"li">(defaultProps, props),
        render,
    });
}

export function DataListLabel({
    children,
    className,
    render,
    ...props
}: useRender.ComponentProps<"dt">) {
    const defaultProps = {
        children: <span className="min-w-0 truncate">{children}</span>,
        className: cn("text-foreground flex min-w-0 items-center", className),
        "data-slot": "data-list-label",
    };

    return useRender({
        defaultTagName: "dt",
        props: mergeProps<"dt">(defaultProps, props),
        render,
    });
}

export function DataListValue({
    className,
    render,
    ...props
}: useRender.ComponentProps<"dd">) {
    const defaultProps = {
        className: cn(
            "text-foreground flex min-w-0 items-center justify-start gap-1.5 text-left tabular-nums [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
            className
        ),
        "data-slot": "data-list-value",
    };

    return useRender({
        defaultTagName: "dd",
        props: mergeProps<"dd">(defaultProps, props),
        render,
    });
}

export function DataListItemButton({
    className,
    size = "sm",
    type = "button",
    variant = "ghost",
    ...props
}: React.ComponentProps<typeof Button>) {
    return (
        <li
            className="col-span-2 min-w-0 list-none"
            data-slot="data-list-item-button"
        >
            <Button
                {...props}
                className={cn(
                    "text-muted-foreground flex shrink-0 justify-start text-xs! font-normal",
                    FULL_WIDTH_BLEED,
                    className
                )}
                size={size}
                type={type}
                variant={variant}
            />
        </li>
    );
}

export function DataListSeparator({
    className,
    ...props
}: React.ComponentProps<typeof Separator>) {
    return (
        <Separator
            {...props}
            className={cn("col-span-2 my-0.5", className)}
            orientation="horizontal"
        />
    );
}

interface StackedBarChartSegment {
    color: string;
    key: string;
    label: string;
    value: number;
}

function buildStackedBarAriaLabel(
    segments: readonly StackedBarChartSegment[],
    total: number
): string {
    return segments
        .map((segment) => {
            const percent = formatSharePercent(segment.value, total);
            return `${segment.label} ${segment.value} (${percent})`;
        })
        .join(", ");
}

interface DataListBarChartProps
    extends Omit<React.ComponentProps<"div">, "aria-hidden" | "role"> {
    isDecorative?: boolean;
    segments: readonly StackedBarChartSegment[];
}

export function DataListBarChart({
    className,
    isDecorative = false,
    segments,
    "aria-label": ariaLabel,
    ...props
}: DataListBarChartProps) {
    const hoverContext = useDataListContext();
    const activeSegmentKey = hoverContext?.activeSegmentKey ?? null;
    function handlePointerOver(event: React.PointerEvent<HTMLDivElement>) {
        const target = event.target;
        const segmentKey =
            target instanceof HTMLElement
                ? target.dataset.segmentKey
                : undefined;
        hoverContext?.setActiveSegmentKey(segmentKey ?? null);
    }

    function handlePointerLeave() {
        hoverContext?.setActiveSegmentKey(null);
    }

    const chartProps = mergeProps<"div">(
        {
            onPointerLeave: handlePointerLeave,
            onPointerOver: handlePointerOver,
        },
        props
    );

    const visibleSegments = segments.filter(
        (segment) => Number.isFinite(segment.value) && segment.value > 0
    );
    const total = visibleSegments.reduce(
        (sum, segment) => sum + segment.value,
        0
    );
    const isEmpty = visibleSegments.length === 0;
    const chartAriaLabel =
        isDecorative || isEmpty
            ? undefined
            : ariaLabel?.trim() ||
              buildStackedBarAriaLabel(visibleSegments, total);
    const hasHighlightedSegment =
        activeSegmentKey !== null &&
        visibleSegments.some((segment) => segment.key === activeSegmentKey);

    return (
        // biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is "img" exactly when aria-label is set
        <div
            {...chartProps}
            aria-hidden={chartAriaLabel === undefined}
            aria-label={chartAriaLabel}
            className={cn(
                "bg-muted col-span-2 h-2 w-full overflow-hidden rounded-full",
                !isEmpty && "flex gap-px",
                className
            )}
            data-slot="data-list-chart"
            role={chartAriaLabel === undefined ? undefined : "img"}
        >
            {visibleSegments.map((segment, index) => {
                const isFirst = index === 0;
                const isLast = index === visibleSegments.length - 1;

                return (
                    <div
                        className={cn(
                            "min-w-0 transition-[flex-grow,filter] ease-out motion-reduce:transition-none",
                            hasHighlightedSegment &&
                                segment.key !== activeSegmentKey &&
                                "grayscale",
                            isFirst && "rounded-s-full",
                            isLast && "rounded-e-full"
                        )}
                        data-highlighted={
                            segment.key === activeSegmentKey
                                ? "true"
                                : undefined
                        }
                        data-segment-key={segment.key}
                        key={segment.key}
                        style={{
                            backgroundColor: segment.color,
                            flexBasis: 0,
                            flexGrow: segment.value,
                        }}
                        title={`${segment.label}: ${segment.value} (${formatSharePercent(segment.value, total)})`}
                    />
                );
            })}
        </div>
    );
}
