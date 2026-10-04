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
import { Suspense } from "react";
import {
    UserMenu,
    UserMenuContent,
    UserMenuFooter,
    UserMenuHeader,
    UserMenuPopup,
    UserMenuTrigger,
} from "@/components/auth/user-menu";
import { AutomationsCount } from "@/components/automations/count";
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
                <nav aria-label="Main navigation">
                    <SidebarGroup>
                        <SidebarNavigationItem
                            href="/library"
                            icon={<Compass />}
                            label={msg("Library")}
                            shortcutKeys="mod+alt+h"
                        >
                            <T>Library</T>
                        </SidebarNavigationItem>
                        <SidebarNavigationItem
                            href="/automations"
                            icon={<ClockFading />}
                            label={msg("Automations")}
                            shortcutKeys="mod+alt+a"
                            trailing={
                                <Suspense>
                                    <AutomationsCount />
                                </Suspense>
                            }
                        >
                            <T>Automations</T>
                        </SidebarNavigationItem>
                        <SidebarMenu>
                            <SidebarMenuTrigger icon={<Ellipsis />}>
                                <T context="sidebar.more-menu">More</T>
                            </SidebarMenuTrigger>
                            <SidebarMenuPopup>
                                <SidebarMenuLinkItem
                                    href="/comments"
                                    icon={<MessageSquare />}
                                    label={msg("Comments")}
                                    shortcutKeys={COMMENTS_SHORTCUT_KEYS}
                                >
                                    <T>Comments</T>
                                </SidebarMenuLinkItem>
                                <SidebarMenuLinkItem
                                    href="/recently-deleted"
                                    icon={<History />}
                                    label={msg("Recently deleted")}
                                    shortcutKeys={
                                        RECENTLY_DELETED_SHORTCUT_KEYS
                                    }
                                >
                                    <T>Recently deleted</T>
                                </SidebarMenuLinkItem>
                            </SidebarMenuPopup>
                        </SidebarMenu>
                    </SidebarGroup>
                </nav>
                {children}
            </SidebarContent>
            <SidebarRail />
        </Sidebar>
    );
}
