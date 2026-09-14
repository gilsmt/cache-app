"use client";

import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn } from "cn";
import type * as React from "react";

export function Avatar({ className, ...props }: AvatarPrimitive.Root.Props) {
    return (
        <AvatarPrimitive.Root
            {...props}
            className={cn(
                "inline-flex size-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-background align-middle font-medium text-xs",
                className
            )}
            data-slot="avatar"
        />
    );
}

export function AvatarImage({
    className,
    ...props
}: AvatarPrimitive.Image.Props) {
    return (
        <AvatarPrimitive.Image
            {...props}
            className={cn("size-full object-cover", className)}
            data-slot="avatar-image"
        />
    );
}

export function AvatarFallback({
    className,
    ...props
}: AvatarPrimitive.Fallback.Props) {
    return (
        <AvatarPrimitive.Fallback
            {...props}
            className={cn(
                "flex size-full items-center justify-center rounded-full bg-muted",
                className
            )}
            data-slot="avatar-fallback"
        />
    );
}

export function AvatarGroup({
    className,
    ...props
}: React.ComponentProps<"div">) {
    return (
        <div
            {...props}
            className={cn(
                "relative flex items-center justify-center -space-x-3",
                className
            )}
            data-slot="avatar-group"
        />
    );
}
