"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useGT } from "gt-next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { ActivePathname } from "@/components/ui/active-pathname";
import { Kbd, KbdCombo } from "@/components/ui/kbd";
import { SidebarItem, SidebarItemValue } from "@/components/ui/sidebar";

interface SidebarNavigationItemProps extends React.ComponentProps<typeof Link> {
    href: string;
    icon: React.ReactNode;
    /** Item name used to build the localized hotkey description. */
    label: string;
    shortcutKeys?: string;
}

export function SidebarNavigationItem({
    href,
    icon,
    label,
    onMouseDown: onMouseDownProp,
    shortcutKeys,
    children,
    ...props
}: SidebarNavigationItemProps) {
    const gt = useGT();
    const router = useRouter();

    const handleMouseDown = useStableCallback(
        (event: React.MouseEvent<HTMLAnchorElement>) => {
            onMouseDownProp?.(event);

            if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey
            ) {
                return;
            }

            router.push(href);
        }
    );

    const handleShortcut = useStableCallback(() => {
        router.push(href);
    });

    useHotkeys(shortcutKeys ?? "", handleShortcut, {
        description: gt("Navigate to {label}", { label }),
        enabled: !!shortcutKeys,
        preventDefault: true,
    });

    return (
        <li>
            <ActivePathname
                href={href}
                render={
                    <SidebarItem
                        render={
                            <Link
                                {...props}
                                href={href}
                                onMouseDown={handleMouseDown}
                            />
                        }
                    >
                        {icon}
                        <SidebarItemValue>{children}</SidebarItemValue>
                        {shortcutKeys ? (
                            <Kbd
                                className="ml-auto bg-transparent opacity-0 transition-none! group-hover:opacity-50 group-focus-visible:opacity-50"
                                data-sidebar-label=""
                            >
                                <KbdCombo keys={shortcutKeys} />
                            </Kbd>
                        ) : null}
                    </SidebarItem>
                }
            />
        </li>
    );
}
