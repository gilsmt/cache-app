"use client";

import type { BaseUIEvent } from "@base-ui/react";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { useReducedMotion } from "motion/react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { getOwnerWindow } from "@/lib/common/dom";

const SCROLL_THRESHOLD = 800;

function subscribe(callbackFn: () => void) {
    const ownerWindow = getOwnerWindow();
    ownerWindow.addEventListener("scroll", callbackFn, { passive: true });
    return () => ownerWindow.removeEventListener("scroll", callbackFn);
}

function getSnapshot() {
    return getOwnerWindow().scrollY > SCROLL_THRESHOLD;
}

function getServerSnapshot() {
    return false;
}

export function BackToTopButton({
    className,
    onClick,
    size = "sm",
    ...props
}: React.ComponentProps<typeof Button>) {
    const prefersReducedMotion = useReducedMotion();
    const isVisible = React.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
    );

    const scrollToTop = useStableCallback(
        (event: BaseUIEvent<React.MouseEvent<HTMLButtonElement>>) => {
            onClick?.(event);
            if (event.defaultPrevented) {
                return;
            }
            getOwnerWindow().scrollTo({
                behavior: prefersReducedMotion ? "auto" : "smooth",
                top: 0,
            });
        }
    );

    return (
        <div
            className={cn(
                "fixed right-8 bottom-8 z-40 transition-opacity duration-300",
                !isVisible && "pointer-events-none opacity-0",
                className
            )}
            data-slot="back-to-top-button"
            inert={!isVisible || undefined}
        >
            <Button
                {...props}
                aria-label="Back to top"
                onClick={scrollToTop}
                size={size}
            />
        </div>
    );
}
