"use client";

import { Progress as ProgressPrimitive } from "@base-ui/react/progress";
import { cn } from "cn";

function Progress({
    className,
    children,
    value,
    ...props
}: ProgressPrimitive.Root.Props) {
    return (
        <ProgressPrimitive.Root
            {...props}
            className={cn("flex max-w-full flex-wrap gap-2", className)}
            data-slot="progress"
            value={value}
        >
            {children}
            <ProgressTrack>
                <ProgressIndicator />
            </ProgressTrack>
        </ProgressPrimitive.Root>
    );
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
    return (
        <ProgressPrimitive.Track
            {...props}
            className={cn(
                "bg-muted relative flex h-1 w-full items-center overflow-x-clip rounded-full",
                className
            )}
            data-slot="progress-track"
        />
    );
}

function ProgressIndicator({
    className,
    ...props
}: ProgressPrimitive.Indicator.Props) {
    return (
        <ProgressPrimitive.Indicator
            {...props}
            className={cn(
                "bg-primary h-full transition-all duration-500",
                className
            )}
            data-slot="progress-indicator"
        />
    );
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
    return (
        // biome-ignore lint/a11y/noLabelWithoutControl: Wrong error
        <ProgressPrimitive.Label
            {...props}
            className={cn("text-sm font-medium", className)}
            data-slot="progress-label"
        />
    );
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
    return (
        <ProgressPrimitive.Value
            {...props}
            className={cn(
                "text-muted-foreground ml-auto text-right text-sm tabular-nums",
                className
            )}
            data-slot="progress-value"
        />
    );
}

export {
    Progress,
    ProgressIndicator,
    ProgressLabel,
    ProgressTrack,
    ProgressValue,
};
