"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import * as React from "react";
import { CheckmarkIcon } from "@/components/ui/icons";
import { Input, type InputSize } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ComboboxContext {
    chipsRef: React.RefObject<HTMLDivElement | null> | null;
}

const ComboboxContext: React.Context<ComboboxContext> =
    React.createContext<ComboboxContext>({
        chipsRef: null,
    });

export function Combobox<
    Value,
    Multiple extends boolean | undefined = false,
    Item = Value,
>(props: ComboboxPrimitive.Root.Props<Value, Multiple, Item>) {
    const chipsRef = React.useRef<HTMLDivElement | null>(null);

    const contextValue = { chipsRef };

    return (
        <ComboboxContext value={contextValue}>
            <ComboboxPrimitive.Root {...props} />
        </ComboboxContext>
    );
}

interface ComboboxInputProps
    extends Omit<ComboboxPrimitive.Input.Props, "size"> {
    clearProps?: ComboboxPrimitive.Clear.Props;
    endAddon?: React.ReactNode;
    ref?: React.Ref<HTMLInputElement>;
    shouldShowClear?: boolean;
    size?: InputSize;
    startAddon?: React.ReactNode;
}

export function ComboboxInput({
    className,
    shouldShowClear = false,
    startAddon,
    endAddon,
    size = "default",
    clearProps,
    ...props
}: ComboboxInputProps) {
    return (
        <ComboboxPrimitive.InputGroup
            className="text-foreground relative w-full border-b not-has-[>*.w-full]:w-fit has-disabled:opacity-64"
            data-slot="combobox-input-group"
        >
            {startAddon ? (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 inset-s-px z-10 flex items-center ps-[calc(--spacing(3)-1px)] opacity-80 has-[+[data-size=sm]]:ps-[calc(--spacing(2.5)-1px)] [&_svg]:-mx-0.5 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4"
                    data-slot="combobox-start-addon"
                >
                    {startAddon}
                </div>
            ) : null}
            <ComboboxPrimitive.Input
                {...props}
                className={cn(
                    startAddon &&
                        "*:data-[slot=combobox-input]:ps-[calc(--spacing(8.5)-1px)] data-[size=sm]:*:data-[slot=combobox-input]:ps-[calc(--spacing(7.5)-1px)] sm:*:data-[slot=combobox-input]:ps-[calc(--spacing(8)-1px)] sm:data-[size=sm]:*:data-[slot=combobox-input]:ps-[calc(--spacing(7)-1px)]",
                    endAddon &&
                        "*:data-[slot=combobox-input]:pe-[calc(--spacing(8.5)-1px)] data-[size=sm]:*:data-[slot=combobox-input]:pe-[calc(--spacing(7.5)-1px)] sm:*:data-[slot=combobox-input]:pe-[calc(--spacing(8)-1px)] sm:data-[size=sm]:*:data-[slot=combobox-input]:pe-[calc(--spacing(7)-1px)]",
                    endAddon &&
                        shouldShowClear &&
                        "*:data-[slot=combobox-input]:pe-[calc(--spacing(14.5)-1px)] data-[size=sm]:*:data-[slot=combobox-input]:pe-[calc(--spacing(13.5)-1px)] sm:*:data-[slot=combobox-input]:pe-[calc(--spacing(13.5)-1px)] sm:data-[size=sm]:*:data-[slot=combobox-input]:pe-[calc(--spacing(12.5)-1px)]",
                    size === "sm"
                        ? "has-[+[data-slot=combobox-trigger],+[data-slot=combobox-clear]]:*:data-[slot=combobox-input]:pe-6.5"
                        : "has-[+[data-slot=combobox-trigger],+[data-slot=combobox-clear]]:*:data-[slot=combobox-input]:pe-7",
                    "border-none! ring-0!",
                    className
                )}
                data-slot="combobox-input"
                render={
                    <Input
                        className="rounded-b-none before:rounded-b-none has-disabled:opacity-100 dark:bg-transparent"
                        size={size}
                        useNativeInput
                    />
                }
            />
            {endAddon ? (
                <div
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-y-0 inset-e-px z-10 flex items-center pe-[calc(--spacing(2)-1px)] opacity-80 has-[+[data-size=sm]]:pe-[calc(--spacing(2.5)-1px)] [&_svg]:-mx-0.5 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
                        shouldShowClear &&
                            (size === "sm" ? "inset-e-7" : "inset-e-8.5")
                    )}
                    data-slot="combobox-end-addon"
                >
                    {endAddon}
                </div>
            ) : null}
            {shouldShowClear ? (
                <ComboboxClear
                    {...clearProps}
                    className={cn(
                        "absolute top-1/2 inline-flex size-8 shrink-0 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border border-transparent opacity-80 outline-none hover:opacity-100 has-[+[data-slot=combobox-clear]]:hidden sm:size-7 pointer-coarse:after:absolute pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
                        size === "sm" ? "inset-e-0" : "inset-e-0.5"
                    )}
                >
                    <XIcon />
                </ComboboxClear>
            ) : null}
        </ComboboxPrimitive.InputGroup>
    );
}

export function ComboboxTrigger(props: ComboboxPrimitive.Trigger.Props) {
    return (
        <ComboboxPrimitive.Trigger {...props} data-slot="combobox-trigger" />
    );
}

interface ComboboxPopupProps extends ComboboxPrimitive.Popup.Props {
    align?: ComboboxPrimitive.Positioner.Props["align"];
    alignOffset?: ComboboxPrimitive.Positioner.Props["alignOffset"];
    anchor?: ComboboxPrimitive.Positioner.Props["anchor"];
    portalProps?: ComboboxPrimitive.Portal.Props;
    positionMethod?: ComboboxPrimitive.Positioner.Props["positionMethod"];
    side?: ComboboxPrimitive.Positioner.Props["side"];
    sideOffset?: ComboboxPrimitive.Positioner.Props["sideOffset"];
}

export function ComboboxPopup({
    className,
    align = "start",
    alignOffset,
    anchor: anchorProp,
    positionMethod,
    side = "bottom",
    sideOffset = 4,
    portalProps,
    ...props
}: ComboboxPopupProps) {
    const { chipsRef } = React.use(ComboboxContext);

    return (
        <ComboboxPrimitive.Portal {...portalProps}>
            <ComboboxPrimitive.Positioner
                align={align}
                alignOffset={alignOffset}
                anchor={anchorProp ?? chipsRef}
                className="z-50 outline-none select-none"
                data-slot="combobox-positioner"
                positionMethod={positionMethod}
                side={side}
                sideOffset={sideOffset}
            >
                <ComboboxPrimitive.Popup
                    {...props}
                    className={cn(
                        "squircle before:squircle bg-popover text-foreground relative flex max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin) flex-col rounded-xl border shadow-lg/8 transition-[scale,opacity] duration-100 outline-none not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:scale-98 data-ending-style:opacity-0 data-starting-style:scale-98 data-starting-style:opacity-0 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        className
                    )}
                    data-slot="combobox-popup"
                />
            </ComboboxPrimitive.Positioner>
        </ComboboxPrimitive.Portal>
    );
}

interface ComboboxItemProps extends ComboboxPrimitive.Item.Props {
    shouldShowIndicatorLast?: boolean;
}

export function ComboboxItem({
    className,
    children,
    shouldShowIndicatorLast,
    ...props
}: ComboboxItemProps) {
    return (
        <ComboboxPrimitive.Item
            {...props}
            className={cn(
                "squircle data-highlighted:bg-accent data-highlighted:text-accent-foreground grid min-h-8 cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-lg py-1 ps-2 pe-2 text-base outline-none data-disabled:pointer-events-none data-disabled:opacity-64 sm:min-h-7 sm:text-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
                shouldShowIndicatorLast && "grid-cols-[1fr_1rem]",
                className
            )}
            data-slot="combobox-item"
        >
            {shouldShowIndicatorLast ? (
                <div className="col-start-1">{children}</div>
            ) : null}
            <ComboboxPrimitive.ItemIndicator
                className={
                    shouldShowIndicatorLast ? "col-start-2" : "col-start-1"
                }
            >
                <CheckmarkIcon className="size-4" />
            </ComboboxPrimitive.ItemIndicator>
            {!shouldShowIndicatorLast && (
                <div className="col-start-2">{children}</div>
            )}
        </ComboboxPrimitive.Item>
    );
}

export function ComboboxSeparator({
    className,
    ...props
}: ComboboxPrimitive.Separator.Props) {
    return (
        <ComboboxPrimitive.Separator
            {...props}
            className={cn("bg-border/50 my-1 h-px shrink-0", className)}
            data-slot="combobox-separator"
        />
    );
}

export function ComboboxGroup({
    className,
    ...props
}: ComboboxPrimitive.Group.Props) {
    return (
        <ComboboxPrimitive.Group
            {...props}
            className={cn("[[role=group]+&]:mt-1.5", className)}
            data-slot="combobox-group"
        />
    );
}

export function ComboboxGroupLabel({
    className,
    ...props
}: ComboboxPrimitive.GroupLabel.Props) {
    return (
        <ComboboxPrimitive.GroupLabel
            {...props}
            className={cn(
                "text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-medium",
                className
            )}
            data-slot="combobox-group-label"
        />
    );
}

export function ComboboxEmpty({
    className,
    ...props
}: ComboboxPrimitive.Empty.Props) {
    return (
        <ComboboxPrimitive.Empty
            {...props}
            className={cn(
                "text-muted-foreground text-center text-xs not-empty:p-2",
                className
            )}
            data-slot="combobox-empty"
        />
    );
}

export function ComboboxRow(props: ComboboxPrimitive.Row.Props) {
    return <ComboboxPrimitive.Row {...props} data-slot="combobox-row" />;
}

export function ComboboxValue(props: ComboboxPrimitive.Value.Props) {
    return <ComboboxPrimitive.Value {...props} data-slot="combobox-value" />;
}

export function ComboboxList({
    className,
    ...props
}: ComboboxPrimitive.List.Props) {
    return (
        <ScrollArea>
            <ComboboxPrimitive.List
                {...props}
                className={cn(
                    "max-h-[min(var(--available-height),23rem)] outline-0 not-empty:scroll-py-1 not-empty:px-1 not-empty:py-1 in-data-has-overflow-y:pe-3",
                    className
                )}
                data-slot="combobox-list"
            />
        </ScrollArea>
    );
}

export function ComboboxClear(props: ComboboxPrimitive.Clear.Props) {
    return <ComboboxPrimitive.Clear {...props} data-slot="combobox-clear" />;
}

export function ComboboxStatus({
    className,
    ...props
}: ComboboxPrimitive.Status.Props) {
    return (
        <ComboboxPrimitive.Status
            {...props}
            className={cn(
                "text-muted-foreground px-3 py-2 text-xs font-medium empty:m-0 empty:p-0",
                className
            )}
            data-slot="combobox-status"
        />
    );
}

export function ComboboxCollection(props: ComboboxPrimitive.Collection.Props) {
    return (
        <ComboboxPrimitive.Collection
            {...props}
            data-slot="combobox-collection"
        />
    );
}
