"use client";

import type { BaseUIEvent } from "@base-ui/react";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { useReducedMotion } from "motion/react";
import * as React from "react";
import { Button } from "@/components/ui/button";

const SCROLL_STICK_DISTANCE_PX = 80;

function isScrolledAway(viewport: HTMLElement, distancePx: number): boolean {
    return (
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight >=
        distancePx
    );
}

interface ScrollToBottomButtonProps
    extends React.ComponentProps<typeof Button> {
    onStickChange?: (shouldStick: boolean) => void;
    stickDistancePx?: number;
    viewportRef: React.RefObject<HTMLElement | null>;
}

export function ScrollToBottomButton({
    className,
    onClick,
    size = "icon-sm",
    variant = "secondary",
    viewportRef,
    stickDistancePx = SCROLL_STICK_DISTANCE_PX,
    onStickChange,
    ...props
}: ScrollToBottomButtonProps) {
    const prefersReducedMotion = useReducedMotion();
    const [isVisible, setIsVisible] = React.useState(false);
    const onStickChangeRef = React.useRef(onStickChange);

    React.useEffect(() => {
        onStickChangeRef.current = onStickChange;
    });

    React.useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) {
            return;
        }
        const updateStickState = () => {
            const isAway = isScrolledAway(viewport, stickDistancePx);
            setIsVisible(isAway);
            onStickChangeRef.current?.(!isAway);
        };
        updateStickState();
        viewport.addEventListener("scroll", updateStickState, {
            passive: true,
        });
        return () => viewport.removeEventListener("scroll", updateStickState);
    }, [viewportRef, stickDistancePx]);

    const scrollToBottom = useStableCallback(
        (event: BaseUIEvent<React.MouseEvent<HTMLButtonElement>>) => {
            onClick?.(event);
            if (event.defaultPrevented) {
                return;
            }
            const viewport = viewportRef.current;
            if (!viewport) {
                return;
            }
            onStickChangeRef.current?.(true);
            setIsVisible(false);
            viewport.scrollTo({
                behavior: prefersReducedMotion ? "auto" : "smooth",
                top: viewport.scrollHeight,
            });
        }
    );

    return (
        <div
            className={cn(
                "absolute bottom-4 left-1/2 -translate-x-1/2 transition-opacity duration-300",
                !isVisible && "pointer-events-none opacity-0",
                className
            )}
            data-slot="scroll-to-bottom-button"
            inert={!isVisible || undefined}
        >
            <Button
                aria-label="Scroll to bottom"
                {...props}
                className="shadow-md/5"
                onClick={scrollToBottom}
                size={size}
                variant={variant}
            />
        </div>
    );
}
