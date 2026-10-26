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

interface StackedBarChartProps
    extends Omit<React.ComponentProps<"div">, "aria-hidden" | "role"> {
    isDecorative?: boolean;
    segments: readonly StackedBarChartSegment[];
}

export function StackedBarChart({
    className,
    isDecorative = false,
    segments,
    "aria-label": ariaLabel,
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
    const chartAriaLabel =
        isDecorative || isEmpty
            ? undefined
            : ariaLabel?.trim() ||
              buildStackedBarAriaLabel(visibleSegments, total);

    return (
        // biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is "img" exactly when aria-label is set
        <div
            {...props}
            aria-hidden={chartAriaLabel === undefined}
            aria-label={chartAriaLabel}
            className={cn(
                "bg-muted h-2 w-full overflow-hidden rounded-full",
                !isEmpty && "flex gap-px",
                className
            )}
            data-slot="stacked-bar-chart"
            role={chartAriaLabel === undefined ? undefined : "img"}
        >
            {visibleSegments.map((segment, index) => {
                const isFirst = index === 0;
                const isLast = index === visibleSegments.length - 1;

                return (
                    <div
                        className={cn(
                            "min-w-0 transition-[flex-grow] ease-out motion-reduce:transition-none",
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
