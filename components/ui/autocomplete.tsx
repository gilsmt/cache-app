"use client";

import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type * as React from "react";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";

export const useAutocompleteFilter: typeof AutocompletePrimitive.useFilter =
    AutocompletePrimitive.useFilter;

export function Autocomplete({
    autoHighlight = true,
    keepHighlight = true,
    openOnInputClick = true,
    ...props
}: React.ComponentProps<typeof AutocompletePrimitive.Root>) {
    return (
        <AutocompletePrimitive.Root
            {...props}
            autoHighlight={autoHighlight}
            keepHighlight={keepHighlight}
            openOnInputClick={openOnInputClick}
        />
    );
}

export function AutocompleteInputGroup({
    className,
    ...props
}: AutocompletePrimitive.InputGroup.Props) {
    return (
        <AutocompletePrimitive.InputGroup
            {...props}
            className={cn(
                "group/input relative z-1 flex w-full flex-col",
                className
            )}
            data-slot="autocomplete-input-group"
        />
    );
}

export function AutocompleteStartAddon({
    className,
    ...props
}: React.ComponentProps<"div">) {
    return (
        <div
            {...props}
            aria-hidden
            className={cn(
                "pointer-events-none absolute inset-y-0 inset-s-px z-10 flex shrink-0 items-center ps-[calc(--spacing(5)-1px)] [&_svg]:-mx-0.5 [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4",
                className
            )}
            data-slot="autocomplete-start-addon"
        />
    );
}

export function AutocompleteEndAddon({
    className,
    ...props
}: React.ComponentProps<"div">) {
    return (
        <div
            {...props}
            className={cn(
                "absolute inset-e-0.5 top-4 z-10 flex shrink-0 flex-nowrap items-center justify-end gap-0.5 pe-[calc(--spacing(2)-1px)]",
                className
            )}
            data-slot="autocomplete-end-addon"
        />
    );
}

export function AutocompleteClear(props: AutocompletePrimitive.Clear.Props) {
    return (
        <AutocompletePrimitive.Clear
            {...props}
            data-slot="autocomplete-clear"
        />
    );
}

interface AutocompleteInputProps
    extends Omit<AutocompletePrimitive.Input.Props, "size"> {
    ref?: React.Ref<HTMLInputElement>;
    render?: AutocompletePrimitive.Input.Props["render"];
}

export function AutocompleteInput({
    className,
    render,
    ...props
}: AutocompleteInputProps) {
    return (
        <AutocompletePrimitive.Input
            {...props}
            autoCapitalize="sentences"
            autoCorrect="on"
            className={cn(
                "squircle bg-background has-focus-visible:border-border min-h-11 p-1.5 shadow-xs ring-0 outline-none before:hidden has-focus-visible:ring-0 has-focus-visible:ring-offset-0 group-has-[[data-slot=autocomplete-end-addon]]/input:*:data-[slot=input]:pe-[calc(--spacing(8.5)-1px)] group-has-[[data-slot=autocomplete-start-addon]]/input:*:data-[slot=input]:ps-[calc(--spacing(8.5)-1px)] sm:group-has-[[data-slot=autocomplete-end-addon]]/input:*:data-[slot=input]:pe-[calc(--spacing(9)-1px)] sm:group-has-[[data-slot=autocomplete-start-addon]]/input:*:data-[slot=input]:ps-[calc(--spacing(9)-1px)]",
                className
            )}
            data-slot="autocomplete-input"
            inputMode="text"
            render={render ?? <Input useNativeInput />}
            spellCheck="true"
        />
    );
}

interface AutocompletePopupProps extends AutocompletePrimitive.Popup.Props {
    align?: AutocompletePrimitive.Positioner.Props["align"];
    alignOffset?: AutocompletePrimitive.Positioner.Props["alignOffset"];
    anchor?: AutocompletePrimitive.Positioner.Props["anchor"];
    portalProps?: AutocompletePrimitive.Portal.Props;
    positionMethod?: AutocompletePrimitive.Positioner.Props["positionMethod"];
    side?: AutocompletePrimitive.Positioner.Props["side"];
    sideOffset?: AutocompletePrimitive.Positioner.Props["sideOffset"];
}

export function AutocompletePopup({
    className,
    align = "start",
    alignOffset,
    anchor,
    positionMethod = "fixed",
    side = "bottom",
    sideOffset = 6,
    portalProps,
    ...props
}: AutocompletePopupProps) {
    return (
        <AutocompletePrimitive.Portal {...portalProps}>
            <AutocompletePrimitive.Positioner
                align={align}
                alignOffset={alignOffset}
                anchor={anchor}
                className="z-50 outline-none select-none"
                data-slot="autocomplete-positioner"
                positionMethod={positionMethod}
                side={side}
                sideOffset={sideOffset}
                sticky
            >
                <AutocompletePrimitive.Popup
                    {...props}
                    className={cn(
                        "squircle before:squircle bg-popover relative w-full max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin) rounded-xl border shadow-lg/8 outline-none not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        className
                    )}
                    data-slot="autocomplete-popup"
                />
            </AutocompletePrimitive.Positioner>
        </AutocompletePrimitive.Portal>
    );
}

interface AutocompleteListProps extends AutocompletePrimitive.List.Props {
    /** Set to false when a parent scroll area owns scrolling. */
    shouldUseScrollArea?: boolean;
}

export function AutocompleteList({
    className,
    shouldUseScrollArea = true,
    ...props
}: AutocompleteListProps) {
    const list = (
        <AutocompletePrimitive.List
            {...props}
            className={cn(
                shouldUseScrollArea &&
                    "max-h-[min(32rem,var(--available-height))] outline-0 in-data-has-overflow-y:pe-3",
                "outline-0 not-empty:scroll-py-2 not-empty:p-2",
                className
            )}
            data-slot="autocomplete-list"
        />
    );

    if (!shouldUseScrollArea) {
        return list;
    }

    return <ScrollArea>{list}</ScrollArea>;
}

export function AutocompleteItem({
    className,
    ...props
}: AutocompletePrimitive.Item.Props) {
    return (
        <AutocompletePrimitive.Item
            {...props}
            className={cn(
                "squircle data-highlighted:bg-accent data-highlighted:text-accent-foreground flex min-h-8 cursor-default items-center rounded-sm px-2 py-1.5 text-base outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-64 sm:min-h-7 sm:text-sm",
                className
            )}
            data-slot="autocomplete-item"
        />
    );
}

export function AutocompleteGroup({
    className,
    ...props
}: AutocompletePrimitive.Group.Props) {
    return (
        <AutocompletePrimitive.Group
            {...props}
            className={cn("[[role=group]+&]:mt-1.5", className)}
            data-slot="autocomplete-group"
        />
    );
}

export function AutocompleteGroupLabel({
    className,
    ...props
}: AutocompletePrimitive.GroupLabel.Props) {
    return (
        <AutocompletePrimitive.GroupLabel
            {...props}
            className={cn(
                "text-muted-foreground px-2 py-1.5 text-xs font-medium",
                className
            )}
            data-slot="autocomplete-group-label"
        />
    );
}

export function AutocompleteEmpty({
    className,
    ...props
}: AutocompletePrimitive.Empty.Props) {
    return (
        <AutocompletePrimitive.Empty
            {...props}
            className={cn(
                "text-muted-foreground text-center text-base not-empty:p-2 not-empty:py-6 sm:text-sm",
                className
            )}
            data-slot="autocomplete-empty"
        />
    );
}

export function AutocompleteCollection(
    props: AutocompletePrimitive.Collection.Props
) {
    return (
        <AutocompletePrimitive.Collection
            {...props}
            data-slot="autocomplete-collection"
        />
    );
}

export function AutocompleteRow(props: AutocompletePrimitive.Row.Props) {
    return (
        <AutocompletePrimitive.Row {...props} data-slot="autocomplete-row" />
    );
}

export function AutocompleteShortcut({
    className,
    ...props
}: React.ComponentProps<"kbd">) {
    return (
        <Kbd
            {...props}
            className={cn("text-muted-foreground/50 ms-auto", className)}
            data-slot="autocomplete-shortcut"
        />
    );
}

export function AutocompletePanel({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn("min-h-0 w-full", className),
        "data-slot": "autocomplete-panel",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}
