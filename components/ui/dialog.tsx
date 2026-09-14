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
    shouldShowCloseButton?: boolean;
}

export function DialogPopup({
    className,
    children,
    shouldShowCloseButton = true,
    portalProps,
    ...props
}: DialogPopupProps) {
    return (
        <DialogPrimitive.Portal {...portalProps}>
            <DialogBackdrop />
            <DialogViewport>
                <DialogPrimitive.Popup
                    {...props}
                    className={cn(
                        "relative row-start-2 flex max-h-full min-h-0 w-full min-w-0 max-w-lg flex-col rounded-xl bg-popover not-dark:bg-clip-padding text-popover-foreground opacity-[calc(1-var(--nested-dialogs))] shadow-lg/5 outline-none transition-[translate,opacity] duration-200 ease-out will-change-transform before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(var(--radius-xl)-1px)] before:shadow-[0_1px_--theme(--color-black/4%)] data-ending-style:translate-y-5 data-starting-style:translate-y-4 data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:duration-100 data-ending-style:ease-in dark:before:shadow-[0_-1px_--theme(--color-white/6%)]",
                        className
                    )}
                    data-slot="dialog-popup"
                >
                    {children}
                    {shouldShowCloseButton ? (
                        <DialogPrimitive.Close
                            aria-label="Close"
                            className="absolute inset-e-2 top-2"
                            render={<Button size="icon" variant="ghost" />}
                        >
                            <XIcon />
                        </DialogPrimitive.Close>
                    ) : null}
                </DialogPrimitive.Popup>
            </DialogViewport>
        </DialogPrimitive.Portal>
    );
}

interface DialogPanelProps extends useRender.ComponentProps<"div"> {
    shouldScrollFade?: boolean;
}

export function DialogPanel({
    className,
    shouldScrollFade = true,
    render,
    ...props
}: DialogPanelProps) {
    const defaultProps = {
        className: cn(
            "p-6 in-[[data-slot=dialog-popup]:has([data-slot=dialog-header])]:pt-1 in-[[data-slot=dialog-popup]:has([data-slot=dialog-footer]:not(.border-t))]:pb-1",
            className
        ),
        "data-slot": "dialog-panel",
    };

    return (
        <ScrollArea shouldScrollFade={shouldScrollFade}>
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
            className={cn("font-semibold text-lg leading-none", className)}
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
                className
            )}
            data-slot="dialog-viewport"
        />
    );
}
