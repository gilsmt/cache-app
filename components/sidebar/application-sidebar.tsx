import { cn } from "cn";
import { T } from "gt-next";
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
import {
    SidebarNavigationItem,
    SidebarNavigationShortcut,
} from "@/components/sidebar/sidebar-navigation-item";
import { KbdCombo } from "@/components/ui/kbd";
import {
    Menu,
    MenuLinkItem,
    MenuPopup,
    MenuShortcut,
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

const COMMENTS_SHORTCUT_KEYS = "mod+alt+c";
const RECENTLY_DELETED_SHORTCUT_KEYS = "mod+alt+r";

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
                        label="Automations"
                        shortcutKeys="mod+alt+a"
                    >
                        <T>Automations</T>
                    </SidebarNavigationItem>
                    <SidebarNavigationShortcut
                        href="/comments"
                        label="Comments"
                        shortcutKeys={COMMENTS_SHORTCUT_KEYS}
                    />
                    <SidebarNavigationShortcut
                        href="/recently-deleted"
                        label="Recently deleted"
                        shortcutKeys={RECENTLY_DELETED_SHORTCUT_KEYS}
                    />
                    <li>
                        <Menu>
                            <MenuTrigger
                                aria-label="More"
                                nativeButton={false}
                                openOnHover
                                render={<SidebarItem />}
                                title="More"
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
                                <MenuLinkItem href="/comments">
                                    <MessageSquare
                                        aria-hidden
                                        className="inline-block size-4 shrink-0"
                                        focusable="false"
                                    />
                                    <span className="truncate">
                                        <T>Comments</T>
                                    </span>
                                    <MenuShortcut>
                                        <KbdCombo
                                            keys={COMMENTS_SHORTCUT_KEYS}
                                        />
                                    </MenuShortcut>
                                </MenuLinkItem>
                                <MenuLinkItem href="/recently-deleted">
                                    <History
                                        aria-hidden
                                        className="inline-block size-4 shrink-0"
                                        focusable="false"
                                    />
                                    <span className="truncate">
                                        <T>Recently deleted</T>
                                    </span>
                                    <MenuShortcut>
                                        <KbdCombo
                                            keys={
                                                RECENTLY_DELETED_SHORTCUT_KEYS
                                            }
                                        />
                                    </MenuShortcut>
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
