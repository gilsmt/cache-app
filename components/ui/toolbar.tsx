"use client";

import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar";
import { cn } from "cn";
import type * as React from "react";

export function Toolbar({
    className,
    ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Root>) {
    return (
        <ToolbarPrimitive.Root
            {...props}
            className={cn(
                "relative flex w-full items-center justify-between gap-2",
                className
            )}
        />
    );
}

export function ToolbarGroup({
    className,
    ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Group>) {
    return (
        <ToolbarPrimitive.Group
            {...props}
            className={cn("flex items-center gap-1 text-nowrap", className)}
        />
    );
}

export function ToolbarButton({
    className,
    ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Button>) {
    return (
        <ToolbarPrimitive.Button
            {...props}
            className={cn(
                "hover:bg-accent focus-visible:ring-ring inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none select-none focus-visible:ring-2 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className
            )}
        />
    );
}
