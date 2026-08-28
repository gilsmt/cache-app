import { T } from "gt-next";
import { Compass, Ellipsis, History, Workflow } from "lucide-react";
import type * as React from "react";
import {
    UserMenu,
    UserMenuContent,
    UserMenuFooter,
    UserMenuHeader,
    UserMenuPopup,
    UserMenuTrigger,
} from "@/components/auth/user-menu";
import { SidebarNavigationItem } from "@/components/sidebar/sidebar-navigation-item";
import {
    Menu,
    MenuLinkItem,
    MenuPopup,
    MenuTrigger,
} from "@/components/ui/menu";
import { OfflineBadge } from "@/components/ui/offline";
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarItem,
    SidebarItemValue,
    SidebarRail,
    SidebarTrigger,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/common/cn";

export function ApplicationSidebar({
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
                        label="Library"
                        shortcutKeys="mod+alt+l"
                    >
                        <T>Library</T>
                    </SidebarNavigationItem>
                    <SidebarNavigationItem
                        href="/automations"
                        icon={
                            <Workflow
                                aria-hidden
                                className="inline-block size-4 shrink-0"
                                focusable="false"
                            />
                        }
                        label="Automations"
                        shortcutKeys="mod+alt+a"
                    >
                        <T>Automations</T>
                    </SidebarNavigationItem>
                    <li>
                        <Menu>
                            <MenuTrigger
                                nativeButton={false}
                                openOnHover
                                render={<SidebarItem />}
                            >
                                <Ellipsis
                                    aria-hidden
                                    className="inline-block size-4 shrink-0"
                                    focusable="false"
                                />
                                <SidebarItemValue>
                                    <T context="sidebar.more-menu">More</T>
                                </SidebarItemValue>
                            </MenuTrigger>
                            <MenuPopup side="right">
                                <MenuLinkItem href="/recently-deleted">
                                    <History
                                        aria-hidden
                                        className="inline-block size-4 shrink-0"
                                        focusable="false"
                                    />
                                    <span className="truncate">
                                        <T>Recently deleted</T>
                                    </span>
                                </MenuLinkItem>
                            </MenuPopup>
                        </Menu>
                    </li>
                </SidebarGroup>
                {children}
            </SidebarContent>
            <SidebarRail />
        </Sidebar>
    );
}
