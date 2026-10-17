"use client";

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
    slideClassName?: string;
}

export function CarouselPanel({
    children,
    className,
    slideClassName,
    ...props
}: CarouselPanelProps) {
    const gt = useGT();
    const { id } = useCarouselContext();

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
