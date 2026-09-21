"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import type { BaseUIEvent } from "@base-ui/react/types";
import { useRender } from "@base-ui/react/use-render";
import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { useGT } from "gt-next";
import { PanelLeft, PanelLeftOpen } from "lucide-react";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import {
    getOwnerDocument,
    getOwnerWindow,
    isTextEntryTarget,
} from "@/lib/common/dom";
import { getSystemControlKey } from "@/lib/common/keyboard";

const SIDEBAR_COOKIE_NAME = "sidebar_state";
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SIDEBAR_DESKTOP_MEDIA_QUERY = "(min-width: 64rem)";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

type SidebarState = "expanded" | "collapsed";

interface SidebarContext {
    open: boolean;
    setOpen: (open: boolean) => void;
    state: SidebarState;
    toggleSidebar: () => void;
}

const SidebarContext = React.createContext<SidebarContext | null>(null);

export function useSidebarContext() {
    const context = React.use(SidebarContext);
    if (!context) {
        throw new Error(
            "useSidebarContext must be used within a SidebarProvider."
        );
    }
    return context;
}

function isSidebarKeyboardShortcut(event: KeyboardEvent): boolean {
    return (
        event.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT &&
        !event.altKey &&
        (event.metaKey || event.ctrlKey)
    );
}

function getSidebarToggleLabel(
    gt: ReturnType<typeof useGT>,
    open: boolean
): string {
    return open ? gt("Close sidebar") : gt("Open sidebar");
}

function getSidebarToggleTitle(
    gt: ReturnType<typeof useGT>,
    open: boolean
): string {
    const shortcut = `${getSystemControlKey()}B`;
    return open
        ? gt("Close sidebar ({shortcut})", { shortcut })
        : gt("Open sidebar ({shortcut})", { shortcut });
}

function readSidebarCookieOpen(): boolean {
    try {
        const match = getOwnerDocument().cookie.match(
            new RegExp(`(?:^|; )${SIDEBAR_COOKIE_NAME}=([^;]*)`)
        );
        return match?.[1] !== "false";
    } catch {
        return true;
    }
}

export function SidebarProvider({
    defaultOpen = true,
    open: openProp,
    onOpenChange,
    children,
}: {
    children: React.ReactNode;
    defaultOpen?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}) {
    const gt = useGT();
    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
    const open = openProp ?? uncontrolledOpen;
    const hasAppliedCookieDefaultRef = React.useRef(openProp !== undefined);

    useIsoLayoutEffect(() => {
        if (hasAppliedCookieDefaultRef.current || openProp !== undefined) {
            return;
        }
        hasAppliedCookieDefaultRef.current = true;
        setUncontrolledOpen(readSidebarCookieOpen());
    }, [openProp]);

    const setOpen = useStableCallback(
        (nextValue: boolean | ((prev: boolean) => boolean)) => {
            const nextOpen =
                typeof nextValue === "function" ? nextValue(open) : nextValue;
            onOpenChange?.(nextOpen);

            if (openProp === undefined) {
                setUncontrolledOpen(nextOpen);
            }

            getOwnerDocument().cookie = `${SIDEBAR_COOKIE_NAME}=${nextOpen}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
        }
    );

    const toggleSidebar = useStableCallback(() => {
        setOpen((prev) => !prev);
    });

    const handleKeyDown = useStableCallback((event: KeyboardEvent) => {
        const ownerWindow = getOwnerWindow();

        if (
            event.defaultPrevented ||
            event.isComposing ||
            !ownerWindow.matchMedia(SIDEBAR_DESKTOP_MEDIA_QUERY).matches ||
            !isSidebarKeyboardShortcut(event) ||
            isTextEntryTarget(event.target)
        ) {
            return;
        }

        event.preventDefault();
        toggleSidebar();
    });

    useHotkeys("mod+b", handleKeyDown, {
        description: gt("Expand or collapse sidebar"),
    });

    const state = open ? "expanded" : "collapsed";
    const contextValue = {
        open,
        setOpen,
        state,
        toggleSidebar,
    } satisfies SidebarContext;

    return <SidebarContext value={contextValue}>{children}</SidebarContext>;
}

interface SidebarProps extends React.ComponentProps<"aside"> {
    side?: "left" | "right";
}

export function Sidebar({ className, side = "left", ...props }: SidebarProps) {
    // We don't consume useSidebarContext() here so <Sidebar> can optionally be used outside of <SidebarContext>
    const state = React.use(SidebarContext)?.state ?? "expanded";

    return (
        <aside
            {...props}
            className={cn(
                "peer group/sidebar relative inset-y-0 flex min-h-full w-full shrink-0 flex-col gap-8 overscroll-contain px-8 py-7 transition-[left,right,width,padding] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-[side=right]:right-0 data-[side=left]:left-0 motion-reduce:transition-none lg:w-[400px] lg:max-w-[400px] lg:justify-between lg:data-[state=collapsed]:w-16 lg:data-[state=collapsed]:px-3 lg:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:transition-[opacity,display] lg:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:transition-discrete lg:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:duration-150 lg:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:ease-out motion-reduce:lg:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:transition-none lg:data-[state=collapsed]:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:hidden lg:data-[state=collapsed]:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:opacity-0 lg:[&_[data-sidebar-label]]:min-w-0 lg:[&_[data-sidebar-label]]:overflow-hidden lg:[&_[data-sidebar-label]]:text-nowrap lg:data-[state=collapsed]:[&_[data-sidebar=item]]:justify-center lg:data-[state=collapsed]:[&_[data-sidebar=item]]:px-0",
                className
            )}
            data-collapsible="icon"
            data-side={side}
            data-slot="sidebar"
            data-state={state}
        />
    );
}

export function SidebarContent({
    className,
    ...props
}: React.ComponentProps<"section">) {
    return (
        <section
            {...props}
            className={cn(
                "no-scrollbar -mx-1 flex max-h-full min-h-0 w-full min-w-0 flex-col gap-6 overflow-auto p-1 lg:sticky lg:top-8 lg:max-h-[calc(100vh-(var(--spacing)*8))]",
                className
            )}
            data-sidebar="content"
            data-slot="sidebar-content"
        />
    );
}

export function SidebarTrigger({
    className,
    onClick,
    ...props
}: React.ComponentProps<typeof Button>) {
    const gt = useGT();
    const { open, toggleSidebar } = useSidebarContext();

    const handleClick = useStableCallback(
        (event: BaseUIEvent<React.MouseEvent<HTMLButtonElement>>) => {
            onClick?.(event);
            if (event.defaultPrevented) {
                return;
            }
            toggleSidebar();
        }
    );

    return (
        <Button
            {...props}
            aria-label={getSidebarToggleLabel(gt, open)}
            className={cn(
                "hidden h-8 min-h-8 min-w-8 shrink-0 opacity-50 hover:opacity-100 lg:inline-flex",
                open ? "cursor-w-resize" : "cursor-e-resize",
                className
            )}
            data-sidebar="trigger"
            data-slot="sidebar-trigger"
            onClick={handleClick}
            size="icon-sm"
            title={getSidebarToggleTitle(gt, open)}
            variant="ghost"
        >
            {open ? (
                <PanelLeft
                    aria-hidden
                    className="inline-block size-4 shrink-0"
                    focusable="false"
                />
            ) : (
                <PanelLeftOpen
                    aria-hidden
                    className="inline-block size-4 shrink-0"
                    focusable="false"
                />
            )}
        </Button>
    );
}

export function SidebarFooter({
    className,
    ...props
}: React.ComponentProps<"div">) {
    return (
        <div
            {...props}
            className={cn(
                "flex w-full flex-col gap-6 lg:sticky lg:bottom-8",
                className
            )}
            data-sidebar="footer"
            data-slot="sidebar-footer"
        />
    );
}

export function SidebarGroup({
    className,
    ...props
}: React.ComponentProps<"ul">) {
    return (
        <ul
            {...props}
            className={cn(
                "relative flex w-full min-w-0 list-none flex-col gap-px",
                className
            )}
            data-sidebar="group"
            data-slot="sidebar-group"
        />
    );
}

export function SidebarItem({
    className,
    render,
    ...props
}: useRender.ComponentProps<"div">) {
    const defaultProps = {
        className: cn(
            "group relative flex h-8 max-h-8 min-h-8 min-w-0 flex-1 cursor-default select-none items-center gap-1.5 truncate rounded-lg px-2.5 text-left font-medium text-[13px] text-foreground leading-[normal] opacity-70 before:absolute before:inset-0 before:-z-10 before:rounded-lg before:bg-muted before:opacity-0 before:transition-transform before:duration-100 before:will-change-transform hover:opacity-100 hover:before:opacity-100 focus-visible:opacity-100 active:before:scale-x-[0.99] active:before:scale-y-[0.98] active:before:opacity-80! data-[active=true]:before:opacity-100",
            className
        ),
        "data-sidebar": "item",
        "data-slot": "sidebar-item",
    };

    return useRender({
        defaultTagName: "div",
        props: mergeProps<"div">(defaultProps, props),
        render,
    });
}

export function SidebarItemValue({ children }: React.PropsWithChildren) {
    return (
        <div
            className="flex min-w-0 flex-1 grow items-center"
            data-sidebar-label=""
        >
            <span className="truncate">{children}</span>
        </div>
    );
}

export function SidebarRail({
    className,
    ...props
}: React.ComponentProps<"button">) {
    const gt = useGT();
    const { toggleSidebar, open } = useSidebarContext();

    return (
        <button
            {...props}
            className={cn(
                "absolute inset-y-0 z-20 hidden w-2 transition-all ease-linear after:absolute after:inset-s-1/2 after:inset-y-0 after:w-[2px] hover:after:bg-muted! group-data-[side=left]/sidebar:right-0 group-data-[side=right]/sidebar:left-0 lg:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2",
                "in-data-[side=left]:cursor-w-resize! in-data-[side=right]:cursor-e-resize!",
                "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize! [[data-side=right][data-state=collapsed]_&]:cursor-w-resize!",
                "group-data-[collapsible=offcanvas]/sidebar:translate-x-0 hover:group-data-[collapsible=offcanvas]/sidebar:bg-muted group-data-[collapsible=offcanvas]/sidebar:after:left-full",
                "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
                "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
                className
            )}
            data-sidebar="rail"
            data-slot="sidebar-rail"
            onClick={toggleSidebar}
            tabIndex={-1}
            title={getSidebarToggleTitle(gt, open)}
        />
    );
}
