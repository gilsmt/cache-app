"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cn } from "@/lib/common/cn";

export function Collapsible({
    className,
    ...props
}: CollapsiblePrimitive.Root.Props) {
    return (
        <CollapsiblePrimitive.Root
            {...props}
            className={cn("relative flex flex-col", className)}
            data-slot="collapsible"
        />
    );
}

export function CollapsibleTrigger({
    className,
    ...props
}: CollapsiblePrimitive.Trigger.Props) {
    return (
        <CollapsiblePrimitive.Trigger
            {...props}
            className={cn("group w-full select-none text-nowrap", className)}
            data-slot="collapsible-trigger"
        />
    );
}

export function CollapsiblePanel({
    className,
    ...props
}: CollapsiblePrimitive.Panel.Props) {
    return (
        <CollapsiblePrimitive.Panel
            {...props}
            className={cn(
                "z-0 flex h-(--collapsible-panel-height) min-h-0 flex-col gap-1 overflow-y-clip transition-[height,opacity,translate] data-ending-style:h-0 data-starting-style:h-0 data-ending-style:-translate-y-1 data-starting-style:-translate-y-1.5 data-ending-style:opacity-0 data-starting-style:opacity-0 data-closed:duration-200 data-open:duration-300 data-closed:ease-in-out data-open:ease-[cubic-bezier(0.22,1.18,0.3,1)] [&[hidden]:not([hidden='until-found'])]:hidden",
                className
            )}
            data-slot="collapsible-panel"
        />
    );
}
