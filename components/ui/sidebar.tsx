"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import type { BaseUIEvent } from "@base-ui/react/types";
import { useRender } from "@base-ui/react/use-render";
import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { useGT, useMessages } from "gt-next";
import { ChevronRight, PanelLeft, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import {
    ActivePathname,
    isPathnameActive,
} from "@/components/ui/active-pathname";
import { Button } from "@/components/ui/button";
import { Kbd, KbdCombo } from "@/components/ui/kbd";
import {
    Menu,
    MenuLinkItem,
    MenuPopup,
    MenuShortcut,
    MenuTrigger,
} from "@/components/ui/menu";
import {
    getOwnerDocument,
    getOwnerWindow,
    isTextEntryTarget,
} from "@/lib/common/dom";
import { getSystemControlKey } from "@/lib/common/keyboard";
import { normalizePathname } from "@/lib/common/url";

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

interface SidebarMenuPromotedLink {
    content: React.ReactNode;
    href: string;
    icon: React.ReactNode;
    label: string;
    shortcutKeys?: string;
}

function useSidebarNavigationHotkey(
    href: string,
    label: string,
    shortcutKeys?: string
) {
    const gt = useGT();
    const m = useMessages();
    const router = useRouter();

    const pathname = usePathname();

    const handleShortcut = useStableCallback(() => {
        if (normalizePathname(pathname) === normalizePathname(href)) {
            return;
        }
        router.push(href);
    });

    const translatedLabel = m(label);

    useHotkeys(shortcutKeys ?? "", handleShortcut, {
        description: gt("Navigate to {label}", { label: translatedLabel }),
        enabled: Boolean(shortcutKeys),
        preventDefault: true,
    });
}

function getSidebarMenuLinkHref(child: React.ReactNode): string | null {
    if (
        React.isValidElement<{ href?: unknown }>(child) &&
        typeof child.props.href === "string"
    ) {
        return child.props.href;
    }
    return null;
}

function getSidebarMenuPopupLinks(
    popup: React.ReactElement<{ children?: React.ReactNode }>
): React.ReactElement[] {
    return React.Children.toArray(popup.props.children).filter(
        (child): child is React.ReactElement =>
            React.isValidElement(child) &&
            getSidebarMenuLinkHref(child) !== null
    );
}

function findSidebarMenuPopup(
    menuChildren: React.ReactNode[]
): React.ReactElement<{ children?: React.ReactNode }> | null {
    for (const child of menuChildren) {
        if (
            React.isValidElement<{ children?: React.ReactNode }>(child) &&
            child.props.children !== undefined &&
            getSidebarMenuPopupLinks(child).length > 0
        ) {
            return child;
        }
    }
    return null;
}

function findActiveSidebarMenuLink(
    popupChildren: React.ReactNode[],
    pathname: string | null
): SidebarMenuPromotedLink | null {
    if (!pathname) {
        return null;
    }
    for (const element of popupChildren) {
        if (
            !React.isValidElement<{
                href?: unknown;
                icon?: React.ReactNode;
                label?: unknown;
                shortcutKeys?: unknown;
                children?: React.ReactNode;
            }>(element)
        ) {
            continue;
        }
        const { href, icon, label, shortcutKeys, children } = element.props;
        if (typeof href !== "string") {
            continue;
        }
        if (typeof label !== "string") {
            continue;
        }
        if (!isPathnameActive(pathname, href, "exact")) {
            continue;
        }
        return {
            content: children,
            href,
            icon,
            label,
            shortcutKeys:
                typeof shortcutKeys === "string" ? shortcutKeys : undefined,
        };
    }
    return null;
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
        const isToggleShortcut =
            event.key.toLowerCase() === SIDEBAR_KEYBOARD_SHORTCUT &&
            !event.altKey &&
            (event.metaKey || event.ctrlKey);

        if (
            event.defaultPrevented ||
            event.isComposing ||
            !ownerWindow.matchMedia(SIDEBAR_DESKTOP_MEDIA_QUERY).matches ||
            !isToggleShortcut ||
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
            aria-label="Sidebar"
            className={cn(
                "peer group/sidebar relative inset-y-0 flex min-h-full w-full shrink-0 flex-col gap-8 overscroll-contain px-8 py-7 transition-[left,right,width,padding] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] data-[side=right]:right-0 data-[side=left]:left-0 motion-reduce:transition-none lg:w-[400px] lg:max-w-[400px] lg:justify-between lg:data-[state=collapsed]:w-16 lg:data-[state=collapsed]:px-3 lg:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:transition-[opacity,display] lg:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:transition-discrete lg:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:duration-150 lg:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:ease-out motion-reduce:lg:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:transition-none lg:data-[state=collapsed]:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:hidden lg:data-[state=collapsed]:[&_[data-sidebar-collapsible],&_[data-sidebar-label]]:opacity-0 lg:[&_[data-sidebar-label]]:min-w-0 lg:[&_[data-sidebar-label]]:overflow-hidden lg:[&_[data-sidebar-label]]:text-nowrap lg:data-[state=collapsed]:[&_[data-sidebar=item]]:justify-center lg:data-[state=collapsed]:[&_[data-sidebar=item]]:px-0",
                className
            )}
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
                "no-scrollbar -mx-1 flex max-h-full min-h-0 w-full min-w-0 select-none flex-col gap-6 overflow-auto p-1 lg:sticky lg:top-8 lg:max-h-[calc(100vh-(var(--spacing)*8))]",
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
            aria-label={open ? gt("Close sidebar") : gt("Open sidebar")}
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
            "group relative flex h-8 max-h-8 min-h-8 min-w-0 flex-1 cursor-default select-none items-center gap-1.5 truncate rounded-lg bg-clip-padding px-2.5 text-left font-medium text-[13px] text-foreground leading-[normal] opacity-70 before:absolute before:inset-0 before:-z-10 before:rounded-lg before:bg-muted before:opacity-0 before:transition-transform before:duration-100 before:will-change-transform hover:opacity-100 hover:before:opacity-100 focus-visible:opacity-100 active:before:scale-x-[0.99] active:before:scale-y-[0.98] active:before:opacity-80! data-[active=true]:before:opacity-100",
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
                "absolute inset-y-0 z-20 hidden w-2 ease-linear after:absolute after:inset-s-1/2 after:inset-y-0 after:w-px after:bg-muted/70 hover:after:w-0.5 group-data-[side=left]/sidebar:right-0 group-data-[side=right]/sidebar:left-0 lg:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2",
                "in-data-[side=left]:cursor-w-resize! in-data-[side=right]:cursor-e-resize!",
                "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize! [[data-side=right][data-state=collapsed]_&]:cursor-w-resize!",
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

export function SidebarMenu({
    children,
    ...props
}: React.ComponentProps<typeof Menu>) {
    const pathname = usePathname();

    if (typeof children === "function") {
        return (
            <li
                className="list-none"
                data-sidebar="menu"
                data-slot="sidebar-menu"
            >
                <Menu {...props}>{children}</Menu>
            </li>
        );
    }

    const menuChildren = React.Children.toArray(children);
    const popup = findSidebarMenuPopup(menuChildren);

    if (!popup) {
        return (
            <li
                className="list-none"
                data-sidebar="menu"
                data-slot="sidebar-menu"
            >
                <Menu {...props}>{children}</Menu>
            </li>
        );
    }

    const popupChildren = React.Children.toArray(popup.props.children);
    const promoted = findActiveSidebarMenuLink(popupChildren, pathname);

    if (!(promoted && pathname)) {
        return (
            <li
                className="list-none"
                data-sidebar="menu"
                data-slot="sidebar-menu"
            >
                <Menu {...props}>{children}</Menu>
            </li>
        );
    }

    const remainingPopupChildren = popupChildren.filter((child) => {
        const href = getSidebarMenuLinkHref(child);
        return href === null || !isPathnameActive(pathname, href, "exact");
    });

    if (remainingPopupChildren.length === 0) {
        return (
            <SidebarNavigationItem
                href={promoted.href}
                icon={promoted.icon}
                label={promoted.label}
                shortcutKeys={promoted.shortcutKeys}
            >
                {promoted.content}
            </SidebarNavigationItem>
        );
    }

    const filteredPopup = React.cloneElement(
        popup,
        undefined,
        remainingPopupChildren
    );
    const filteredChildren = menuChildren.map((child) =>
        child === popup ? filteredPopup : child
    );

    return (
        <>
            <SidebarNavigationItem
                href={promoted.href}
                icon={promoted.icon}
                label={promoted.label}
                shortcutKeys={promoted.shortcutKeys}
            >
                {promoted.content}
            </SidebarNavigationItem>
            <li
                className="list-none"
                data-sidebar="menu"
                data-slot="sidebar-menu"
            >
                <Menu {...props}>{filteredChildren}</Menu>
            </li>
        </>
    );
}

interface SidebarMenuTriggerProps
    extends React.ComponentProps<typeof MenuTrigger> {
    icon: React.ReactNode;
}

export function SidebarMenuTrigger({
    icon,
    children,
    nativeButton = false,
    openOnHover = true,
    render = <SidebarItem />,
    ...props
}: SidebarMenuTriggerProps) {
    return (
        <MenuTrigger
            {...props}
            nativeButton={nativeButton}
            openOnHover={openOnHover}
            render={render}
        >
            <SidebarItemIcon>{icon}</SidebarItemIcon>
            <SidebarItemValue>{children}</SidebarItemValue>
            <ChevronRight
                aria-hidden
                className="invisible ml-auto inline-block size-4 shrink-0 text-muted-foreground opacity-80 group-hover:visible group-focus-visible:visible group-data-popup-open:visible group-data-popup-open:opacity-30"
                data-sidebar-label=""
                focusable="false"
            />
        </MenuTrigger>
    );
}

export function SidebarMenuPopup({
    align = "start",
    collisionAvoidance = { fallbackAxisSide: "end" },
    positionMethod = "fixed",
    side = "inline-end",
    ...props
}: React.ComponentProps<typeof MenuPopup>) {
    return (
        <MenuPopup
            {...props}
            align={align}
            collisionAvoidance={collisionAvoidance}
            positionMethod={positionMethod}
            side={side}
        />
    );
}

interface SidebarMenuLinkItemProps
    extends React.ComponentProps<typeof MenuLinkItem> {
    href: string;
    icon: React.ReactNode;
    label: string;
    shortcutKeys?: string;
}

export function SidebarMenuLinkItem({
    className,
    href,
    icon,
    label,
    shortcutKeys,
    children,
    "aria-label": ariaLabelProp,
    title: titleProp,
    ...props
}: SidebarMenuLinkItemProps) {
    const m = useMessages();

    useSidebarNavigationHotkey(href, label, shortcutKeys);

    const ariaLabel = ariaLabelProp ?? m(label);
    const title = titleProp ?? ariaLabel;

    return (
        <MenuLinkItem
            {...props}
            aria-label={ariaLabel}
            className={cn("group", className)}
            href={href}
            title={title}
        >
            <SidebarItemIcon>{icon}</SidebarItemIcon>
            <span className="truncate">{children}</span>
            {shortcutKeys ? <SidebarMenuShortcut keys={shortcutKeys} /> : null}
        </MenuLinkItem>
    );
}

interface SidebarMenuShortcutProps
    extends React.ComponentProps<typeof MenuShortcut> {
    keys: string;
}

export function SidebarMenuShortcut({
    className,
    keys,
    ...props
}: SidebarMenuShortcutProps) {
    return (
        <MenuShortcut
            {...props}
            className={cn(
                "invisible text-muted-foreground opacity-80 group-hover:visible group-focus-visible:visible group-data-highlighted:visible",
                className
            )}
        >
            <KbdCombo keys={keys} />
        </MenuShortcut>
    );
}

interface SidebarNavigationItemProps extends React.ComponentProps<typeof Link> {
    href: string;
    icon: React.ReactNode;
    label: string;
    shortcutKeys?: string;
    trailing?: React.ReactNode;
}

export function SidebarNavigationItem({
    href,
    icon,
    label,
    shortcutKeys,
    trailing,
    children,
    "aria-label": ariaLabelProp,
    title: titleProp,
    ...props
}: SidebarNavigationItemProps) {
    const m = useMessages();

    useSidebarNavigationHotkey(href, label, shortcutKeys);

    const ariaLabel = ariaLabelProp ?? m(label);
    const title = titleProp ?? ariaLabel;
    const shortcut = shortcutKeys ? (
        <SidebarItemShortcut keys={shortcutKeys} />
    ) : null;

    return (
        <li
            className="list-none"
            data-sidebar="navigation-item"
            data-slot="sidebar-navigation-item"
        >
            <ActivePathname
                href={href}
                render={
                    <SidebarItem
                        render={
                            <Link
                                {...props}
                                aria-label={ariaLabel}
                                href={href}
                                title={title}
                            />
                        }
                    >
                        <SidebarItemIcon>{icon}</SidebarItemIcon>
                        <SidebarItemValue>{children}</SidebarItemValue>
                        {trailing ? (
                            <span
                                className="ml-auto grid shrink-0 items-center justify-items-end [>*]:col-start-1 [>*]:row-start-1"
                                data-sidebar-label=""
                            >
                                <span
                                    className={cn(
                                        "absolute min-w-0 shrink-0 [grid-area:1/1]",
                                        shortcutKeys &&
                                            "group-hover:hidden group-focus-visible:hidden"
                                    )}
                                >
                                    {trailing}
                                </span>
                                {shortcut}
                            </span>
                        ) : (
                            shortcut
                        )}
                    </SidebarItem>
                }
            />
        </li>
    );
}

interface SidebarItemIconProps {
    children: React.ReactNode;
}

function SidebarItemIcon({ children }: SidebarItemIconProps) {
    return (
        <span
            aria-hidden="true"
            className="flex shrink-0 items-center justify-center [&_svg]:size-4 [&_svg]:shrink-0"
            data-sidebar="item-icon"
        >
            {children}
        </span>
    );
}

interface SidebarItemShortcutProps {
    keys: string;
}

function SidebarItemShortcut({ keys }: SidebarItemShortcutProps) {
    return (
        <Kbd
            className="invisible ml-auto bg-transparent opacity-80 group-hover:visible group-focus-visible:visible"
            data-sidebar-label=""
        >
            <KbdCombo keys={keys} />
        </Kbd>
    );
}
