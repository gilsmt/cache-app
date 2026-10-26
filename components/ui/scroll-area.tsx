"use client";

import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "cn";

interface ScrollAreaProps extends ScrollAreaPrimitive.Root.Props {
    viewportClassName?: string;
}

export function ScrollArea({
    children,
    viewportClassName,
    ...props
}: ScrollAreaProps) {
    return (
        <ScrollAreaRoot {...props}>
            <ScrollAreaViewport className={viewportClassName}>
                <ScrollAreaPrimitive.Content
                    className="size-full min-w-0"
                    data-slot="scroll-area-content"
                >
                    {children}
                </ScrollAreaPrimitive.Content>
            </ScrollAreaViewport>
            <ScrollBar orientation="vertical" />
            <ScrollBar orientation="horizontal" />
            <ScrollAreaPrimitive.Corner />
        </ScrollAreaRoot>
    );
}

export function ScrollAreaRoot({
    className,
    ...props
}: ScrollAreaPrimitive.Root.Props) {
    return (
        <ScrollAreaPrimitive.Root
            {...props}
            className={cn("size-full min-h-0", className)}
            data-slot="scroll-area"
        />
    );
}

export function ScrollAreaViewport({
    className,
    ...props
}: ScrollAreaPrimitive.Viewport.Props) {
    return (
        <ScrollAreaPrimitive.Viewport
            {...props}
            className={cn(
                "focus-visible:ring-ring focus-visible:ring-offset-background h-full overscroll-none rounded-[inherit] transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                "mask-t-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-start)))] mask-r-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-end)))] mask-b-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-y-end)))] mask-l-from-[calc(100%-min(var(--fade-size),var(--scroll-area-overflow-x-start)))] [--fade-size:1.5rem]",
                className
            )}
            data-slot="scroll-area-viewport"
        />
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
                "pointer-events-none m-1 flex opacity-0 transition-opacity delay-300 hover:opacity-100 hover:delay-0 hover:duration-100 data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:flex-col data-[orientation=vertical]:w-1.5 [@media(hover:hover)]:pointer-events-auto",
                className
            )}
            data-slot="scroll-area-scrollbar"
            orientation={orientation}
        >
            <ScrollAreaPrimitive.Thumb
                className="bg-foreground/20 relative flex-1 rounded-full"
                data-slot="scroll-area-thumb"
            />
        </ScrollAreaPrimitive.Scrollbar>
    );
}
