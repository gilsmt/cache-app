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
                    "z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width)",
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
                        "squircle before:squircle relative flex h-(--popup-height,auto) max-h-(--available-height) w-(--popup-width,auto) max-w-72 origin-(--transform-origin) flex-col overflow-y-auto overflow-x-clip rounded-xl border bg-popover not-dark:bg-clip-padding px-(--viewport-inline-padding) py-4 text-popover-foreground shadow-lg/8 outline-none transition-[scale,opacity] duration-100 [--viewport-inline-padding:--spacing(4)] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        className
                    )}
                    data-slot="popover-popup"
                >
                    {children}
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
            className={cn("text-foreground text-xs leading-snug", className)}
            data-slot="popover-description"
        />
    );
}
