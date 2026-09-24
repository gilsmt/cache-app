"use client";

import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { cn } from "cn";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { CheckmarkIcon } from "@/components/ui/icons";

export const Menu: typeof MenuPrimitive.Root = MenuPrimitive.Root;

export function MenuTrigger(props: MenuPrimitive.Trigger.Props) {
    return <MenuPrimitive.Trigger {...props} data-slot="menu-trigger" />;
}

interface MenuPopupProps extends MenuPrimitive.Popup.Props {
    align?: MenuPrimitive.Positioner.Props["align"];
    alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"];
    anchor?: MenuPrimitive.Positioner.Props["anchor"];
    collisionAvoidance?: MenuPrimitive.Positioner.Props["collisionAvoidance"];
    "data-slot"?: string;
    portalProps?: MenuPrimitive.Portal.Props;
    positionMethod?: MenuPrimitive.Positioner.Props["positionMethod"];
    side?: MenuPrimitive.Positioner.Props["side"];
    sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
}

export function MenuPopup({
    className,
    children,
    "data-slot": dataSlot = "menu-popup",
    align = "center",
    alignOffset,
    anchor,
    collisionAvoidance,
    positionMethod,
    side = "bottom",
    sideOffset = 4,
    portalProps,
    ...props
}: MenuPopupProps) {
    return (
        <MenuPrimitive.Portal {...portalProps}>
            <MenuPrimitive.Positioner
                align={align}
                alignOffset={alignOffset}
                anchor={anchor}
                className="z-50"
                collisionAvoidance={collisionAvoidance}
                data-slot="menu-positioner"
                positionMethod={positionMethod}
                side={side}
                sideOffset={sideOffset}
            >
                <MenuPrimitive.Popup
                    {...props}
                    className={cn(
                        "squircle before:squircle relative not-[class*='w-']:min-w-52 origin-(--transform-origin) overflow-hidden rounded-2xl border bg-popover not-dark:bg-clip-padding text-popover-foreground shadow-lg/8 outline-none transition-[scale,opacity] duration-100 before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-2xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        className
                    )}
                    data-slot={dataSlot}
                >
                    <div className="max-h-(--available-height) w-full overflow-y-auto p-1">
                        {children}
                    </div>
                </MenuPrimitive.Popup>
            </MenuPrimitive.Positioner>
        </MenuPrimitive.Portal>
    );
}

export function MenuGroup(props: MenuPrimitive.Group.Props) {
    return <MenuPrimitive.Group {...props} data-slot="menu-group" />;
}

export function MenuRadioGroup(props: MenuPrimitive.RadioGroup.Props) {
    return <MenuPrimitive.RadioGroup {...props} data-slot="menu-radio-group" />;
}

interface MenuGroupLabelProps extends MenuPrimitive.GroupLabel.Props {
    hasInset?: boolean;
}

export function MenuGroupLabel({
    className,
    hasInset,
    ...props
}: MenuGroupLabelProps) {
    return (
        <MenuPrimitive.GroupLabel
            {...props}
            className={cn(
                "px-2 py-1.5 font-medium text-muted-foreground text-xs data-inset:ps-9 sm:data-inset:ps-8",
                className
            )}
            data-inset={hasInset}
            data-slot="menu-group-label"
        />
    );
}

export function MenuShortcut({
    className,
    ...props
}: React.ComponentProps<"kbd">) {
    return (
        <kbd
            {...props}
            className={cn(
                "ms-auto font-medium font-sans text-muted-foreground/72 text-xs uppercase tracking-widest max-sm:hidden",
                className
            )}
            data-slot="menu-shortcut"
        />
    );
}

interface MenuItemProps extends MenuPrimitive.Item.Props {
    variant?: "default" | "destructive";
}

export function MenuItem({
    className,
    variant = "default",
    ...props
}: MenuItemProps) {
    return (
        <MenuPrimitive.Item
            {...props}
            className={cn(
                "flex cursor-default select-none items-center gap-2 rounded-xl px-2.5 py-2 text-sm outline-none transition-colors hover:transition-none data-disabled:pointer-events-none data-highlighted:bg-accent data-disabled:opacity-64",
                variant === "default" &&
                    "data-highlighted:text-accent-foreground",
                variant === "destructive" &&
                    "text-destructive-foreground data-highlighted:bg-destructive/8 data-highlighted:text-destructive-foreground",
                className
            )}
            data-slot="menu-item"
        />
    );
}

interface MenuLinkItemProps extends MenuPrimitive.Item.Props {
    href: string;
}

export function MenuLinkItem({ href, ...props }: MenuLinkItemProps) {
    return (
        <MenuItem
            {...props}
            nativeButton={false}
            render={<Link href={href} />}
        />
    );
}

export function MenuRadioItem({
    className,
    children,
    ...props
}: MenuPrimitive.RadioItem.Props) {
    return (
        <MenuPrimitive.RadioItem
            {...props}
            className={cn(
                "grid min-h-8 cursor-default select-none grid-cols-[1fr_1rem] items-center gap-5 rounded-xl px-2.5 py-1.5 text-sm outline-none transition-colors hover:transition-none data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-64",
                className
            )}
            data-slot="menu-radio-item"
        >
            <span className="col-start-1 truncate">{children}</span>
            <MenuPrimitive.RadioItemIndicator className="col-start-2 -me-0.5">
                <CheckIcon className="size-4" />
            </MenuPrimitive.RadioItemIndicator>
        </MenuPrimitive.RadioItem>
    );
}

export function MenuSeparator({
    className,
    ...props
}: MenuPrimitive.Separator.Props) {
    return (
        <MenuPrimitive.Separator
            {...props}
            className={cn("my-1 h-px bg-border/50", className)}
            data-slot="menu-separator"
        />
    );
}

export function MenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
    return <MenuPrimitive.SubmenuRoot {...props} data-slot="menu-sub" />;
}

export function MenuSubTrigger({
    children,
    className,
    ...props
}: MenuPrimitive.SubmenuTrigger.Props) {
    return (
        <MenuPrimitive.SubmenuTrigger
            {...props}
            className={cn(
                "group/trigger flex min-h-8 cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none transition-colors hover:transition-none data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-64",
                className
            )}
            data-slot="menu-sub-trigger"
        >
            {children}
            <ChevronRightIcon
                aria-hidden
                className="ms-auto -me-0.5 size-4 text-muted-foreground group-data-popup-open/trigger:opacity-50"
                focusable="false"
            />
        </MenuPrimitive.SubmenuTrigger>
    );
}

interface MenuSubPopupProps extends MenuPrimitive.Popup.Props {
    align?: MenuPrimitive.Positioner.Props["align"];
    alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"];
    anchor?: MenuPrimitive.Positioner.Props["anchor"];
    collisionAvoidance?: MenuPrimitive.Positioner.Props["collisionAvoidance"];
    portalProps?: MenuPrimitive.Portal.Props;
    positionMethod?: MenuPrimitive.Positioner.Props["positionMethod"];
    sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
}

export function MenuSubPopup({
    className,
    align = "start",
    alignOffset,
    anchor,
    collisionAvoidance,
    positionMethod,
    sideOffset = 0,
    portalProps,
    ...props
}: MenuSubPopupProps) {
    const defaultAlignOffset = align === "center" ? undefined : -5;

    return (
        <MenuPopup
            {...props}
            align={align}
            alignOffset={alignOffset ?? defaultAlignOffset}
            anchor={anchor}
            className={className}
            collisionAvoidance={collisionAvoidance}
            data-slot="menu-sub-popup"
            portalProps={portalProps}
            positionMethod={positionMethod}
            side="inline-end"
            sideOffset={sideOffset}
        />
    );
}

interface MenuCheckboxItemProps extends MenuPrimitive.CheckboxItem.Props {
    variant?: "default" | "switch";
}

export function MenuCheckboxItem({
    className,
    children,
    checked,
    variant = "default",
    ...props
}: MenuCheckboxItemProps) {
    return (
        <MenuPrimitive.CheckboxItem
            {...props}
            checked={checked}
            className={cn(
                "grid min-h-8 cursor-default items-center gap-2 rounded-sm py-1 ps-2 text-base text-foreground outline-none data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-64 sm:min-h-7 sm:text-sm [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
                variant === "switch"
                    ? "grid-cols-[1fr_auto] gap-4 pe-1.5"
                    : "grid-cols-[.75rem_1fr] pe-2",
                className
            )}
            data-slot="menu-checkbox-item"
        >
            {variant === "switch" ? (
                <MenuSwitchIndicator>{children}</MenuSwitchIndicator>
            ) : (
                <MenuCheckIndicator>{children}</MenuCheckIndicator>
            )}
        </MenuPrimitive.CheckboxItem>
    );
}

function MenuSwitchIndicator({ children }: { children: React.ReactNode }) {
    return (
        <>
            <span className="col-start-1">{children}</span>
            <MenuPrimitive.CheckboxItemIndicator
                className="inset-shadow-[0_1px_--theme(--color-black/4%)] inline-flex h-[calc(var(--thumb-size)+2px)] w-[calc(var(--thumb-size)*2-2px)] shrink-0 items-center rounded-full p-px outline-none transition-[background-color,box-shadow] duration-200 [--thumb-size:--spacing(4)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-checked:bg-primary data-unchecked:bg-input data-disabled:opacity-64 sm:[--thumb-size:--spacing(3)]"
                keepMounted
            >
                <span className="pointer-events-none block aspect-square h-full in-[[data-slot=menu-checkbox-item][data-checked]]:origin-[var(--thumb-size)_50%] origin-left in-[[data-slot=menu-checkbox-item][data-checked]]:translate-x-[calc(var(--thumb-size)-4px)] in-[[data-slot=menu-checkbox-item]:active]:not-data-disabled:scale-x-110 in-[[data-slot=menu-checkbox-item]:active]:rounded-[var(--thumb-size)/calc(var(--thumb-size)*1.10)] rounded-(--thumb-size) bg-background shadow-sm/5 will-change-transform [transition:translate_.15s,border-radius_.15s,scale_.1s_.1s,transform-origin_.15s]" />
            </MenuPrimitive.CheckboxItemIndicator>
        </>
    );
}

function MenuCheckIndicator({ children }: { children: React.ReactNode }) {
    return (
        <>
            <MenuPrimitive.CheckboxItemIndicator className="col-start-1 -ms-0.5">
                <CheckmarkIcon aria-hidden className="size-4.5 sm:size-4" />
            </MenuPrimitive.CheckboxItemIndicator>
            <span className="col-start-2">{children}</span>
        </>
    );
}
