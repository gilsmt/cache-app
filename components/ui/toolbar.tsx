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
                "relative flex w-full items-center justify-between",
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
            className={cn(
                "pointer-events-none absolute right-1 flex items-center justify-end gap-1",
                className
            )}
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
                "pointer-events-auto opacity-80 hover:opacity-100",
                className
            )}
        />
    );
}
