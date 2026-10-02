import { cn } from "cn";
import { msg, T } from "gt-next";
import {
    ClockFading,
    Compass,
    Ellipsis,
    History,
    MessageSquare,
} from "lucide-react";
import type * as React from "react";
import {
    UserMenu,
    UserMenuContent,
    UserMenuFooter,
    UserMenuHeader,
    UserMenuPopup,
    UserMenuTrigger,
} from "@/components/auth/user-menu";
import { OfflineBadge } from "@/components/ui/offline";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarItem,
    SidebarMenu,
    SidebarMenuLinkItem,
    SidebarMenuPopup,
    SidebarMenuTrigger,
    SidebarNavigationItem,
    SidebarNavigationShortcut,
    SidebarRail,
    SidebarTrigger,
} from "@/components/ui/sidebar";

const COMMENTS_SHORTCUT_KEYS = "mod+alt+c";
const RECENTLY_DELETED_SHORTCUT_KEYS = "mod+alt+r";

export function SidebarPanel({
    children,
    className,
    ...props
}: React.ComponentProps<typeof Sidebar>) {
    return (
        <Sidebar {...props} className={cn("pt-0", className)}>
            <SidebarContent className="gap-3 py-8 lg:top-0 lg:max-h-dvh">
                <div className="flex items-center justify-between gap-1">
                    <UserMenu>
                        <SidebarItem
                            className="px-2 opacity-100 data-popup-open:before:opacity-100"
                            data-sidebar-collapsible=""
                            render={<UserMenuTrigger />}
                        />
                        <UserMenuPopup>
                            <UserMenuHeader />
                            <UserMenuContent />
                            <UserMenuFooter />
                        </UserMenuPopup>
                    </UserMenu>
                    <OfflineBadge />
                    <SidebarTrigger />
                </div>
                <SidebarGroup>
                    <SidebarNavigationItem
                        href="/library"
                        icon={
                            <Compass
                                aria-hidden
                                className="inline-block size-4 shrink-0"
                                focusable="false"
                            />
                        }
                        label={msg("Library")}
                        shortcutKeys="mod+alt+h"
                    >
                        <T>Library</T>
                    </SidebarNavigationItem>
                    <SidebarNavigationItem
                        href="/automations"
                        icon={
                            <ClockFading
                                aria-hidden
                                className="inline-block size-4 shrink-0"
                                focusable="false"
                            />
                        }
                        label={msg("Automations")}
                        shortcutKeys="mod+alt+a"
                    >
                        <T>Automations</T>
                    </SidebarNavigationItem>
                    <SidebarNavigationShortcut
                        href="/comments"
                        label={msg("Comments")}
                        shortcutKeys={COMMENTS_SHORTCUT_KEYS}
                    />
                    <SidebarNavigationShortcut
                        href="/recently-deleted"
                        label={msg("Recently deleted")}
                        shortcutKeys={RECENTLY_DELETED_SHORTCUT_KEYS}
                    />
                    <SidebarMenu>
                        <SidebarMenuTrigger
                            icon={
                                <Ellipsis
                                    aria-hidden
                                    className="inline-block size-4 shrink-0"
                                    focusable="false"
                                />
                            }
                        >
                            <T context="sidebar.more-menu">More</T>
                        </SidebarMenuTrigger>
                        <SidebarMenuPopup>
                            <SidebarMenuLinkItem
                                href="/comments"
                                icon={
                                    <MessageSquare
                                        aria-hidden
                                        className="inline-block size-4 shrink-0"
                                        focusable="false"
                                    />
                                }
                                shortcutKeys={COMMENTS_SHORTCUT_KEYS}
                            >
                                <T>Comments</T>
                            </SidebarMenuLinkItem>
                            <SidebarMenuLinkItem
                                href="/recently-deleted"
                                icon={
                                    <History
                                        aria-hidden
                                        className="inline-block size-4 shrink-0"
                                        focusable="false"
                                    />
                                }
                                shortcutKeys={RECENTLY_DELETED_SHORTCUT_KEYS}
                            >
                                <T>Recently deleted</T>
                            </SidebarMenuLinkItem>
                        </SidebarMenuPopup>
                    </SidebarMenu>
                </SidebarGroup>
                {children}
            </SidebarContent>
            <SidebarRail />
        </Sidebar>
    );
}
