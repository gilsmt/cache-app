"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type * as React from "react";
import {
    StackedBarChart,
    type StackedBarChartSegment,
} from "@/components/ui/stacked-bar-chart";

export function DataList({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn(
            "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 [&>*]:col-span-2",
            className
        ),
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

export function DataListChart({ className, ...props }: DataListChartProps) {
    return (
        <StackedBarChart
            {...props}
            className={cn("col-span-2", className)}
            data-slot="data-list-chart"
        />
    );
}

export function DataListHeader({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn("flex flex-col gap-1", className),
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
        className: cn("font-medium text-muted-foreground text-xs", className),
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
        className: cn(
            "col-span-2 grid min-w-0 grid-cols-subgrid gap-3",
            className
        ),
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
        className: cn(
            "col-span-2 mt-1.5 grid grid-cols-subgrid gap-x-3 gap-y-1.5",
            className
        ),
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
                <dt className="flex min-w-0 items-center text-foreground">
                    <span className="min-w-0 truncate">{label}</span>
                </dt>
                <dd className="flex items-center justify-start gap-1.5 text-left text-foreground tabular-nums [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5">
                    <span className="flex size-4 shrink-0 items-center justify-center sm:size-3.5">
                        {color ? (
                            <span
                                aria-hidden
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: color }}
                            />
                        ) : (
                            (icon ?? null)
                        )}
                    </span>
                    <span className="text-left">{value}</span>
                </dd>
            </>
        ),
        className: cn(
            "col-span-2 grid grid-cols-subgrid items-center gap-x-3 text-sm sm:text-xs",
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
