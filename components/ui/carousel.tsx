"use client";

import {
    BlossomCarousel,
    type BlossomCarouselHandle,
    BlossomNext,
    BlossomPrev,
    useBlossomNavigation,
} from "@blossom-carousel/react";
import { cn } from "cn";
import { useGT } from "gt-next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useReducedMotion } from "motion/react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Group } from "@/components/ui/group";
import "@blossom-carousel/react/style.css";
import { RadialIcon } from "./radial-icon";

function runAfter(delayMs: number, callback: () => void): () => void {
    const timeoutId = setTimeout(callback, delayMs);
    return () => clearTimeout(timeoutId);
}

function scrollToSlide(carousel: HTMLElement | null, slideIndex: number): void {
    if (!carousel) {
        return;
    }

    const slide = carousel.querySelectorAll<HTMLElement>(
        "[data-blossom-slide]"
    )[slideIndex];
    if (!slide) {
        return;
    }

    const carouselRect = carousel.getBoundingClientRect();
    const slideRect = slide.getBoundingClientRect();

    carousel.scrollTo({
        behavior: "smooth",
        left: carousel.scrollLeft + slideRect.left - carouselRect.left,
    });
}

interface CarouselContext {
    containerRef: React.RefObject<BlossomCarouselHandle | null>;
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

interface CarouselProps {
    autoPlayMs?: number;
    children: React.ReactNode;
}

export function Carousel({ autoPlayMs, children }: CarouselProps) {
    const id = React.useId();
    const containerRef = React.useRef<BlossomCarouselHandle | null>(null);

    const contextValue = { containerRef, id };

    return (
        <CarouselContext value={contextValue}>
            {children}
            {autoPlayMs ? <CarouselAutoplay autoPlayMs={autoPlayMs} /> : null}
        </CarouselContext>
    );
}

interface CarouselPanelProps
    extends React.ComponentProps<typeof BlossomCarousel> {
    slideClassName?: string;
}

export function CarouselPanel({
    children,
    className,
    slideClassName,
    ...props
}: CarouselPanelProps) {
    const gt = useGT();
    const { containerRef, id } = useCarouselContext();

    const slides = React.Children.toArray(children);

    return (
        <BlossomCarousel
            {...props}
            aria-roledescription="carousel"
            as="section"
            className={cn(
                "no-scrollbar relative w-full shrink-0 snap-x snap-mandatory scroll-smooth",
                className
            )}
            id={id}
            ref={containerRef}
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

/**
 * Renders the active slide of the carousel.
 *
 * The index is `null` until the carousel registers its slides, so consumers
 * never receive an index outside the slide range.
 */
export function CarouselActiveSlide({
    children,
}: {
    children: (index: number | null) => React.ReactNode;
}) {
    const { id } = useCarouselContext();
    const { activeIndex, count } = useBlossomNavigation(id);
    const hasActiveSlide = activeIndex >= 0 && activeIndex < count;

    return <>{children(hasActiveSlide ? activeIndex : null)}</>;
}

interface CarouselAutoPlayProps {
    autoPlayMs: number;
}

function CarouselAutoplay({ autoPlayMs }: CarouselAutoPlayProps) {
    const { containerRef: carouselRef, id } = useCarouselContext();
    const { activeIndex, count } = useBlossomNavigation(id);
    const prefersReducedMotion = useReducedMotion();

    React.useEffect(() => {
        if (prefersReducedMotion || activeIndex < 0 || count <= 1) {
            return;
        }
        return runAfter(autoPlayMs, () => {
            scrollToSlide(
                carouselRef.current?.element ?? null,
                (activeIndex + 1) % count
            );
        });
    }, [activeIndex, autoPlayMs, carouselRef, count, prefersReducedMotion]);

    return null;
}

export function CarouselAutoplayIndicator({
    autoPlayMs,
}: CarouselAutoPlayProps) {
    const [value, setValue] = React.useState(100);

    React.useEffect(() => {
        // The ring must paint full before it transitions to empty. Two frames
        // guarantee one paint between the mount and the value change.
        let frameId = requestAnimationFrame(() => {
            frameId = requestAnimationFrame(() => setValue(0));
        });
        return () => cancelAnimationFrame(frameId);
    }, []);

    return (
        <RadialIcon
            aria-hidden
            className="ml-9 size-3.5 shrink-0 motion-reduce:hidden"
            transitionDurationMs={autoPlayMs}
            value={value}
        />
    );
}
