"use client";

import type * as React from "react";
import { clamp } from "@/lib/common/number";

const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 3;
const TRANSITION_DURATION_MS = 300;

interface ProgressCircleProps extends React.ComponentProps<"svg"> {
    size?: number;
    transitionDurationMs?: number;
    value: number;
}

export function ProgressCircle({
    value,
    size = 10,
    transitionDurationMs = TRANSITION_DURATION_MS,
    "aria-label": ariaLabel,
    "aria-hidden": ariaHidden,
    style,
    ...props
}: ProgressCircleProps) {
    const circumference = 2 * Math.PI * size;
    const _value = clamp(value, 0, 100);
    const dashOffset = circumference * (1 - _value / 100);
    const isDecorative = ariaHidden === true || ariaHidden === "true";
    const label = ariaLabel ?? "Progress";

    return (
        <svg
            {...props}
            aria-hidden={isDecorative || undefined}
            aria-label={isDecorative ? undefined : label}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={_value}
            height="20"
            role="progressbar"
            style={{ color: "currentcolor", ...style }}
            viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
            width="20"
        >
            <circle
                cx={ICON_CENTER}
                cy={ICON_CENTER}
                fill="none"
                opacity="0.25"
                r={size}
                stroke="currentColor"
                strokeWidth={ICON_STROKE_WIDTH}
            />
            <circle
                className="transition-[stroke-dashoffset] ease-out motion-reduce:transition-none"
                cx={ICON_CENTER}
                cy={ICON_CENTER}
                fill="none"
                r={size}
                stroke="var(--ring)"
                strokeLinecap="round"
                strokeWidth={ICON_STROKE_WIDTH}
                style={{
                    strokeDasharray: `${circumference} ${circumference}`,
                    strokeDashoffset: dashOffset,
                    transform: "rotate(-90deg)",
                    transformOrigin: "center",
                    transitionDuration: `${transitionDurationMs}ms`,
                }}
            />
        </svg>
    );
}
