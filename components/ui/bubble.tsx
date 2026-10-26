import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type * as React from "react";
import { cva, type VariantProps } from "@/components/ui/cva";

export function BubbleGroup({
    className,
    ...props
}: React.ComponentProps<"div">) {
    return (
        <div
            {...props}
            className={cn("flex min-w-0 flex-col gap-2", className)}
            data-slot="bubble-group"
        />
    );
}

const bubbleVariants = cva({
    base: "group/bubble relative flex w-fit max-w-[80%] min-w-0 flex-col gap-1 group-data-[align=end]/message:self-end data-[align=end]:self-end data-[variant=ghost]:max-w-full",
    defaultVariants: {
        variant: "default",
    },
    variants: {
        variant: {
            default:
                "*:data-[slot=bubble-content]:bg-primary *:data-[slot=bubble-content]:text-primary-foreground [&>[data-slot=bubble-content]:is(button,a):hover]:bg-primary/80",
            destructive:
                "*:data-[slot=bubble-content]:bg-destructive/10 *:data-[slot=bubble-content]:text-destructive dark:*:data-[slot=bubble-content]:bg-destructive/20 [&>[data-slot=bubble-content]:is(button,a):hover]:bg-destructive/20 dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-destructive/30",
            ghost: "[&>[data-slot=bubble-content]:is(button,a):hover]:bg-muted [&>[data-slot=bubble-content]:is(button,a):hover]:text-foreground dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-muted/50 border-none *:data-[slot=bubble-content]:rounded-none *:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:p-0",
            muted: "*:data-[slot=bubble-content]:bg-muted [&>[data-slot=bubble-content]:is(button,a):hover]:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)]",
            outline:
                "*:data-[slot=bubble-content]:border-border *:data-[slot=bubble-content]:bg-background [&>[data-slot=bubble-content]:is(button,a):hover]:bg-muted [&>[data-slot=bubble-content]:is(button,a):hover]:text-foreground dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-input/30",
            secondary:
                "*:data-[slot=bubble-content]:bg-secondary *:data-[slot=bubble-content]:text-secondary-foreground [&>[data-slot=bubble-content]:is(button,a):hover]:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]",
            tinted: "*:data-[slot=bubble-content]:text-foreground *:data-[slot=bubble-content]:bg-[oklch(from_var(--primary)_0.93_calc(c*0.4)_h)] dark:*:data-[slot=bubble-content]:bg-[oklch(from_var(--primary)_0.3_calc(c*0.4)_h)] [&>[data-slot=bubble-content]:is(button,a):hover]:bg-[oklch(from_var(--primary)_0.88_calc(c*0.5)_h)] dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-[oklch(from_var(--primary)_0.35_calc(c*0.5)_h)]",
        },
    },
});

export function Bubble({
    variant = "default",
    align = "start",
    className,
    ...props
}: React.ComponentProps<"div"> &
    VariantProps<typeof bubbleVariants> & {
        align?: "start" | "end";
    }) {
    return (
        <div
            {...props}
            className={cn(bubbleVariants({ variant }), className)}
            data-align={align}
            data-slot="bubble"
            data-variant={variant}
        />
    );
}

export function BubbleContent({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn(
            "squircle [button,a]:focus-visible:border-ring [button,a]:focus-visible:ring-ring/30 w-fit max-w-full min-w-0 overflow-hidden rounded-3xl border border-transparent px-3.5 py-2.5 text-sm leading-relaxed wrap-break-word group-data-[align=end]/bubble:self-end [button]:text-left [button,a]:outline-none [button,a]:focus-visible:ring-3",
            className
        ),
        "data-slot": "bubble-content",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

const bubbleReactionsVariants = cva({
    base: "bg-muted ring-card absolute z-10 flex w-fit shrink-0 items-center justify-center gap-1 rounded-full px-1.5 py-0.5 text-sm ring-3 has-[button]:p-0",
    defaultVariants: {
        align: "end",
        side: "bottom",
    },
    variants: {
        align: {
            end: "right-3",
            start: "left-3",
        },
        side: {
            bottom: "bottom-0 translate-y-3/4",
            top: "top-0 -translate-y-3/4",
        },
    },
});

export function BubbleReactions({
    side = "bottom",
    align = "end",
    className,
    ...props
}: React.ComponentProps<"div"> & {
    align?: "start" | "end";
    side?: "top" | "bottom";
}) {
    return (
        <div
            {...props}
            className={cn(bubbleReactionsVariants({ align, side }), className)}
            data-align={align}
            data-side={side}
            data-slot="bubble-reactions"
        />
    );
}
