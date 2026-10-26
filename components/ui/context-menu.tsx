"use client";

import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { cn } from "cn";
import { ChevronRightIcon } from "lucide-react";

export const ContextMenu: typeof ContextMenuPrimitive.Root =
    ContextMenuPrimitive.Root;

export function ContextMenuTrigger(props: ContextMenuPrimitive.Trigger.Props) {
    return (
        <ContextMenuPrimitive.Trigger
            {...props}
            data-slot="context-menu-trigger"
        />
    );
}

interface ContextMenuPopupProps extends ContextMenuPrimitive.Popup.Props {
    align?: ContextMenuPrimitive.Positioner.Props["align"];
    alignOffset?: ContextMenuPrimitive.Positioner.Props["alignOffset"];
    anchor?: ContextMenuPrimitive.Positioner.Props["anchor"];
    "data-slot"?: string;
    portalProps?: ContextMenuPrimitive.Portal.Props;
    positionMethod?: ContextMenuPrimitive.Positioner.Props["positionMethod"];
    side?: ContextMenuPrimitive.Positioner.Props["side"];
    sideOffset?: ContextMenuPrimitive.Positioner.Props["sideOffset"];
}

export function ContextMenuPopup({
    className,
    children,
    "data-slot": dataSlot = "context-menu-popup",
    align = "start",
    alignOffset,
    anchor,
    positionMethod,
    side = "bottom",
    sideOffset = 0,
    portalProps,
    ...props
}: ContextMenuPopupProps) {
    return (
        <ContextMenuPrimitive.Portal {...portalProps}>
            <ContextMenuPrimitive.Positioner
                align={align}
                alignOffset={alignOffset}
                anchor={anchor}
                className="z-50 outline-none select-none"
                data-slot="context-menu-positioner"
                positionMethod={positionMethod}
                side={side}
                sideOffset={sideOffset}
            >
                <ContextMenuPrimitive.Popup
                    {...props}
                    className={cn(
                        "squircle before:squircle bg-popover text-popover-foreground relative origin-(--transform-origin) overflow-hidden rounded-xl border shadow-lg/8 transition-[scale,opacity] duration-100 outline-none not-dark:bg-clip-padding not-[class*='w-']:min-w-52 before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        className
                    )}
                    data-slot={dataSlot}
                >
                    <div className="max-h-(--available-height) w-full overflow-y-auto p-1">
                        {children}
                    </div>
                </ContextMenuPrimitive.Popup>
            </ContextMenuPrimitive.Positioner>
        </ContextMenuPrimitive.Portal>
    );
}

interface ContextMenuItemProps extends ContextMenuPrimitive.Item.Props {
    variant?: "default" | "destructive";
}

export function ContextMenuItem({
    className,
    variant = "default",
    ...props
}: ContextMenuItemProps) {
    return (
        <ContextMenuPrimitive.Item
            {...props}
            className={cn(
                "squircle data-highlighted:bg-accent flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-64",
                variant === "default" &&
                    "data-highlighted:text-accent-foreground",
                variant === "destructive" &&
                    "text-destructive-foreground data-highlighted:bg-destructive/8 data-highlighted:text-destructive-foreground",
                className
            )}
            data-slot="context-menu-item"
        />
    );
}

export function ContextMenuSeparator({
    className,
    ...props
}: ContextMenuPrimitive.Separator.Props) {
    return (
        <ContextMenuPrimitive.Separator
            {...props}
            className={cn("bg-border/50 my-1 h-px shrink-0", className)}
            data-slot="context-menu-separator"
        />
    );
}

export function ContextMenuGroup(props: ContextMenuPrimitive.Group.Props) {
    return (
        <ContextMenuPrimitive.Group {...props} data-slot="context-menu-group" />
    );
}

interface ContextMenuGroupLabelProps
    extends ContextMenuPrimitive.GroupLabel.Props {
    hasInset?: boolean;
}

export function ContextMenuGroupLabel({
    className,
    hasInset,
    ...props
}: ContextMenuGroupLabelProps) {
    return (
        <ContextMenuPrimitive.GroupLabel
            {...props}
            className={cn(
                "text-muted-foreground px-2 py-1.5 text-xs font-medium data-inset:ps-9 sm:data-inset:ps-8",
                className
            )}
            data-inset={hasInset}
            data-slot="context-menu-group-label"
        />
    );
}

export function ContextMenuSub(props: ContextMenuPrimitive.SubmenuRoot.Props) {
    return (
        <ContextMenuPrimitive.SubmenuRoot
            {...props}
            data-slot="context-menu-sub"
        />
    );
}

export function ContextMenuSubTrigger({
    children,
    className,
    ...props
}: ContextMenuPrimitive.SubmenuTrigger.Props) {
    return (
        <ContextMenuPrimitive.SubmenuTrigger
            {...props}
            className={cn(
                "squircle group/trigger data-highlighted:bg-accent data-highlighted:text-accent-foreground flex min-h-8 cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-64",
                className
            )}
            data-slot="context-menu-sub-trigger"
        >
            {children}
            <ChevronRightIcon
                aria-hidden
                className="text-muted-foreground ms-auto -me-0.5 size-4 group-data-popup-open/trigger:opacity-50"
                focusable="false"
            />
        </ContextMenuPrimitive.SubmenuTrigger>
    );
}

interface ContextMenuSubPopupProps extends ContextMenuPrimitive.Popup.Props {
    align?: ContextMenuPrimitive.Positioner.Props["align"];
    alignOffset?: ContextMenuPrimitive.Positioner.Props["alignOffset"];
    anchor?: ContextMenuPrimitive.Positioner.Props["anchor"];
    portalProps?: ContextMenuPrimitive.Portal.Props;
    positionMethod?: ContextMenuPrimitive.Positioner.Props["positionMethod"];
    sideOffset?: ContextMenuPrimitive.Positioner.Props["sideOffset"];
}

export function ContextMenuSubPopup({
    className,
    align = "start",
    alignOffset,
    anchor,
    positionMethod,
    sideOffset = 0,
    portalProps,
    ...props
}: ContextMenuSubPopupProps) {
    const defaultAlignOffset = align === "center" ? undefined : -5;

    return (
        <ContextMenuPopup
            {...props}
            align={align}
            alignOffset={alignOffset ?? defaultAlignOffset}
            anchor={anchor}
            className={cn("transition-none", className)}
            data-slot="context-menu-sub-popup"
            portalProps={portalProps}
            positionMethod={positionMethod}
            side="inline-end"
            sideOffset={sideOffset}
        />
    );
}
