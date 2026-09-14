"use client";

import { useAnimationFrame } from "@base-ui/utils/useAnimationFrame";
import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useMergedRefs } from "@base-ui/utils/useMergedRefs";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import {
    BlossomCarousel,
    BlossomNext,
    BlossomPrev,
} from "@blossom-carousel/react";
import { cn } from "cn";
import { useGT } from "gt-next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Group } from "@/components/ui/group";
import "@blossom-carousel/react/style.css";

type CarouselHandle = React.ComponentRef<typeof BlossomCarousel> | null;

interface CarouselContext {
    id: string;
}

const CarouselContext = React.createContext<CarouselContext | null>(null);

function useCarouselContext() {
    const context = React.use(CarouselContext);
    if (!context) {
        throw new Error(
            "Carousel sub-components must be used within a Carousel provider"
        );
    }
    return context;
}

interface UseCarouselScrollOverflowOptions {
    handleRef: React.RefObject<CarouselHandle>;
    isEnabled: boolean;
    resetKey: unknown;
}

function useCarouselScrollOverflow({
    handleRef,
    isEnabled,
    resetKey,
}: UseCarouselScrollOverflowOptions) {
    const animationFrame = useAnimationFrame();

    const updateOverflow = useStableCallback(() => {
        animationFrame.request(() => {
            const scrollableEl = handleRef.current?.element;
            if (!scrollableEl?.isConnected) {
                return;
            }
            const maxScrollLeft = Math.max(
                0,
                scrollableEl.scrollWidth - scrollableEl.clientWidth
            );
            const scrollLeft = Math.max(
                0,
                Math.min(scrollableEl.scrollLeft, maxScrollLeft)
            );
            scrollableEl.style.setProperty(
                "--carousel-overflow-x-start",
                `${scrollLeft}px`
            );
            scrollableEl.style.setProperty(
                "--carousel-overflow-x-end",
                `${maxScrollLeft - scrollLeft}px`
            );
        });
    });

    useIsoLayoutEffect(() => {
        if (!isEnabled) {
            return;
        }

        const scrollableElement = handleRef.current?.element;
        if (!scrollableElement) {
            return;
        }

        updateOverflow();

        scrollableElement.addEventListener("scroll", updateOverflow, {
            passive: true,
        });

        const resizeObserver =
            typeof ResizeObserver === "function"
                ? new ResizeObserver(updateOverflow)
                : null;
        resizeObserver?.observe(scrollableElement);

        return () => {
            resizeObserver?.disconnect();
            animationFrame.cancel();
            scrollableElement.removeEventListener("scroll", updateOverflow);
            scrollableElement.style.removeProperty(
                "--carousel-overflow-x-start"
            );
            scrollableElement.style.removeProperty("--carousel-overflow-x-end");
        };
    }, [isEnabled, resetKey]);
}

interface CarouselProps {
    children: React.ReactNode;
}

export function Carousel({ children }: CarouselProps) {
    const id = React.useId();
    const contextValue = { id };

    return <CarouselContext value={contextValue}>{children}</CarouselContext>;
}

interface CarouselPanelProps
    extends React.ComponentProps<typeof BlossomCarousel> {
    shouldScrollFade?: boolean;
    slideClassName?: string;
}

export function CarouselPanel({
    children,
    className,
    shouldScrollFade = false,
    slideClassName,
    ref,
    ...props
}: CarouselPanelProps) {
    const gt = useGT();
    const { id } = useCarouselContext();

    const handleRef = React.useRef<CarouselHandle>(null);
    const mergedRef = useMergedRefs(ref, handleRef);

    const slides = React.Children.toArray(children);

    useCarouselScrollOverflow({
        handleRef,
        isEnabled: shouldScrollFade,
        resetKey: slides.length,
    });

    return (
        <BlossomCarousel
            {...props}
            aria-roledescription="carousel"
            as="section"
            className={cn(
                "no-scrollbar relative w-full shrink-0 snap-x snap-mandatory scroll-smooth",
                shouldScrollFade &&
                    "mask-l-from-[calc(100%-min(var(--fade-size),var(--carousel-overflow-x-start)))] mask-r-from-[calc(100%-min(var(--fade-size),var(--carousel-overflow-x-end)))] scroll-px-[calc(var(--fade-size)/2)] [--fade-size:0.5rem]",
                className
            )}
            id={id}
            ref={mergedRef}
            role="region"
        >
            {slides.map((child, index) => {
                const childKey = React.isValidElement(child)
                    ? child.key
                    : undefined;
                return (
                    // biome-ignore lint/a11y/useSemanticElements: Group role
                    <section
                        aria-label={gt("{current} of {count}", {
                            count: slides.length,
                            current: index + 1,
                        })}
                        aria-roledescription="slide"
                        className={cn(
                            "inline-block shrink-0 snap-start",
                            slideClassName
                        )}
                        data-blossom-slide
                        key={childKey ?? index}
                        role="group"
                    >
                        {child}
                    </section>
                );
            })}
        </BlossomCarousel>
    );
}

export function CarouselControls() {
    const gt = useGT();
    const { id } = useCarouselContext();

    return (
        <Group>
            <Button
                className="rounded-full"
                render={
                    <BlossomPrev
                        aria-label={gt("Previous")}
                        disabled={undefined}
                        for={id}
                    >
                        <ChevronLeft
                            aria-hidden
                            className="size-5"
                            focusable="false"
                        />
                    </BlossomPrev>
                }
                size="icon"
                variant="secondary"
            />
            <Button
                className="rounded-full"
                render={
                    <BlossomNext
                        aria-label={gt("Next")}
                        disabled={undefined}
                        for={id}
                    >
                        <ChevronRight
                            aria-hidden
                            className="size-5"
                            focusable="false"
                        />
                    </BlossomNext>
                }
                size="icon"
                variant="secondary"
            />
        </Group>
    );
}
