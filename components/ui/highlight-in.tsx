"use client";

import { cn } from "cn";
import { motion } from "motion/react";
import type * as React from "react";

const FADE_IN_DURATION_SECONDS = 0.5;
const STAY_DURATION_SECONDS = 1.5;
const FADE_OUT_DURATION_SECONDS = 0.3;

interface HighlightInProps
    extends Omit<
        React.ComponentProps<typeof motion.span>,
        "animate" | "initial" | "transition" | "inert"
    > {
    delay?: number;
    shouldFadeOut?: boolean;
}

export function HighlightIn({
    className,
    delay = 0,
    shouldFadeOut = true,
    ...props
}: HighlightInProps) {
    const totalSeconds =
        FADE_IN_DURATION_SECONDS +
        STAY_DURATION_SECONDS +
        (shouldFadeOut ? FADE_OUT_DURATION_SECONDS : 0);
    const fadeInEndTime = FADE_IN_DURATION_SECONDS / totalSeconds;
    const stayEndTime =
        (FADE_IN_DURATION_SECONDS + STAY_DURATION_SECONDS) / totalSeconds;

    return (
        <motion.span
            {...props}
            animate={{ opacity: shouldFadeOut ? [0, 1, 1, 0] : [0, 1, 1] }}
            className={cn("pointer-events-none select-none", className)}
            inert
            initial={{ opacity: 0 }}
            transition={{
                delay,
                duration: totalSeconds,
                ease: shouldFadeOut
                    ? ["easeInOut", "linear", "easeInOut"]
                    : ["easeInOut", "linear"],
                times: shouldFadeOut
                    ? [0, fadeInEndTime, stayEndTime, 1]
                    : [0, fadeInEndTime, stayEndTime],
            }}
        />
    );
}
