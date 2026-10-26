"use client";

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "cn";
import * as React from "react";
import { cva, type VariantProps } from "@/components/ui/cva";
import { Spinner } from "@/components/ui/spinner";

export const buttonVariants = cva({
    base: "focus-visible:ring-ring focus-visible:ring-offset-background relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border text-base font-medium text-nowrap transition-shadow outline-none select-none before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] focus-visible:ring-2 focus-visible:ring-offset-1 data-disabled:pointer-events-none data-disabled:opacity-64 data-loading:text-transparent sm:text-sm pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='opacity-'])]:opacity-80 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg:not([data-slot=spinner])]:-mx-0.5",
    defaultVariants: {
        size: "default",
        variant: "default",
    },
    variants: {
        size: {
            default: "h-9 px-[calc(--spacing(3)-1px)] sm:h-8",
            icon: "size-9 sm:size-8",
            "icon-lg": "size-10 sm:size-9",
            "icon-sm": "size-8 sm:size-7",
            "icon-xl":
                "size-11 sm:size-10 [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
            "icon-xs":
                "size-7 rounded-md before:rounded-[calc(var(--radius-md)-1px)] sm:size-6 not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-4 sm:not-in-data-[slot=input-group]:[&_svg:not([class*='size-'])]:size-3.5",
            lg: "h-10 px-[calc(--spacing(3.5)-1px)] sm:h-9",
            sm: "h-8 gap-1.5 px-[calc(--spacing(2.5)-1px)] sm:h-7",
            xl: "h-11 px-[calc(--spacing(4)-1px)] text-lg sm:h-10 sm:text-base [&_svg:not([class*='size-'])]:size-5 sm:[&_svg:not([class*='size-'])]:size-4.5",
            xs: "h-7 gap-1 rounded-md px-[calc(--spacing(2)-1px)] text-sm before:rounded-[calc(var(--radius-md)-1px)] sm:h-6 sm:text-xs [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5",
        },
        variant: {
            default:
                "border-primary bg-primary text-primary-foreground shadow-primary/24 hover:bg-primary/90 data-pressed:bg-primary/90 *:data-[slot=spinner]:text-primary-foreground shadow-xs not-data-disabled:inset-shadow-[0_1px_--theme(--color-white/16%)] [:active,[data-pressed]]:inset-shadow-[0_1px_--theme(--color-black/8%)] [[data-disabled],:active,[data-pressed]]:shadow-none",
            destructive:
                "bg-destructive/10 text-destructive hover:bg-destructive/15 data-pressed:bg-destructive/15 *:data-[slot=spinner]:text-destructive border-none not-data-disabled:inset-shadow-[0_1px_--theme(--color-white/16%)] [:active,[data-pressed]]:inset-shadow-[0_1px_--theme(--color-black/8%)] [[data-disabled],:active,[data-pressed]]:shadow-none",
            "destructive-outline":
                "border-input bg-popover text-destructive-foreground hover:border-destructive/32 hover:bg-destructive/4 data-pressed:border-destructive/32 data-pressed:bg-destructive/4 *:data-[slot=spinner]:text-foreground dark:bg-input/32 shadow-xs/5 not-dark:bg-clip-padding not-data-disabled:not-active:not-data-pressed:before:shadow-[0_1px_--theme(--color-black/4%)] dark:not-data-disabled:before:shadow-[0_-1px_--theme(--color-white/2%)] dark:not-data-disabled:not-active:not-data-pressed:before:shadow-[0_-1px_--theme(--color-white/6%)] [[data-disabled],:active,[data-pressed]]:shadow-none",
            ghost: "text-foreground hover:bg-accent data-pressed:bg-accent *:data-[slot=spinner]:text-foreground border-transparent",
            link: "text-foreground *:data-[slot=spinner]:text-foreground border-transparent underline-offset-2 hover:underline data-pressed:underline",
            outline:
                "border-input bg-popover text-foreground hover:bg-accent/50 data-pressed:bg-accent/50 *:data-[slot=spinner]:text-foreground dark:bg-input/32 dark:data-pressed:bg-input/64 dark:hover:bg-input/64 shadow-xs/5 not-dark:bg-clip-padding not-data-disabled:not-active:not-data-pressed:before:shadow-[0_1px_--theme(--color-black/4%)] dark:not-data-disabled:before:shadow-[0_-1px_--theme(--color-white/2%)] dark:not-data-disabled:not-active:not-data-pressed:before:shadow-[0_-1px_--theme(--color-white/6%)] [[data-disabled],:active,[data-pressed]]:shadow-none",
            secondary:
                "bg-secondary text-secondary-foreground hover:bg-secondary/90 data-pressed:bg-secondary/90 *:data-[slot=spinner]:text-secondary-foreground [:active,[data-pressed]]:bg-secondary/80 border-transparent",
        },
    },
});

function getLabelledBy(
    hasAriaLabel: boolean,
    ariaLabelledby: string | undefined,
    labelId: string
): string | undefined {
    if (hasAriaLabel) {
        return ariaLabelledby;
    }
    if (ariaLabelledby) {
        return `${ariaLabelledby} ${labelId}`;
    }
    return labelId;
}

export interface ButtonProps
    extends ButtonPrimitive.Props,
        VariantProps<typeof buttonVariants> {
    isLoading?: boolean;
}

export function Button({
    className,
    variant,
    size,
    children,
    isLoading = false,
    disabled,
    focusableWhenDisabled,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledby,
    "aria-busy": ariaBusy,
    ...props
}: ButtonProps) {
    const labelId = React.useId();
    const hasAriaLabel = typeof ariaLabel !== "undefined";

    const labelledBy = getLabelledBy(hasAriaLabel, ariaLabelledby, labelId);

    return (
        <ButtonPrimitive
            {...props}
            aria-busy={ariaBusy ?? (isLoading ? true : undefined)}
            aria-label={ariaLabel}
            aria-labelledby={labelledBy}
            className={cn(buttonVariants({ className, size, variant }))}
            data-loading={isLoading ? "" : undefined}
            data-slot="button"
            disabled={!!(isLoading || disabled)}
            focusableWhenDisabled={focusableWhenDisabled ?? isLoading}
        >
            {hasAriaLabel ? (
                children
            ) : (
                <span
                    className="inline-flex min-w-0 items-center justify-center"
                    id={labelId}
                    style={{ gap: "inherit" }}
                >
                    {children}
                </span>
            )}
            {isLoading ? (
                <Spinner
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                />
            ) : null}
        </ButtonPrimitive>
    );
}
