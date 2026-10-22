"use client";

import type * as React from "react";
import { clamp } from "@/lib/common/number";

const ICON_VIEWBOX = 24;
const ICON_CENTER = 12;
const ICON_STROKE_WIDTH = 3;
const TRANSITION_DURATION_MS = 300;

interface RadialIconProps extends React.ComponentProps<"svg"> {
    size?: number;
    transitionDurationMs?: number;
    value: number;
}

export function RadialIcon({
    value,
    size = 10,
    transitionDurationMs = TRANSITION_DURATION_MS,
    "aria-label": ariaLabel,
    "aria-hidden": ariaHidden,
    role = "img",
    style,
    ...props
}: RadialIconProps) {
    const circumference = 2 * Math.PI * size;
    const dashOffset = circumference * (1 - clamp(value / 100, 0, 1));
    const isDecorative = ariaHidden === true || ariaHidden === "true";
    const label = ariaLabel ?? "Progress";

    return (
        <svg
            {...props}
            aria-hidden={isDecorative || undefined}
            aria-label={isDecorative ? undefined : label}
            height="20"
            role={isDecorative ? undefined : role}
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
