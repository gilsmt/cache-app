"use client";

import { cn } from "cn";
import type * as React from "react";
import { formatSharePercent } from "@/lib/common/number";

export interface StackedBarChartSegment {
    color: string;
    key: string;
    label: string;
    value: number;
}

function buildStackedBarAriaLabel(
    segments: readonly StackedBarChartSegment[],
    total: number
): string {
    return segments
        .map((segment) => {
            const percent = formatSharePercent(segment.value, total);
            return `${segment.label} ${segment.value} (${percent})`;
        })
        .join(", ");
}

interface StackedBarChartProps extends React.ComponentProps<"div"> {
    segments: readonly StackedBarChartSegment[];
}

export function StackedBarChart({
    className,
    segments,
    ...props
}: StackedBarChartProps) {
    const visibleSegments = segments.filter(
        (segment) => Number.isFinite(segment.value) && segment.value > 0
    );
    const total = visibleSegments.reduce(
        (sum, segment) => sum + segment.value,
        0
    );
    const isEmpty = visibleSegments.length === 0;

    return (
        // biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is "img" exactly when aria-label is set
        <div
            {...props}
            aria-hidden={isEmpty}
            aria-label={
                isEmpty
                    ? undefined
                    : buildStackedBarAriaLabel(visibleSegments, total)
            }
            className={cn(
                "h-2 w-full overflow-hidden rounded-full bg-muted",
                !isEmpty && "flex",
                className
            )}
            data-slot="stacked-bar-chart"
            role={isEmpty ? undefined : "img"}
        >
            {visibleSegments.map((segment, index) => {
                const isFirst = index === 0;
                const isLast = index === visibleSegments.length - 1;

                return (
                    <div
                        className={cn(
                            "min-w-0 transition-[flex-grow] ease-out",
                            isFirst && "rounded-s-full",
                            isLast && "rounded-e-full"
                        )}
                        key={segment.key}
                        style={{
                            backgroundColor: segment.color,
                            flexBasis: 0,
                            flexGrow: segment.value,
                        }}
                        title={`${segment.label}: ${segment.value} (${formatSharePercent(segment.value, total)})`}
                    />
                );
            })}
        </div>
    );
}
