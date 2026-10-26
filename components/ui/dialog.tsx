"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "cn";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export const Dialog: typeof DialogPrimitive.Root = DialogPrimitive.Root;

export function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
    return <DialogPrimitive.Trigger {...props} data-slot="dialog-trigger" />;
}

interface DialogPopupProps extends DialogPrimitive.Popup.Props {
    portalProps?: DialogPrimitive.Portal.Props;
    viewportClassName?: DialogPrimitive.Viewport.Props["className"];
}

export function DialogPopup({
    className,
    children,
    portalProps,
    viewportClassName,
    ...props
}: DialogPopupProps) {
    return (
        <DialogPrimitive.Portal {...portalProps}>
            <DialogBackdrop />
            <DialogViewport className={viewportClassName}>
                <DialogPrimitive.Popup
                    {...props}
                    className={cn(
                        "squircle before:squircle relative row-start-2 flex max-h-full min-h-0 w-full min-w-0 max-w-lg flex-col rounded-xl bg-popover not-dark:bg-clip-padding text-popover-foreground opacity-[calc(1-var(--nested-dialogs))] shadow-lg/5 outline-none transition-[translate,opacity] duration-200 ease-out will-change-transform before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:pointer-events-none data-ending-style:translate-y-5 data-starting-style:translate-y-4 data-ending-style:select-none data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:duration-100 data-ending-style:ease-in dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        className
                    )}
                    data-slot="dialog-popup"
                >
                    {children}
                    <DialogPrimitive.Close
                        aria-label="Close"
                        className="absolute inset-e-2 top-2"
                        render={<Button size="icon" variant="ghost" />}
                    >
                        <XIcon />
                    </DialogPrimitive.Close>
                </DialogPrimitive.Popup>
            </DialogViewport>
        </DialogPrimitive.Portal>
    );
}

export function DialogPanel({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn(
            "min-h-0 p-6 in-[[data-slot=dialog-popup]:has([data-slot=dialog-header])]:pt-1 in-[[data-slot=dialog-popup]:has([data-slot=dialog-footer]:not(.border-t))]:pb-1",
            className
        ),
        "data-slot": "dialog-panel",
    };

    return (
        <ScrollArea>
            {useRender({
                defaultTagName: "div",
                props: mergeProps<"div">(defaultProps, props),
                render,
            })}
        </ScrollArea>
    );
}

export function DialogHeader({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn(
            "flex flex-col gap-2 p-6 in-[[data-slot=dialog-popup]:has([data-slot=dialog-panel])]:pb-3 max-sm:pb-4",
            className
        ),
        "data-slot": "dialog-header",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

export function DialogTitle({
    className,
    ...props
}: DialogPrimitive.Title.Props) {
    return (
        <DialogPrimitive.Title
            {...props}
            className={cn("font-semibold text-lg", className)}
            data-slot="dialog-title"
        />
    );
}

export function DialogDescription({
    className,
    ...props
}: DialogPrimitive.Description.Props) {
    return (
        <DialogPrimitive.Description
            {...props}
            className={cn("text-muted-foreground text-sm", className)}
            data-slot="dialog-description"
        />
    );
}

export function DialogClose(props: DialogPrimitive.Close.Props) {
    return <DialogPrimitive.Close {...props} data-slot="dialog-close" />;
}

export function DialogFooter({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn(
            "flex flex-col-reverse gap-2 px-6 sm:flex-row sm:items-center sm:justify-end sm:rounded-b-[calc(var(--radius-xl)-1px)]",
            "in-[[data-slot=dialog-popup]:has([data-slot=dialog-panel])]:pt-3 pt-4 pb-6",
            className
        ),
        "data-slot": "dialog-footer",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

function DialogBackdrop({
    className,
    ...props
}: DialogPrimitive.Backdrop.Props) {
    return (
        <DialogPrimitive.Backdrop
            {...props}
            className={cn(
                "fixed inset-0 z-50 bg-black/32 transition-all duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:duration-100",
                className
            )}
            data-slot="dialog-backdrop"
        />
    );
}

function DialogViewport({
    className,
    ...props
}: DialogPrimitive.Viewport.Props) {
    return (
        <DialogPrimitive.Viewport
            {...props}
            className={cn(
                "fixed inset-0 z-50 grid grid-rows-[1fr_auto_3fr] justify-items-center p-4",
                "before:pointer-events-none before:fixed before:inset-x-0 before:top-0 before:h-3 before:bg-black/32 before:opacity-100 before:content-['']",
                "before:transition-opacity before:duration-200 data-ending-style:before:opacity-0 data-starting-style:before:opacity-0",
                "after:pointer-events-none after:fixed after:inset-x-0 after:bottom-0 after:h-3 after:bg-black/32 after:opacity-100 after:content-['']",
                "after:transition-opacity after:duration-200 data-ending-style:after:opacity-0 data-starting-style:after:opacity-0",
                className
            )}
            data-slot="dialog-viewport"
        />
    );
}
