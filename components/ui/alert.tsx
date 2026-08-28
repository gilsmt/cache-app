import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/common/cn";

const ALERT_ROLE_BY_VARIANT = {
    default: undefined,
    error: "alert",
    info: "status",
    success: "status",
    warning: "alert",
} as const;

const alertVariants = cva(
    "relative grid w-full items-center gap-x-2 gap-y-0.5 text-pretty rounded-xl px-3.5 py-2.5 text-foreground text-xs has-[>svg]:has-data-[slot=alert-action]:grid-cols-[calc(var(--spacing)*5)_1fr_auto] has-[>svg]:grid-cols-[calc(var(--spacing)*5)_1fr] has-data-[slot=alert-action]:grid-cols-[1fr_auto] [&>svg]:size-5",
    {
        defaultVariants: {
            variant: "default",
        },
        variants: {
            variant: {
                default:
                    "bg-muted/80 dark:bg-input/32 [&>svg]:text-muted-foreground",
                error: "bg-destructive/4 [&>svg]:text-destructive",
                info: "bg-info/4 [&>svg]:text-info",
                success: "bg-success/4 [&>svg]:text-success",
                warning: "bg-warning/4 [&>svg]:text-warning",
            },
        },
    }
);

export function Alert({
    className,
    variant,
    ...props
}: Omit<React.ComponentProps<"div">, "role"> &
    VariantProps<typeof alertVariants>) {
    return (
        <div
            {...props}
            className={cn(alertVariants({ variant }), className)}
            data-slot="alert"
            role={ALERT_ROLE_BY_VARIANT[variant ?? "default"]}
        />
    );
}

export function AlertTitle({
    className,
    ...props
}: React.ComponentProps<"div">) {
    return (
        <div
            {...props}
            className={cn(
                "font-medium text-foreground [svg~&]:col-start-2",
                className
            )}
            data-slot="alert-title"
        />
    );
}

export function AlertDescription({
    className,
    ...props
}: React.ComponentProps<"div">) {
    return (
        <div
            {...props}
            className={cn(
                "flex flex-col gap-2.5 text-muted-foreground [svg~&]:col-start-2",
                className
            )}
            data-slot="alert-description"
        />
    );
}

export function AlertAction({
    className,
    ...props
}: React.ComponentProps<"div">) {
    return (
        <div
            {...props}
            className={cn(
                "flex gap-1 max-sm:col-start-2 max-sm:mt-2 sm:row-start-1 sm:row-end-3 sm:self-center sm:[[data-slot=alert-description]~&]:col-start-2 sm:[[data-slot=alert-title]~&]:col-start-2 sm:[svg~&]:col-start-2 sm:[svg~[data-slot=alert-description]~&]:col-start-3 sm:[svg~[data-slot=alert-title]~&]:col-start-3",
                className
            )}
            data-slot="alert-action"
        />
    );
}
