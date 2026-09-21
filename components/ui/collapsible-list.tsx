"use client";

import { Calligraph } from "calligraph";
import { cn } from "cn";
import { T, Var } from "gt-next";
import { ChevronUp } from "lucide-react";
import * as React from "react";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";

const MAX_VISIBLE_VERTICAL_DEFAULT = 15;
const MAX_VISIBLE_HORIZONTAL_DEFAULT = 8;

interface CollapsibleListVerticalProps extends React.ComponentProps<"div"> {
    /** Items rendered inline before the rest collapse behind the overflow trigger. */
    maxVisible?: number;
    /** Props forwarded to the overflow trigger. */
    triggerProps?: React.ComponentProps<typeof CollapsibleTrigger>;
}

export function CollapsibleListVertical({
    maxVisible = MAX_VISIBLE_VERTICAL_DEFAULT,
    children,
    className,
    triggerProps,
    ...props
}: CollapsibleListVerticalProps) {
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
            data-slot="collapsible-list"
        >
            {visible}
            {hidden.length > 0 ? (
                <CollapsibleListOverflowTrigger {...triggerProps}>
                    {hidden}
                </CollapsibleListOverflowTrigger>
            ) : null}
        </div>
    );
}

interface CollapsibleListHorizontalProps extends React.ComponentProps<"div"> {
    /** Element rendered as the overflow trigger; must resolve to an interactive element (e.g. pass `render={<button type="button" />}`) so the popover stays keyboard accessible. */
    badgeRender?: React.ReactElement;
    /** Items rendered inline before the rest move into the overflow popover. */
    maxVisible?: number;
}

export function CollapsibleListHorizontal({
    maxVisible = MAX_VISIBLE_HORIZONTAL_DEFAULT,
    children,
    className,
    badgeRender,
    ...props
}: CollapsibleListHorizontalProps) {
    const childrenArray = React.Children.toArray(children);

    if (childrenArray.length === 0) {
        return null;
    }

    const visible = childrenArray.slice(0, maxVisible);
    const hidden = childrenArray.slice(maxVisible);

    return (
        <div
            {...props}
            className={cn("flex shrink-0 items-center gap-1", className)}
            data-slot="collapsible-list"
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
                        <T>
                            +
                            <Var>
                                <Calligraph
                                    className={
                                        badgeRender ? "-mx-0.5" : undefined
                                    }
                                >
                                    {hidden.length}
                                </Calligraph>
                            </Var>{" "}
                            more
                        </T>
                    </PopoverTrigger>
                    <PopoverPopup>
                        <div className="flex flex-col gap-2">{hidden}</div>
                    </PopoverPopup>
                </Popover>
            ) : null}
        </div>
    );
}

function CollapsibleListOverflowTrigger({
    children,
    className,
    ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
    const [isOpen, setIsOpen] = React.useState(false);
    const count = React.Children.count(children);

    return (
        <Collapsible className="gap-1" onOpenChange={setIsOpen} open={isOpen}>
            <CollapsibleTrigger
                {...props}
                className={cn(
                    "flex items-center p-1.5 text-muted-foreground text-xs hover:text-foreground",
                    className
                )}
            >
                {isOpen ? (
                    <>
                        <T>Show less</T>
                        <ChevronUp className="ml-1 size-3.5" />
                    </>
                ) : (
                    <T>
                        Show <Var>{count}</Var> more
                    </T>
                )}
            </CollapsibleTrigger>
            <CollapsiblePanel>{children}</CollapsiblePanel>
        </Collapsible>
    );
}
