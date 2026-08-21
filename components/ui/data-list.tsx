"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import type * as React from "react";
import {
    StackedBarChart,
    type StackedBarChartSegment,
} from "@/components/ui/stacked-bar-chart";
import { cn } from "@/lib/common/cn";

export function DataList({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn("flex w-full min-w-56 flex-col gap-3", className),
        "data-slot": "data-list",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

interface DataListChartProps
    extends Omit<React.ComponentProps<typeof StackedBarChart>, "segments"> {
    segments: readonly StackedBarChartSegment[];
}

export function DataListChart(props: DataListChartProps) {
    return <StackedBarChart {...props} data-slot="data-list-chart" />;
}

export function DataListHeader({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn("flex flex-col gap-0.5", className),
        "data-slot": "data-list-header",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

export function DataListTitle({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn("font-normal text-muted-foreground text-xs", className),
        "data-slot": "data-list-title",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

export function DataListSection({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn("flex flex-col gap-2", className),
        "data-slot": "data-list-section",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

export function DataListGroup({
    className,
    render,
    ...props
}: useRender.ComponentProps<"dl">) {
    const defaultProps = {
        className: cn("mt-1.5 flex flex-col gap-1.5", className),
        "data-slot": "data-list-group",
    };

    return useRender({
        defaultTagName: "dl",
        props: mergeProps<"dl">(defaultProps, props),
        render,
    });
}

type DataListItemProps = Omit<useRender.ComponentProps<"div">, "children"> & {
    label: React.ReactNode;
    value: React.ReactNode;
} & (
        | { color: string; icon?: never }
        | { color?: never; icon?: React.ReactNode }
        | { color?: never; icon?: never }
    );

export function DataListItem({
    className,
    color,
    label,
    value,
    render,
    icon,
    ...props
}: DataListItemProps) {
    const defaultProps = {
        children: (
            <>
                <dt className="flex min-w-0 items-center gap-1.5 text-foreground">
                    {color ? (
                        <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                        />
                    ) : (
                        (icon ?? null)
                    )}
                    <span className="min-w-0 truncate">{label}</span>
                </dt>
                <dd className="text-foreground tabular-nums">{value}</dd>
            </>
        ),
        className: cn(
            "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-xs",
            className
        ),
        "data-slot": "data-list-item",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}
