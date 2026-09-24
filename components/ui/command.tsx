"use client";

import { Autocomplete } from "@base-ui/react/autocomplete";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import type * as React from "react";
import { Input, type InputSize } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";

export const useCommandFilter: typeof Autocomplete.useFilter =
    Autocomplete.useFilter;

export function Command({
    autoHighlight = true,
    keepHighlight = true,
    openOnInputClick = true,
    ...props
}: React.ComponentProps<typeof Autocomplete.Root>) {
    return (
        <Autocomplete.Root
            {...props}
            autoHighlight={autoHighlight}
            keepHighlight={keepHighlight}
            openOnInputClick={openOnInputClick}
        />
    );
}

interface CommandInputProps extends Omit<Autocomplete.Input.Props, "size"> {
    endAddon?: React.ReactNode;
    ref?: React.Ref<HTMLInputElement>;
    size?: InputSize;
    startAddon?: React.ReactNode;
}

export function CommandInput({
    className,
    startAddon,
    size = "default",
    endAddon,
    ...props
}: CommandInputProps) {
    return (
        <Autocomplete.InputGroup
            className="group/input relative z-1 flex w-full text-foreground"
            data-slot="command-input-group"
        >
            {startAddon ? (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-s-px inset-y-0 z-10 flex shrink-0 items-center ps-[calc(--spacing(5)-1px)] has-[+[data-size=sm]]:ps-[calc(--spacing(2.5)-1px)] [&_svg:not([class*='size-'])]:size-4.5 sm:[&_svg:not([class*='size-'])]:size-4 [&_svg]:-mx-0.5"
                    data-slot="command-start-addon"
                >
                    {startAddon}
                </div>
            ) : null}
            <Autocomplete.Input
                {...props}
                autoCapitalize="sentences"
                autoCorrect="on"
                className={cn(
                    "squircle min-h-11 rounded-full p-1.5",
                    "border border-input/50 bg-card shadow-xs outline-none ring-0 before:hidden has-focus-visible:border-border has-focus-visible:ring-0 has-focus-visible:ring-offset-0",
                    startAddon &&
                        "data-[size=sm]:*:data-[slot=command-input]:ps-[calc(--spacing(7.5)-1px)] *:data-[slot=command-input]:ps-[calc(--spacing(8.5)-1px)] sm:data-[size=sm]:*:data-[slot=command-input]:ps-[calc(--spacing(7)-1px)] sm:*:data-[slot=command-input]:ps-[calc(--spacing(9)-1px)]",
                    size === "sm"
                        ? "has-[+[data-slot=command-trigger],+[data-slot=command-clear]]:*:data-[slot=command-input]:pe-6.5"
                        : "has-[+[data-slot=command-trigger],+[data-slot=command-clear]]:*:data-[slot=command-input]:pe-7",
                    className
                )}
                data-slot="command-input"
                inputMode="text"
                render={<Input shouldUseNativeInput size={size} />}
                spellCheck="true"
            />
            {endAddon ? (
                // biome-ignore lint/a11y/useSemanticElements: groups input adornments without naming a form field group.
                <div
                    className="absolute inset-e-0.5 inset-y-0 z-10 flex shrink-0 flex-nowrap items-center justify-end gap-0.5 pe-[calc(--spacing(2)-1px)] has-[+[data-size=sm]]:pe-[calc(--spacing(1.5)-1px)]"
                    data-slot="command-end-addon"
                    role="group"
                >
                    {endAddon}
                </div>
            ) : null}
        </Autocomplete.InputGroup>
    );
}

interface CommandPopupProps extends Autocomplete.Popup.Props {
    align?: Autocomplete.Positioner.Props["align"];
    alignOffset?: Autocomplete.Positioner.Props["alignOffset"];
    anchor?: Autocomplete.Positioner.Props["anchor"];
    portalProps?: Autocomplete.Portal.Props;
    positionMethod?: Autocomplete.Positioner.Props["positionMethod"];
    side?: Autocomplete.Positioner.Props["side"];
    sideOffset?: Autocomplete.Positioner.Props["sideOffset"];
}

export function CommandPopup({
    className,
    align = "start",
    alignOffset,
    anchor,
    positionMethod = "fixed",
    side = "bottom",
    sideOffset = 4,
    portalProps,
    ...props
}: CommandPopupProps) {
    return (
        <Autocomplete.Portal {...portalProps}>
            <Autocomplete.Positioner
                align={align}
                alignOffset={alignOffset}
                anchor={anchor}
                className="outline-hidden"
                data-slot="command-positioner"
                positionMethod={positionMethod}
                side={side}
                sideOffset={sideOffset}
                sticky
            >
                <Autocomplete.Popup
                    {...props}
                    className={cn(
                        "squircle before:squircle relative w-full min-w-(--anchor-width) max-w-(--available-width) rounded-2xl border bg-popover not-dark:bg-clip-padding shadow-lg/5 before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-2xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        className
                    )}
                    data-slot="command-popup"
                />
            </Autocomplete.Positioner>
        </Autocomplete.Portal>
    );
}

interface CommandListProps extends Autocomplete.List.Props {
    shouldScrollFade?: boolean;
    shouldUseScrollbarGutter?: boolean;
}

export function CommandList({
    className,
    shouldScrollFade = false,
    shouldUseScrollbarGutter = false,
    ...props
}: CommandListProps) {
    return (
        <ScrollArea
            shouldScrollFade={shouldScrollFade}
            shouldUseScrollbarGutter={shouldUseScrollbarGutter}
        >
            <Autocomplete.List
                {...props}
                className={cn(
                    "max-h-[min(32rem,var(--available-height))] not-empty:scroll-py-2 overscroll-contain not-empty:p-2 in-data-has-overflow-y:pe-3 outline-0",
                    className
                )}
                data-slot="command-list"
            />
        </ScrollArea>
    );
}

export function CommandItem({ className, ...props }: Autocomplete.Item.Props) {
    return (
        <Autocomplete.Item
            {...props}
            className={cn(
                "flex min-h-8 cursor-default select-none items-center rounded-md px-2 py-1.5 text-base outline-none data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-64 sm:min-h-7 sm:text-sm",
                className
            )}
            data-slot="command-item"
        />
    );
}

export function CommandGroup({
    className,
    ...props
}: Autocomplete.Group.Props) {
    return (
        <Autocomplete.Group
            {...props}
            className={cn("[[role=group]+&]:mt-1.5", className)}
            data-slot="command-group"
        />
    );
}

export function CommandGroupLabel({
    className,
    ...props
}: Autocomplete.GroupLabel.Props) {
    return (
        <Autocomplete.GroupLabel
            {...props}
            className={cn(
                "px-2 py-1.5 font-medium text-muted-foreground text-xs",
                className
            )}
            data-slot="command-group-label"
        />
    );
}

export function CommandEmpty({
    className,
    ...props
}: Autocomplete.Empty.Props) {
    return (
        <Autocomplete.Empty
            {...props}
            className={cn(
                "not-empty:p-2 not-empty:py-6 text-center text-base text-muted-foreground sm:text-sm",
                className
            )}
            data-slot="command-empty"
        />
    );
}

export function CommandCollection(props: Autocomplete.Collection.Props) {
    return (
        <Autocomplete.Collection {...props} data-slot="command-collection" />
    );
}

export function CommandRow(props: Autocomplete.Row.Props) {
    return <Autocomplete.Row {...props} data-slot="command-row" />;
}

export function CommandShortcut({
    className,
    ...props
}: React.ComponentProps<"kbd">) {
    return (
        <Kbd
            {...props}
            className={cn("ms-auto text-muted-foreground/50", className)}
            data-slot="command-shortcut"
        />
    );
}

export function CommandPanel({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn("min-h-0 w-full", className),
        "data-slot": "command-panel",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}
