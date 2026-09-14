"use client";

import { useAnimationFrame } from "@base-ui/utils/useAnimationFrame";
import { cn } from "cn";
import { useReducedMotion } from "motion/react";
import * as React from "react";

const DEFAULT_COLORS = [
    "#ff3b30",
    "#ff5e5b",
    "#ff8c42",
    "#ffd166",
    "#ff6fb5",
    "#c77dff",
];

const FRAME_DURATION_MS = 16.6667;
const GRADIENT_PROGRESS_INITIAL = -25;
const GRADIENT_PROGRESS_RANGE = 200;
const MAX_FRAME_DELTA_MS = 64;

type Align = "left" | "center" | "right";

const JUSTIFY_CONTENT_BY_ALIGN: Record<
    Align,
    React.CSSProperties["justifyContent"]
> = {
    center: "center",
    left: "flex-start",
    right: "flex-end",
};

interface GradientWaveContainerStyle extends React.CSSProperties {
    "--gi": number;
}

function buildGradientColorStops(
    colors: string[],
    bandCount: number,
    bandGap: number
): string {
    const baseColor = "var(--gradient-wave-base, rgb(29,29,31))";
    const colorStop = (color: string, offset: number) =>
        `${color} calc((var(--gi) + ${offset}) * 1%)`;
    const bandColors = [...colors, ...colors].slice(0, bandCount);

    return [
        colorStop(baseColor, 0),
        ...bandColors.map((color, index) =>
            colorStop(color, (index + 2) * bandGap)
        ),
        colorStop(baseColor, (bandColors.length + 2) * bandGap),
    ].join(", ");
}

function now(): number {
    return globalThis.performance.now();
}

interface GradientWaveTextProps {
    align?: Align;
    ariaLabel: string;
    bandCount?: number;
    bandGap?: number;
    bottomOffset?: number;
    children?: React.ReactNode;
    className?: string;
    customColors?: string[];
    delay?: number;
    speed?: number;
}

export function GradientWaveText({
    children,
    align = "left",
    className,
    speed = 1.6,
    delay = 0,
    bottomOffset = 20,
    bandGap = 5,
    bandCount = 8,
    customColors,
    ariaLabel,
}: GradientWaveTextProps) {
    const prefersReducedMotion = useReducedMotion();
    const animationFrame = useAnimationFrame();

    const elementRef = React.useRef<HTMLDivElement | null>(null);
    const timeRef = React.useRef(0);
    const cyclesDoneRef = React.useRef(0);
    const finishedRef = React.useRef(false);
    const startedRef = React.useRef(false);
    const startAtRef = React.useRef(0);

    const colorStops = buildGradientColorStops(
        customColors?.length ? customColors : DEFAULT_COLORS,
        bandCount,
        bandGap
    );
    const backgroundImageGradient = `radial-gradient(circle at left top, ${colorStops})`;

    React.useEffect(() => {
        const node = elementRef.current;
        if (!node) {
            return;
        }
        timeRef.current = GRADIENT_PROGRESS_INITIAL;
        cyclesDoneRef.current = 0;
        finishedRef.current = false;
        startedRef.current = false;
        startAtRef.current = now() + Math.max(0, delay * 1000);
        node.style.setProperty("--gi", String(GRADIENT_PROGRESS_INITIAL));
    }, [delay]);

    React.useEffect(() => {
        const node = elementRef.current;
        if (!node) {
            return;
        }

        if (prefersReducedMotion) {
            timeRef.current = GRADIENT_PROGRESS_RANGE;
            node.style.setProperty("--gi", String(GRADIENT_PROGRESS_RANGE));
            return;
        }

        let last = now();

        const tick = () => {
            const now_ = now();
            if (finishedRef.current) {
                return;
            }

            if (!startedRef.current) {
                if (now_ >= startAtRef.current) {
                    startedRef.current = true;
                    last = now_;
                } else {
                    animationFrame.request(tick);
                    return;
                }
            }

            const dt = Math.min(MAX_FRAME_DELTA_MS, now_ - last);
            last = now_;

            const increment = (dt * speed) / FRAME_DURATION_MS;
            let next = timeRef.current + increment;

            while (
                next >= GRADIENT_PROGRESS_RANGE &&
                cyclesDoneRef.current < 1
            ) {
                next -= GRADIENT_PROGRESS_RANGE;
                cyclesDoneRef.current += 1;
            }

            if (cyclesDoneRef.current >= 1) {
                timeRef.current = GRADIENT_PROGRESS_RANGE;
                node.style.setProperty("--gi", String(GRADIENT_PROGRESS_RANGE));
                finishedRef.current = true;
                return;
            }
            timeRef.current = next;
            node.style.setProperty("--gi", String(next));

            animationFrame.request(tick);
        };

        animationFrame.request(tick);

        return animationFrame.cancel;
    }, [animationFrame, prefersReducedMotion, speed]);

    const spanStyle: React.CSSProperties = {
        backfaceVisibility: "hidden",
        backgroundClip: "text",
        backgroundImage: backgroundImageGradient,
        color: "transparent",
        display: "inline-block",
        MozOsxFontSmoothing: "grayscale",
        marginBottom: `-${bottomOffset}%`,
        marginInline: -1,
        paddingBottom: `${bottomOffset}%`,
        paddingInline: 1,
        textAlign: align,
        transform: "translateZ(0)",
        WebkitBackfaceVisibility: "hidden",
        WebkitBackgroundClip: "text",
        WebkitFontSmoothing: "antialiased",
        WebkitTextFillColor: "transparent",
    };

    const containerStyle: GradientWaveContainerStyle = {
        "--gi": GRADIENT_PROGRESS_INITIAL,
        justifyContent: JUSTIFY_CONTENT_BY_ALIGN[align],
    };

    return (
        <div
            aria-label={ariaLabel}
            className={cn(
                "flex size-full items-center overflow-clip",
                className
            )}
            ref={elementRef}
            role="img"
            style={containerStyle}
        >
            <span style={spanStyle}>{children}</span>
        </div>
    );
}
