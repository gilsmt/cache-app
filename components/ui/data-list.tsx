"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { ChevronDown } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import {
    StackedBarChart,
    type StackedBarChartSegment,
} from "@/components/ui/stacked-bar-chart";

const FULL_WIDTH_BLEED = "-mx-2.5 w-[calc(100%+(--spacing(5)))]";

export function DataList({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn(
            "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-1.5 [&>*]:col-span-2",
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
                "group col-span-2 flex min-h-8 pointer-coarse:min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-left text-muted-foreground text-xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background sm:min-h-7",
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
                "col-span-2 grid min-w-0 grid-cols-subgrid gap-3",
                className
            )}
        />
    );
}

export function DataListGroup({
    className,
    render,
    ...props
}: useRender.ComponentProps<"ul">) {
    const defaultProps = {
        className: cn(
            "col-span-2 m-0 mt-1.5 grid min-w-0 list-none grid-cols-subgrid gap-x-3 gap-y-2 p-0 pb-1.5",
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

export function DataListItem({
    className,
    children,
    render,
    ...props
}: useRender.ComponentProps<"li">) {
    const defaultProps = {
        children: (
            <dl className="col-span-2 grid grid-cols-subgrid items-center gap-x-3 text-sm sm:text-xs">
                {children}
            </dl>
        ),
        className: cn(
            "col-span-2 grid min-w-0 list-none grid-cols-subgrid",
            className
        ),
        "data-slot": "data-list-item",
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
        className: cn("flex min-w-0 items-center text-foreground", className),
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
            "flex min-w-0 items-center justify-start gap-1.5 text-left text-foreground tabular-nums [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
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
                    "flex shrink-0 justify-start font-normal text-muted-foreground text-xs!",
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
