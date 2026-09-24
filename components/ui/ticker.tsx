"use client";

import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useMergedRefs } from "@base-ui/utils/useMergedRefs";
import { cn } from "cn";
import { useReducedMotion } from "motion/react";
import * as React from "react";

const DEFAULT_DURATION_SECONDS = 5;
const MAX_SPEED_PX_PER_SECOND = 92;

const DEFAULT_REPEAT_COUNT = 2;

function getDurationInSeconds(travelDistancePx: number) {
    if (travelDistancePx <= 0 || !Number.isFinite(travelDistancePx)) {
        return DEFAULT_DURATION_SECONDS;
    }
    const durationSeconds = travelDistancePx / MAX_SPEED_PX_PER_SECOND;
    // Round up to a centisecond so the marquee never exceeds the speed cap
    return Math.max(
        DEFAULT_DURATION_SECONDS,
        Math.ceil(durationSeconds * 100) / 100
    );
}

interface TickerProps extends React.ComponentProps<"span"> {
    direction?: "left" | "right";
}

export function Ticker({
    direction = "left",
    className,
    children,
    ref,
    ...props
}: TickerProps) {
    const prefersReducedMotion = useReducedMotion();
    const [contentWidthPx, setContentWidthPx] = React.useState(0);

    const containerRef = React.useRef<HTMLSpanElement | null>(null);
    const mergedRef = useMergedRefs(ref, containerRef);

    useIsoLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) {
            return;
        }

        const content = container.firstElementChild?.firstElementChild;
        if (!content) {
            return;
        }

        let _containerWidthPx = 0;
        let _contentWidthPx = 0;

        const resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const sizePx = entry.borderBoxSize[0].inlineSize;

                if (entry.target === container) {
                    _containerWidthPx = sizePx;
                } else {
                    _contentWidthPx = sizePx;
                }
            }

            setContentWidthPx(
                _contentWidthPx > _containerWidthPx ? _contentWidthPx : 0
            );
        });

        resizeObserver.observe(container);
        resizeObserver.observe(content);
        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    const isOverflowing = contentWidthPx > 0 && !prefersReducedMotion;

    const trackStyle = {
        "--animation-distance": `${-100 / DEFAULT_REPEAT_COUNT}%`,
        "--duration": `${getDurationInSeconds(contentWidthPx)}s`,
        ...(direction === "right"
            ? { animationDirection: "reverse" as const }
            : {}),
    } as React.CSSProperties;

    return (
        <span
            {...props}
            className={cn(
                "group inline-flex w-full min-w-0 overflow-clip",
                className
            )}
            ref={mergedRef}
        >
            <span
                className={cn(
                    "flex shrink-0 select-none",
                    isOverflowing &&
                        "paused group-hover:running hover:running group-hover:animate-marquee group-hover:delay-200"
                )}
                style={trackStyle}
            >
                <span className="shrink-0 p-px pr-4">{children}</span>
                {isOverflowing ? (
                    <span aria-hidden className="shrink-0 p-px pr-4" inert>
                        {children}
                    </span>
                ) : null}
            </span>
        </span>
    );
}
