"use client";

import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card";
import { cn } from "cn";

export const PreviewCard: typeof PreviewCardPrimitive.Root =
    PreviewCardPrimitive.Root;

export function PreviewCardTrigger({
    closeDelay = 0,
    ...props
}: PreviewCardPrimitive.Trigger.Props) {
    return (
        <PreviewCardPrimitive.Trigger
            {...props}
            closeDelay={closeDelay}
            data-slot="preview-card-trigger"
        />
    );
}

interface PreviewCardPopupProps extends PreviewCardPrimitive.Popup.Props {
    align?: PreviewCardPrimitive.Positioner.Props["align"];
    alignOffset?: PreviewCardPrimitive.Positioner.Props["alignOffset"];
    anchor?: PreviewCardPrimitive.Positioner.Props["anchor"];
    portalProps?: PreviewCardPrimitive.Portal.Props;
    positionMethod?: PreviewCardPrimitive.Positioner.Props["positionMethod"];
    side?: PreviewCardPrimitive.Positioner.Props["side"];
    sideOffset?: PreviewCardPrimitive.Positioner.Props["sideOffset"];
}

export function PreviewCardPopup({
    className,
    align = "center",
    alignOffset = 0,
    anchor,
    positionMethod,
    side = "bottom",
    sideOffset = 8,
    portalProps,
    ...props
}: PreviewCardPopupProps) {
    return (
        <PreviewCardPrimitive.Portal {...portalProps}>
            <PreviewCardPrimitive.Positioner
                align={align}
                alignOffset={alignOffset}
                anchor={anchor}
                className="z-50"
                data-slot="preview-card-positioner"
                positionMethod={positionMethod}
                side={side}
                sideOffset={sideOffset}
            >
                <PreviewCardPrimitive.Popup
                    {...props}
                    className={cn(
                        "squircle before:squircle relative flex w-64 origin-(--transform-origin) overflow-hidden text-balance rounded-xl bg-popover not-dark:bg-clip-padding p-4 text-popover-foreground text-sm shadow-xl/5 transition-[scale,opacity] duration-100 before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0 dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        className
                    )}
                    data-slot="preview-card-popup"
                />
            </PreviewCardPrimitive.Positioner>
        </PreviewCardPrimitive.Portal>
    );
}
