"use client";

import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { useMergedRefs } from "@base-ui/utils/useMergedRefs";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import * as React from "react";
import { CheckmarkIcon } from "@/components/ui/icons";
import { Input, type InputSize } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ComboboxContextValue {
    chipsRef: React.RefObject<HTMLDivElement | null> | null;
    multiple: boolean;
}

const ComboboxContext: React.Context<ComboboxContextValue> =
    React.createContext<ComboboxContextValue>({
        chipsRef: null,
        multiple: false,
    });

function getTextFromReactNode(node: React.ReactNode): string {
    if (node === null || typeof node === "boolean") {
        return "";
    }
    if (typeof node === "string" || typeof node === "number") {
        return String(node);
    }
    if (Array.isArray(node)) {
        return node.map(getTextFromReactNode).join(" ");
    }
    if (React.isValidElement<{ children?: React.ReactNode }>(node)) {
        return getTextFromReactNode(node.props.children);
    }
    return "";
}

export function Combobox<Value, Multiple extends boolean | undefined = false>(
    props: ComboboxPrimitive.Root.Props<Value, Multiple>
) {
    const chipsRef = React.useRef<HTMLDivElement | null>(null);
    const contextValue = { chipsRef, multiple: !!props.multiple };

    return (
        <ComboboxContext value={contextValue}>
            <ComboboxPrimitive.Root {...props} />
        </ComboboxContext>
    );
}

interface ComboboxChipsInputProps
    extends Omit<ComboboxPrimitive.Input.Props, "size"> {
    ref?: React.Ref<HTMLInputElement>;
    size?: InputSize;
}

export function ComboboxChipsInput({
    className,
    size = "default",
    ...props
}: ComboboxChipsInputProps) {
    return (
        <ComboboxPrimitive.Input
            {...props}
            className={cn(
                "min-w-12 flex-1 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background sm:text-sm [[data-slot=combobox-chip]+&]:ps-0.5",
                size === "sm" ? "ps-1.5" : "ps-2",
                className
            )}
            data-size={size}
            data-slot="combobox-chips-input"
        />
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
            className="relative not-has-[>*.w-full]:w-fit w-full border-b text-foreground has-disabled:opacity-64"
            data-slot="combobox-input-group"
        >
            {startAddon ? (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-s-px inset-y-0 z-10 flex items-center ps-[calc(--spacing(3)-1px)] opacity-80 has-[+[data-size=sm]]:ps-[calc(--spacing(2.5)-1px)] [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:-mx-0.5"
                    data-slot="combobox-start-addon"
                >
                    {startAddon}
                </div>
            ) : null}
            <ComboboxPrimitive.Input
                {...props}
                className={cn(
                    startAddon &&
                        "data-[size=sm]:*:data-[slot=combobox-input]:ps-[calc(--spacing(7.5)-1px)] *:data-[slot=combobox-input]:ps-[calc(--spacing(8.5)-1px)] sm:data-[size=sm]:*:data-[slot=combobox-input]:ps-[calc(--spacing(7)-1px)] sm:*:data-[slot=combobox-input]:ps-[calc(--spacing(8)-1px)]",
                    endAddon &&
                        "data-[size=sm]:*:data-[slot=combobox-input]:pe-[calc(--spacing(7.5)-1px)] *:data-[slot=combobox-input]:pe-[calc(--spacing(8.5)-1px)] sm:data-[size=sm]:*:data-[slot=combobox-input]:pe-[calc(--spacing(7)-1px)] sm:*:data-[slot=combobox-input]:pe-[calc(--spacing(8)-1px)]",
                    endAddon &&
                        shouldShowClear &&
                        "data-[size=sm]:*:data-[slot=combobox-input]:pe-[calc(--spacing(13.5)-1px)] *:data-[slot=combobox-input]:pe-[calc(--spacing(14.5)-1px)] sm:data-[size=sm]:*:data-[slot=combobox-input]:pe-[calc(--spacing(12.5)-1px)] sm:*:data-[slot=combobox-input]:pe-[calc(--spacing(13.5)-1px)]",
                    size === "sm"
                        ? "has-[+[data-slot=combobox-trigger],+[data-slot=combobox-clear]]:*:data-[slot=combobox-input]:pe-6.5"
                        : "has-[+[data-slot=combobox-trigger],+[data-slot=combobox-clear]]:*:data-[slot=combobox-input]:pe-7",
                    "border-none! ring-0!",
                    className
                )}
                data-slot="combobox-input"
                render={
                    <Input
                        className="rounded-b-none before:rounded-b-none has-disabled:opacity-100"
                        shouldUseNativeInput
                        size={size}
                    />
                }
            />
            {endAddon ? (
                <div
                    aria-hidden
                    className={cn(
                        "pointer-events-none absolute inset-e-px inset-y-0 z-10 flex items-center pe-[calc(--spacing(2)-1px)] opacity-80 has-[+[data-size=sm]]:pe-[calc(--spacing(2.5)-1px)] [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:-mx-0.5",
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
                        "absolute top-1/2 inline-flex size-8 shrink-0 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border border-transparent opacity-80 outline-none transition-opacity pointer-coarse:after:absolute pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11 hover:opacity-100 has-[+[data-slot=combobox-clear]]:hidden sm:size-7 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
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
    const anchor = anchorProp ?? chipsRef;

    return (
        <ComboboxPrimitive.Portal {...portalProps}>
            <ComboboxPrimitive.Positioner
                align={align}
                alignOffset={alignOffset}
                anchor={anchor}
                className="z-50 select-none outline-none"
                data-slot="combobox-positioner"
                positionMethod={positionMethod}
                side={side}
                sideOffset={sideOffset}
            >
                <span
                    className={cn(
                        "relative flex max-h-full min-w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) rounded-[calc(var(--radius-lg)+1px)] border bg-popover not-dark:bg-clip-padding shadow-lg/5 transition-[scale,opacity] before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        className
                    )}
                >
                    <ComboboxPrimitive.Popup
                        {...props}
                        className="flex max-h-[min(var(--available-height),23rem)] flex-1 flex-col text-foreground"
                        data-slot="combobox-popup"
                    />
                </span>
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
                "grid min-h-8 cursor-default grid-cols-[1rem_1fr] items-center gap-2 rounded-sm py-1 ps-2 pe-2 text-base outline-none data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-64 sm:min-h-7 sm:text-sm [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
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
            className={cn("mt-1.5 mb-1 h-px bg-border last:hidden", className)}
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
                "px-2 pt-1.5 pb-1 font-medium text-muted-foreground text-xs",
                className
            )}
            data-slot="combobox-group-label"
        />
    );
}

interface ComboboxLabelProps extends ComboboxPrimitive.Label.Props {
    htmlFor: string;
}

export function ComboboxLabel({ className, ...props }: ComboboxLabelProps) {
    return (
        <ComboboxPrimitive.Label
            {...props}
            className={cn(
                "inline-flex cursor-default items-center gap-2 font-medium text-base/4.5 text-foreground sm:text-sm/4",
                className
            )}
            data-slot="combobox-label"
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
                "not-empty:p-2 text-center text-muted-foreground text-xs",
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
        <ScrollArea shouldScrollFade shouldUseScrollbarGutter>
            <ComboboxPrimitive.List
                {...props}
                className={cn(
                    "not-empty:scroll-py-1 not-empty:px-1 not-empty:py-1 in-data-has-overflow-y:pe-3",
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
                "px-3 py-2 font-medium text-muted-foreground text-xs empty:m-0 empty:p-0",
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

interface ComboboxChipsProps extends ComboboxPrimitive.Chips.Props {
    startAddon?: React.ReactNode;
}

export function ComboboxChips({
    className,
    children,
    startAddon,
    ref,
    ...props
}: ComboboxChipsProps) {
    const { chipsRef } = React.use(ComboboxContext);
    const mergedRef = useMergedRefs(ref, chipsRef);

    return (
        <ComboboxPrimitive.Chips
            {...props}
            className={cn(
                "relative inline-flex min-h-9 w-full flex-wrap gap-1 rounded-lg border border-input bg-background not-dark:bg-clip-padding p-[calc(--spacing(1)-1px)] text-base shadow-xs/5 outline-none ring-ring/24 transition-shadow *:min-h-7 before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-lg)-1px)] not-has-disabled:not-focus-within:not-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] focus-within:border-ring focus-within:ring-[3px] has-disabled:pointer-events-none has-data-[size=lg]:min-h-10 has-data-[size=sm]:min-h-8 has-aria-invalid:border-destructive/36 has-autofill:bg-foreground/4 has-disabled:opacity-64 has-[:disabled,:focus-within,[aria-invalid]]:shadow-none focus-within:has-aria-invalid:border-destructive/64 focus-within:has-aria-invalid:ring-destructive/16 has-data-[size=lg]:*:min-h-8 has-data-[size=sm]:*:min-h-6 sm:min-h-8 sm:text-sm sm:has-data-[size=lg]:min-h-9 sm:has-data-[size=sm]:min-h-7 sm:*:min-h-6 sm:has-data-[size=lg]:*:min-h-7 sm:has-data-[size=sm]:*:min-h-5 dark:not-has-disabled:bg-input/32 dark:has-autofill:bg-foreground/8 dark:has-aria-invalid:ring-destructive/24 dark:not-has-disabled:not-focus-within:not-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                className
            )}
            data-slot="combobox-chips"
            ref={mergedRef}
        >
            {startAddon ? (
                <div
                    aria-hidden
                    className="flex shrink-0 items-center ps-2 opacity-80 has-[~[data-size=sm]]:has-[+[data-slot=combobox-chip]]:pe-1.5 has-[~[data-size=sm]]:ps-1.5 has-[+[data-slot=combobox-chip]]:pe-2 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:-ms-0.5 [&_svg]:-me-1.5"
                    data-slot="combobox-start-addon"
                >
                    {startAddon}
                </div>
            ) : null}
            {children}
        </ComboboxPrimitive.Chips>
    );
}

interface ComboboxChipProps extends ComboboxPrimitive.Chip.Props {
    removeProps?: ComboboxPrimitive.ChipRemove.Props;
}

export function ComboboxChip({
    children,
    removeProps,
    ...props
}: ComboboxChipProps) {
    const chipLabel = getTextFromReactNode(children).trim();

    return (
        <ComboboxPrimitive.Chip
            {...props}
            className="flex items-center rounded-[calc(var(--radius-md)-1px)] bg-accent ps-2 font-medium text-accent-foreground text-sm outline-none sm:text-xs/(--text-xs--line-height) [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5"
            data-slot="combobox-chip"
        >
            {children}
            <ComboboxChipRemove
                {...removeProps}
                aria-label={
                    removeProps?.["aria-label"] ??
                    (chipLabel ? `Remove ${chipLabel}` : "Remove")
                }
            />
        </ComboboxPrimitive.Chip>
    );
}

export function ComboboxChipRemove(props: ComboboxPrimitive.ChipRemove.Props) {
    return (
        <ComboboxPrimitive.ChipRemove
            {...props}
            aria-label="Remove"
            className="h-full shrink-0 cursor-pointer px-1.5 opacity-80 hover:opacity-100 [&_svg:not([class*='size-'])]:size-4 sm:[&_svg:not([class*='size-'])]:size-3.5"
            data-slot="combobox-chip-remove"
        >
            <XIcon />
        </ComboboxPrimitive.ChipRemove>
    );
}
