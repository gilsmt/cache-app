"use client";

import { Calligraph } from "calligraph";
import { useGT } from "gt-next";
import * as React from "react";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/common/cn";

const MAX_VISIBLE_VERTICAL_DEFAULT = 15;
const MAX_VISIBLE_HORIZONTAL_DEFAULT = 5;

interface DisclosureListVerticalProps extends React.ComponentProps<"div"> {
    /** Items rendered inline before the rest collapse behind the overflow trigger. */
    maxVisible?: number;
    /** Props forwarded to the overflow trigger. */
    triggerProps?: Omit<DisclosureListOverflowProps, "items">;
}

export function DisclosureListVertical({
    maxVisible = MAX_VISIBLE_VERTICAL_DEFAULT,
    children,
    className,
    triggerProps,
    ...props
}: DisclosureListVerticalProps) {
    const childrenArray = React.Children.toArray(children);

    if (childrenArray.length === 0) {
        return null;
    }

    const visible = childrenArray.slice(0, maxVisible);
    const hidden = childrenArray.slice(maxVisible);

    return (
        <div
            {...props}
            className={cn("flex flex-col gap-1", className)}
            data-slot="disclosure-list"
        >
            {visible}
            {hidden.length > 0 ? (
                <DisclosureListOverflow {...triggerProps} items={hidden} />
            ) : null}
        </div>
    );
}

interface DisclosureListHorizontalProps extends React.ComponentProps<"div"> {
    /** Element rendered as the overflow trigger; must resolve to an interactive element (e.g. pass `render={<button type="button" />}`) so the popover stays keyboard accessible. */
    badgeRender?: React.ReactElement;
    /** Items rendered inline before the rest move into the overflow popover. */
    maxVisible?: number;
}

export function DisclosureListHorizontal({
    maxVisible = MAX_VISIBLE_HORIZONTAL_DEFAULT,
    children,
    className,
    badgeRender,
    ...props
}: DisclosureListHorizontalProps) {
    const gt = useGT();
    const childrenArray = React.Children.toArray(children);

    if (childrenArray.length === 0) {
        return null;
    }

    const visible = childrenArray.slice(0, maxVisible);
    const hidden = childrenArray.slice(maxVisible);

    return (
        <div
            {...props}
            className={cn("flex items-center gap-1", className)}
            data-slot="disclosure-list"
        >
            {visible}
            {hidden.length > 0 ? (
                <Popover>
                    <PopoverTrigger
                        className={
                            badgeRender
                                ? undefined
                                : "flex items-center p-1.5 text-muted-foreground text-xs hover:text-foreground"
                        }
                        render={badgeRender}
                    >
                        <Calligraph className="-mx-0.5">
                            {gt("+{count} more", { count: hidden.length })}
                        </Calligraph>
                    </PopoverTrigger>
                    <PopoverPopup>
                        <div className="flex flex-col gap-2">{hidden}</div>
                    </PopoverPopup>
                </Popover>
            ) : null}
        </div>
    );
}

interface DisclosureListOverflowProps
    extends Omit<React.ComponentProps<typeof CollapsibleTrigger>, "children"> {
    /** Items revealed by the overflow trigger. */
    items: React.ReactNode[];
}

function DisclosureListOverflow({
    items,
    className,
    ...props
}: DisclosureListOverflowProps) {
    const gt = useGT();
    const [isOpen, setIsOpen] = React.useState(false);

    return (
        <Collapsible className="gap-1" onOpenChange={setIsOpen} open={isOpen}>
            <CollapsibleTrigger
                {...props}
                className={cn(
                    "flex items-center p-1.5 text-muted-foreground text-xs hover:text-foreground",
                    className
                )}
            >
                {isOpen
                    ? gt("Show less")
                    : gt("Show {count} more", { count: items.length })}
            </CollapsibleTrigger>
            <CollapsiblePanel>{items}</CollapsiblePanel>
        </Collapsible>
    );
}
