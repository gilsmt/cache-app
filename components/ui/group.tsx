"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type * as React from "react";
import { cva, type VariantProps } from "@/components/ui/cva";
import { Separator } from "@/components/ui/separator";

const groupVariants = cva({
    base: "dark:*:[[data-slot=separator]:has(~button:hover):not(:has(~[data-slot=separator]~[data-slot]:hover)),[data-slot=separator]:has(~[data-slot][data-pressed]):not(:has(~[data-slot=separator]~[data-slot][data-pressed]))]:before:bg-input/64 dark:*:[button:hover~[data-slot=separator]:not([data-slot]:hover~[data-slot=separator]~[data-slot=separator]),[data-slot][data-pressed]~[data-slot=separator]:not([data-slot][data-pressed]~[data-slot=separator]~[data-slot=separator])]:before:bg-input/64 relative flex w-fit *:focus-visible:z-1 *:has-focus-visible:z-1 has-[>[data-slot=group]]:gap-2",
    defaultVariants: {
        orientation: "horizontal",
    },
    variants: {
        orientation: {
            horizontal:
                "*:data-slot:has-[~[data-slot]]:rounded-e-none *:data-slot:has-[~[data-slot]]:border-e-0 *:data-slot:has-[~[data-slot]]:before:rounded-e-none *:data-slot:not-data-[slot=separator]:has-[~[data-slot]]:before:-end-[0.5px] *:pointer-coarse:after:min-w-auto *:[[data-slot]~[data-slot]]:rounded-s-none *:[[data-slot]~[data-slot]]:border-s-0 *:[[data-slot]~[data-slot]]:before:rounded-s-none *:[[data-slot]~[data-slot]:not([data-slot=separator])]:before:-start-[0.5px]",
            vertical:
                "flex-col *:data-slot:has-[~[data-slot]]:rounded-b-none *:data-slot:has-[~[data-slot]]:border-b-0 *:data-slot:has-[~[data-slot]]:before:rounded-b-none *:data-slot:not-data-[slot=separator]:has-[~[data-slot]]:before:-bottom-[0.5px] *:data-slot:not-data-[slot=separator]:has-[~[data-slot]]:before:hidden dark:*:first:before:block dark:*:last:before:hidden *:pointer-coarse:after:min-h-auto *:[[data-slot]~[data-slot]]:rounded-t-none *:[[data-slot]~[data-slot]]:border-t-0 *:[[data-slot]~[data-slot]]:before:rounded-t-none *:[[data-slot]~[data-slot]:not([data-slot=separator])]:before:-top-[0.5px]",
        },
    },
});

interface GroupProps
    extends useRender.ComponentProps<"div">,
        VariantProps<typeof groupVariants> {}

export function Group({
    className,
    orientation,
    render,
    ...props
}: GroupProps) {
    const defaultProps = {
        className: cn(
            groupVariants({ orientation }),
            "[&>*:first-child]:rounded-s-full [&>*:last-child]:rounded-e-full",
            className
        ),
        "data-orientation": orientation,
        "data-slot": "group",
        role: "group",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

export function GroupText({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn(
            "border-input bg-muted text-muted-foreground dark:bg-input/64 relative inline-flex items-center gap-2 rounded-lg border px-[calc(--spacing(3)-1px)] text-base text-nowrap shadow-xs/5 transition-shadow outline-none not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] before:shadow-[0_1px_--theme(--color-black/6%)] sm:text-sm dark:before:shadow-[0_-1px_--theme(--color-white/6%)] [&_svg]:-mx-0.5 [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
            className
        ),
        "data-slot": "group-text",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

export function GroupSeparator({
    className,
    orientation = "vertical",
    ...props
}: React.ComponentProps<typeof Separator>) {
    return (
        <Separator
            {...props}
            className={cn(
                "bg-input has-[+[data-slot=input-control]:focus-within,+[data-slot=input-group]:focus-within,+[data-slot=select-trigger]:focus-visible+*,+[data-slot=number-field]:focus-within]:bg-ring dark:before:bg-input/32 [[data-slot=input-control]:focus-within+&,[data-slot=input-group]:focus-within+&,[data-slot=select-trigger]:focus-visible+*+&,[data-slot=number-field]:focus-within+&,[data-slot=number-field]:focus-within+input+&]:bg-ring pointer-events-none relative z-2 before:absolute before:inset-0 has-[+[data-slot=input-control]:focus-within,+[data-slot=input-group]:focus-within,+[data-slot=select-trigger]:focus-visible+*,+[data-slot=number-field]:focus-within]:translate-x-px [[data-slot=input-control]:focus-within+&,[data-slot=input-group]:focus-within+&,[data-slot=select-trigger]:focus-visible+*+&,[data-slot=number-field]:focus-within+input+&]:-translate-x-px",
                className
            )}
            orientation={orientation}
        />
    );
}
