"use client";

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "cn";

interface ScrollAreaProps extends ScrollAreaPrimitive.Root.Props {
    shouldScrollFade?: boolean;
    shouldUseScrollbarGutter?: boolean;
}

export function ScrollArea({
    className,
    children,
    shouldScrollFade = false,
    shouldUseScrollbarGutter = false,
    ...props
}: ScrollAreaProps) {
    return (
        <ScrollAreaPrimitive.Root
            {...props}
            className={cn("size-full min-h-0", className)}
            data-slot="scroll-area"
        >
            <ScrollAreaPrimitive.Viewport
                className={cn(
                    "h-full overscroll-none rounded-[inherit] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                    shouldScrollFade &&
                        "mask-t-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-start)))] mask-b-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-end)))] mask-l-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-start)))] mask-r-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-end)))] [--fade-size:1.5rem]",
                    shouldUseScrollbarGutter &&
                        "data-has-overflow-y:pe-2.5 data-has-overflow-x:pb-2.5"
                )}
                data-slot="scroll-area-viewport"
            >
                <ScrollAreaPrimitive.Content
                    className="size-full"
                    data-slot="scroll-area-content"
                >
                    {children}
                </ScrollAreaPrimitive.Content>
            </ScrollAreaPrimitive.Viewport>
            <ScrollBar orientation="vertical" />
            <ScrollBar orientation="horizontal" />
            <ScrollAreaPrimitive.Corner />
        </ScrollAreaPrimitive.Root>
    );
}

export function ScrollBar({
    className,
    orientation = "vertical",
    ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
    return (
        <ScrollAreaPrimitive.Scrollbar
            {...props}
            className={cn(
                "pointer-events-none m-1 flex opacity-0 transition-opacity delay-300 data-hovering:pointer-events-auto data-scrolling:pointer-events-auto data-[orientation=horizontal]:h-1.5 data-[orientation=vertical]:w-1.5 data-[orientation=horizontal]:flex-col data-hovering:opacity-100 data-scrolling:opacity-100 data-hovering:delay-0 data-scrolling:delay-0 data-hovering:duration-100 data-scrolling:duration-100",
                className
            )}
            data-slot="scroll-area-scrollbar"
            orientation={orientation}
        >
            <ScrollAreaPrimitive.Thumb
                className="relative flex-1 rounded-full bg-foreground/20"
                data-slot="scroll-area-thumb"
            />
        </ScrollAreaPrimitive.Scrollbar>
    );
}
