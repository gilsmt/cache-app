import { cn } from "cn";
import type * as React from "react";
import { cva, type VariantProps } from "@/components/ui/cva";

const alertVariants = cva({
    base: "text-foreground relative grid w-full items-center gap-x-2 gap-y-0.5 rounded-xl px-3.5 py-2.5 text-xs text-pretty has-data-[slot=alert-action]:grid-cols-[1fr_auto] has-[>svg]:grid-cols-[calc(var(--spacing)*5)_1fr] has-[>svg]:has-data-[slot=alert-action]:grid-cols-[calc(var(--spacing)*5)_1fr_auto] [&>svg]:size-5",
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
});

const ALERT_STATUS_BY_VARIANT = {
    default: null,
    error: { "aria-live": "assertive", role: "alert" },
    info: { "aria-live": "polite", role: "status" },
    success: { "aria-live": "polite", role: "status" },
    warning: { "aria-live": "assertive", role: "alert" },
} as const satisfies Record<
    NonNullable<VariantProps<typeof alertVariants>["variant"]>,
    StatusContract | null
>;

interface StatusContract {
    "aria-live": "assertive" | "off" | "polite";
    role: "alert" | "status";
}

export function Alert({
    className,
    variant,
    "aria-live": ariaLive,
    ...props
}: Omit<React.ComponentProps<"div">, "role"> &
    VariantProps<typeof alertVariants>) {
    const defaultProps = {
        ...props,
        className: cn(alertVariants({ variant }), className),
        "data-slot": "alert",
    };
    const status = ALERT_STATUS_BY_VARIANT[variant ?? "default"];

    if (!status) {
        return <div {...defaultProps} aria-live={ariaLive} />;
    }

    return (
        <div
            {...defaultProps}
            aria-live={ariaLive ?? status["aria-live"]}
            role={status.role}
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
                "text-foreground font-medium [svg~&]:col-start-2",
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
                "text-muted-foreground flex flex-col gap-2.5 [svg~&]:col-start-2",
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
