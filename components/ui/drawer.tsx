"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

type DrawerPosition = "right" | "left" | "top" | "bottom";

const SWIPE_DIRECTION_BY_POSITION: Record<
    DrawerPosition,
    DrawerPrimitive.Root.Props["swipeDirection"]
> = {
    bottom: "down",
    left: "left",
    right: "right",
    top: "up",
};

interface DrawerContext {
    position: DrawerPosition;
}

const DrawerContext = React.createContext<DrawerContext>({
    position: "bottom",
});

const DrawerPortal: typeof DrawerPrimitive.Portal = DrawerPrimitive.Portal;

function wrapRender(
    render: useRender.ComponentProps<"div">["render"],
    allowSelection: boolean
) {
    return allowSelection ? (
        <DrawerPrimitive.Content render={render} />
    ) : (
        render
    );
}

export const DrawerCreateHandle: typeof DrawerPrimitive.createHandle =
    DrawerPrimitive.createHandle;

interface DrawerProps<Payload = unknown>
    extends DrawerPrimitive.Root.Props<Payload> {
    position?: DrawerPosition;
}

export function Drawer<Payload = unknown>({
    swipeDirection,
    position = "bottom",
    ...props
}: DrawerProps<Payload>) {
    const contextValue = { position };

    return (
        <DrawerContext value={contextValue}>
            <DrawerPrimitive.Root
                {...props}
                swipeDirection={
                    swipeDirection ?? SWIPE_DIRECTION_BY_POSITION[position]
                }
            />
        </DrawerContext>
    );
}

export function DrawerTrigger(props: DrawerPrimitive.Trigger.Props) {
    return <DrawerPrimitive.Trigger {...props} data-slot="drawer-trigger" />;
}

export function DrawerClose(props: DrawerPrimitive.Close.Props) {
    return <DrawerPrimitive.Close {...props} data-slot="drawer-close" />;
}

export function DrawerSwipeArea({
    className,
    ...props
}: DrawerPrimitive.SwipeArea.Props) {
    const { position } = React.use(DrawerContext);

    return (
        <DrawerPrimitive.SwipeArea
            {...props}
            className={cn(
                "fixed z-40",
                position === "bottom" && "inset-x-0 bottom-0 h-6",
                position === "top" && "inset-x-0 top-0 h-6",
                position === "left" && "inset-y-0 left-0 w-6",
                position === "right" && "inset-y-0 right-0 w-6",
                className
            )}
            data-slot="drawer-swipe-area"
        />
    );
}

interface DrawerViewportProps extends DrawerPrimitive.Viewport.Props {
    portalProps?: DrawerPrimitive.Portal.Props;
    position?: DrawerPosition;
    shouldShowBackdrop?: boolean;
    variant?: "default" | "straight" | "inset";
}

export function DrawerViewport({
    className,
    position: positionProp,
    variant = "default",
    portalProps,
    shouldShowBackdrop = true,
    ...props
}: DrawerViewportProps) {
    const { position: contextPosition } = React.use(DrawerContext);
    const position = positionProp ?? contextPosition;

    return (
        <DrawerPrimitive.VirtualKeyboardProvider>
            <DrawerPortal {...portalProps}>
                {shouldShowBackdrop ? <DrawerBackdrop /> : null}
                <DrawerPrimitive.Viewport
                    {...props}
                    className={cn(
                        "fixed inset-0 z-50 [--bleed:--spacing(12)] [--inset:--spacing(0)]",
                        "touch-none",
                        position === "bottom" &&
                            "grid grid-rows-[1fr_auto] pt-12",
                        position === "top" && "grid grid-rows-[auto_1fr] pb-12",
                        position === "left" && "flex justify-start",
                        position === "right" && "flex justify-end",
                        variant === "inset" &&
                            "px-(--inset) sm:[--inset:--spacing(4)]",
                        variant === "inset" &&
                            position !== "bottom" &&
                            "pt-(--inset)",
                        variant === "inset" &&
                            position !== "top" &&
                            "pb-(--inset)",
                        className
                    )}
                    data-slot="drawer-viewport"
                />
            </DrawerPortal>
        </DrawerPrimitive.VirtualKeyboardProvider>
    );
}

interface DrawerPopupProps extends DrawerPrimitive.Popup.Props {
    position?: DrawerPosition;
    shouldShowCloseButton?: boolean;
    variant?: "default" | "straight" | "inset";
}

export function DrawerPopup({
    className,
    children,
    shouldShowCloseButton = false,
    position: positionProp,
    variant = "default",
    ...props
}: DrawerPopupProps) {
    const { position: contextPosition } = React.use(DrawerContext);
    const position = positionProp ?? contextPosition;

    return (
        <DrawerPrimitive.Popup
            {...props}
            className={cn(
                "relative flex max-h-full min-h-0 w-full min-w-0 flex-col bg-popover not-dark:bg-clip-padding text-popover-foreground shadow-lg/5 outline-none transition-[transform,opacity,box-shadow,height,background-color] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform [--drawer-enter-exit-translation:--spacing(6)] [--peek:calc(--spacing(6)-1px)] [--scale-base:calc(max(0,1-(var(--nested-drawers)*var(--stack-step))))] [--scale:clamp(0,calc(var(--scale-base)+(var(--stack-step)*var(--stack-progress))),1)] [--shrink:calc(1-var(--scale))] [--stack-peek-offset:max(0px,calc((var(--nested-drawers)-var(--stack-progress))*var(--peek)))] [--stack-progress:clamp(0,var(--drawer-swipe-progress),1)] [--stack-step:0.05] before:pointer-events-none before:absolute before:inset-0 before:shadow-[0_1px_--theme(--color-black/4%)] after:pointer-events-none after:absolute after:bg-popover data-swiping:select-none data-nested-drawer-open:overflow-hidden data-nested-drawer-open:bg-[color-mix(in_srgb,var(--popover),var(--color-black)_calc(2%*(var(--nested-drawers)-var(--stack-progress))))] data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:shadow-transparent data-starting-style:shadow-transparent data-ending-style:duration-100 dark:data-nested-drawer-open:bg-[color-mix(in_srgb,var(--popover),var(--color-black)_calc(6%*(var(--nested-drawers)-var(--stack-progress))))] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                "touch-none",
                position === "bottom" &&
                    "transform-[translateY(calc(var(--drawer-snap-point-offset)+var(--drawer-swipe-movement-y)))] data-ending-style:transform-[translateY(calc(var(--drawer-snap-point-offset)+var(--drawer-enter-exit-translation)))] data-starting-style:transform-[translateY(calc(var(--drawer-snap-point-offset)+var(--drawer-enter-exit-translation)))] row-start-2 -mb-[max(0px,calc(var(--drawer-snap-point-offset,0px)+clamp(0,1,var(--drawer-snap-point-offset,0px)/1px)*var(--drawer-swipe-movement-y,0px)))] border-t pb-[max(0px,calc(env(safe-area-inset-bottom,0px)+var(--drawer-snap-point-offset,0px)+clamp(0,1,var(--drawer-snap-point-offset,0px)/1px)*var(--drawer-swipe-movement-y,0px)))] not-data-starting-style:not-data-ending-style:transition-[transform,box-shadow,height,background-color,margin,padding] after:inset-x-0 after:top-full after:h-(--bleed) has-data-[slot=drawer-bar]:pt-2 data-ending-style:mb-0 data-starting-style:mb-0 data-ending-style:pb-0 data-starting-style:pb-0",
                position === "top" &&
                    "data-starting-style:transform-[translateY(calc(-1*var(--drawer-enter-exit-translation)))] data-ending-style:transform-[translateY(calc(-1*var(--drawer-enter-exit-translation)))] transform-[translateY(var(--drawer-swipe-movement-y))] border-b after:inset-x-0 after:bottom-full after:h-(--bleed) has-data-[slot=drawer-bar]:pb-2",
                position === "left" &&
                    "data-starting-style:transform-[translateX(calc(-1*var(--drawer-enter-exit-translation)))] data-ending-style:transform-[translateX(calc(-1*var(--drawer-enter-exit-translation)))] transform-[translateX(var(--drawer-swipe-movement-x))] w-[calc(100%-(--spacing(12)))] max-w-md border-e after:inset-e-full after:inset-y-0 after:w-(--bleed) has-data-[slot=drawer-bar]:pe-2",
                position === "right" &&
                    "transform-[translateX(var(--drawer-swipe-movement-x))] data-ending-style:transform-[translateX(var(--drawer-enter-exit-translation))] data-starting-style:transform-[translateX(var(--drawer-enter-exit-translation))] col-start-2 w-[calc(100%-(--spacing(12)))] max-w-md border-s after:inset-s-full after:inset-y-0 after:w-(--bleed) has-data-[slot=drawer-bar]:ps-2",
                variant !== "straight" &&
                    position === "bottom" &&
                    "rounded-t-2xl",
                variant !== "straight" &&
                    position === "top" &&
                    "rounded-b-2xl **:data-[slot=drawer-footer]:rounded-b-[calc(var(--radius-2xl)-1px)]",
                variant !== "straight" &&
                    position === "left" &&
                    "rounded-e-2xl **:data-[slot=drawer-footer]:rounded-ee-[calc(var(--radius-2xl)-1px)]",
                variant !== "straight" &&
                    position === "right" &&
                    "rounded-s-2xl **:data-[slot=drawer-footer]:rounded-es-[calc(var(--radius-2xl)-1px)]",
                variant === "default" &&
                    position === "bottom" &&
                    "before:rounded-t-[calc(var(--radius-2xl)-1px)]",
                variant === "default" &&
                    position === "top" &&
                    "before:rounded-b-[calc(var(--radius-2xl)-1px)]",
                variant === "default" &&
                    position === "left" &&
                    "before:rounded-e-[calc(var(--radius-2xl)-1px)]",
                variant === "default" &&
                    position === "right" &&
                    "before:rounded-s-[calc(var(--radius-2xl)-1px)]",
                variant === "inset" &&
                    "before:hidden sm:rounded-2xl sm:border sm:after:bg-transparent sm:before:rounded-[calc(var(--radius-2xl)-1px)] sm:**:data-[slot=drawer-footer]:rounded-b-[calc(var(--radius-2xl)-1px)]",
                variant === "straight" && "shadow-none [--stack-step:0]",
                (position === "bottom" || position === "top") &&
                    "h-(--drawer-height,auto) [--height:max(0px,calc(var(--drawer-frontmost-height,var(--drawer-height))))] data-nested-drawer-open:h-(--height)",
                position === "bottom" &&
                    "data-nested-drawer-open:transform-[translateY(calc(var(--drawer-swipe-movement-y)-var(--stack-peek-offset)-(var(--shrink)*var(--height))))_scale(var(--scale))] origin-[50%_calc(100%-var(--inset))]",
                position === "top" &&
                    "data-nested-drawer-open:transform-[translateY(calc(var(--drawer-swipe-movement-y)+var(--stack-peek-offset)+(var(--shrink)*var(--height))))_scale(var(--scale))] origin-[50%_var(--inset)]",
                position === "left" &&
                    "data-nested-drawer-open:transform-[translateX(calc(var(--drawer-swipe-movement-x)+var(--stack-peek-offset)))_scale(var(--scale))] origin-right",
                position === "right" &&
                    "data-nested-drawer-open:transform-[translateX(calc(var(--drawer-swipe-movement-x)-var(--stack-peek-offset)))_scale(var(--scale))] origin-left",
                className
            )}
            data-slot="drawer-popup"
        >
            {children}
            {shouldShowCloseButton ? (
                <DrawerPrimitive.Close
                    aria-label="Close"
                    className="absolute inset-e-2 top-2"
                    render={<Button size="icon" variant="ghost" />}
                >
                    <XIcon />
                </DrawerPrimitive.Close>
            ) : null}
        </DrawerPrimitive.Popup>
    );
}

export function DrawerTitle({
    className,
    ...props
}: DrawerPrimitive.Title.Props) {
    return (
        <DrawerPrimitive.Title
            {...props}
            className={cn(
                "font-heading font-semibold text-xl leading-none",
                className
            )}
            data-slot="drawer-title"
        />
    );
}

export function DrawerDescription({
    className,
    ...props
}: DrawerPrimitive.Description.Props) {
    return (
        <DrawerPrimitive.Description
            {...props}
            className={cn("text-muted-foreground text-sm", className)}
            data-slot="drawer-description"
        />
    );
}

interface DrawerPanelProps extends useRender.ComponentProps<"div"> {
    allowSelection?: boolean;
    isScrollable?: boolean;
    shouldScrollFade?: boolean;
}

export function DrawerPanel({
    className,
    shouldScrollFade = true,
    isScrollable = true,
    allowSelection = true,
    render,
    ...props
}: DrawerPanelProps) {
    const defaultProps = {
        className: cn(
            "min-h-0 flex-1 flex-col gap-4 p-6 in-[[data-slot=drawer-popup]:has([data-slot=drawer-header])]:pt-1 in-[[data-slot=drawer-popup]:has([data-slot=drawer-footer]:not(.border-t))]:pb-1",
            !allowSelection && "cursor-default",
            className
        ),
        "data-slot": "drawer-panel",
    };

    const content = useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render: wrapRender(render, allowSelection),
    });

    if (isScrollable) {
        return (
            <ScrollArea
                className="touch-auto"
                shouldScrollFade={shouldScrollFade}
            >
                {content}
            </ScrollArea>
        );
    }

    return content;
}

interface DrawerHeaderProps extends useRender.ComponentProps<"div"> {
    allowSelection?: boolean;
}

export function DrawerHeader({
    className,
    allowSelection = false,
    render,
    ...props
}: DrawerHeaderProps) {
    const defaultProps = {
        className: cn(
            "flex flex-col gap-2 p-5 in-[[data-slot=drawer-popup]:has([data-slot=drawer-panel])]:pb-3 max-sm:pb-4",
            !allowSelection && "cursor-default",
            className
        ),
        "data-slot": "drawer-header",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render: wrapRender(render, allowSelection),
    });
}

interface DrawerFooterProps extends useRender.ComponentProps<"div"> {
    allowSelection?: boolean;
    variant?: "default" | "bare";
}

export function DrawerFooter({
    className,
    variant = "default",
    allowSelection = true,
    render,
    ...props
}: DrawerFooterProps) {
    const defaultProps = {
        className: cn(
            "flex flex-col-reverse gap-2 px-6 pb-(--safe-area-inset-bottom,0px) sm:flex-row sm:justify-end",
            !allowSelection && "cursor-default",
            variant === "default" &&
                "border-t bg-muted/72 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+--spacing(4))]",
            variant === "bare" &&
                "in-[[data-slot=drawer-popup]:has([data-slot=drawer-panel])]:pt-3 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+--spacing(6))]",
            className
        ),
        "data-slot": "drawer-footer",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render: wrapRender(render, allowSelection),
    });
}

function DrawerBackdrop({
    className,
    ...props
}: DrawerPrimitive.Backdrop.Props) {
    return (
        <DrawerPrimitive.Backdrop
            {...props}
            className={cn(
                "fixed inset-0 z-50 bg-linear-to-b from-black/15 to-black/10 opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:duration-100 data-swiping:duration-0 supports-[-webkit-touch-callout:none]:absolute",
                className
            )}
            data-slot="drawer-backdrop"
        />
    );
}
