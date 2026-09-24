"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";

export const Popover: typeof PopoverPrimitive.Root = PopoverPrimitive.Root;

export function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
    return <PopoverPrimitive.Trigger {...props} data-slot="popover-trigger" />;
}

interface PopoverPopupProps extends PopoverPrimitive.Popup.Props {
    align?: PopoverPrimitive.Positioner.Props["align"];
    alignOffset?: PopoverPrimitive.Positioner.Props["alignOffset"];
    anchor?: PopoverPrimitive.Positioner.Props["anchor"];
    portalProps?: PopoverPrimitive.Portal.Props;
    positionerClassName?: string;
    positionMethod?: PopoverPrimitive.Positioner.Props["positionMethod"];
    shouldUseTooltipStyle?: boolean;
    side?: PopoverPrimitive.Positioner.Props["side"];
    sideOffset?: PopoverPrimitive.Positioner.Props["sideOffset"];
}

export function PopoverPopup({
    className,
    children,
    align = "center",
    alignOffset = 0,
    anchor,
    positionMethod,
    side = "bottom",
    sideOffset = 4,
    shouldUseTooltipStyle = false,
    positionerClassName,
    portalProps,
    ...props
}: PopoverPopupProps) {
    return (
        <PopoverPrimitive.Portal {...portalProps}>
            <PopoverPrimitive.Positioner
                align={align}
                alignOffset={alignOffset}
                anchor={anchor}
                className={cn(
                    "z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) transition-[top,left,right,bottom,transform] data-instant:transition-none",
                    positionerClassName
                )}
                data-slot="popover-positioner"
                positionMethod={positionMethod}
                side={side}
                sideOffset={sideOffset}
            >
                <PopoverPrimitive.Popup
                    {...props}
                    className={cn(
                        "squircle before:squircle relative flex h-(--popup-height,auto) w-(--popup-width,auto) origin-(--transform-origin) overflow-clip rounded-xl border bg-popover not-dark:bg-clip-padding text-popover-foreground shadow-lg/5 outline-none transition-[width,height,scale,opacity] duration-100 before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] has-data-[slot=calendar]:rounded-xl has-data-[slot=calendar]:before:rounded-[calc(var(--radius-xl)-1px)] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 data-instant:transition-none dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        shouldUseTooltipStyle &&
                            "w-fit text-balance rounded-lg text-xs shadow-md/5 before:rounded-[calc(var(--radius-lg)-1px)]",
                        className
                    )}
                    data-slot="popover-popup"
                >
                    <PopoverPrimitive.Viewport
                        className={cn(
                            "relative size-full max-h-(--available-height) overflow-clip px-(--viewport-inline-padding) py-4 [--viewport-inline-padding:--spacing(4)] has-data-[slot=calendar]:p-2 data-instant:transition-none **:data-current:data-ending-style:opacity-0 **:data-current:data-starting-style:opacity-0 **:data-previous:data-ending-style:opacity-0 **:data-previous:data-starting-style:opacity-0 **:data-current:w-[calc(var(--popup-width)-2*var(--viewport-inline-padding)-2px)] **:data-previous:w-[calc(var(--popup-width)-2*var(--viewport-inline-padding)-2px)] **:data-current:opacity-100 **:data-previous:opacity-100 **:data-current:transition-opacity **:data-previous:transition-opacity",
                            shouldUseTooltipStyle
                                ? "max-w-64 text-pretty py-1.5 [--viewport-inline-padding:--spacing(2)]"
                                : "max-w-72 not-data-transitioning:overflow-y-auto"
                        )}
                        data-slot="popover-viewport"
                    >
                        {children}
                    </PopoverPrimitive.Viewport>
                </PopoverPrimitive.Popup>
            </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
    );
}

export function PopoverClose(props: PopoverPrimitive.Close.Props) {
    return <PopoverPrimitive.Close {...props} data-slot="popover-close" />;
}

export function PopoverTitle({
    className,
    ...props
}: PopoverPrimitive.Title.Props) {
    return (
        <PopoverPrimitive.Title
            {...props}
            className={cn("font-medium text-sm", className)}
            data-slot="popover-title"
        />
    );
}

export function PopoverDescription({
    className,
    ...props
}: PopoverPrimitive.Description.Props) {
    return (
        <PopoverPrimitive.Description
            {...props}
            className={cn("text-muted-foreground text-sm", className)}
            data-slot="popover-description"
        />
    );
}
