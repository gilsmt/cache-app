"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useGT } from "gt-next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type * as React from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { ActivePathname } from "@/components/ui/active-pathname";
import { Kbd, KbdCombo } from "@/components/ui/kbd";
import { SidebarItem, SidebarItemValue } from "@/components/ui/sidebar";
import { normalizePathname } from "@/lib/common/url";

interface SidebarNavigationShortcutProps {
    href: string;
    /** Item name used to build the localized hotkey description. */
    label: string;
    shortcutKeys: string;
}

interface SidebarNavigationItemProps extends React.ComponentProps<typeof Link> {
    href: string;
    icon: React.ReactNode;
    /** Item name used to build the localized hotkey description. */
    label: string;
    shortcutKeys?: string;
}

export function SidebarNavigationShortcut({
    href,
    label,
    shortcutKeys,
}: SidebarNavigationShortcutProps) {
    const gt = useGT();
    const router = useRouter();

    const pathname = usePathname();

    const handleShortcut = useStableCallback(() => {
        if (normalizePathname(pathname) === normalizePathname(href)) {
            return;
        }

        router.push(href);
    });

    useHotkeys(shortcutKeys, handleShortcut, {
        description: gt("Navigate to {label}", { label }),
        preventDefault: true,
    });

    return null;
}

export function SidebarNavigationItem({
    href,
    icon,
    label,
    shortcutKeys,
    children,
    "aria-label": ariaLabelProp,
    title: titleProp,
    ...props
}: SidebarNavigationItemProps) {
    const gt = useGT();

    const ariaLabel = ariaLabelProp ?? gt(label);
    const title = titleProp ?? ariaLabel;

    return (
        <li>
            {shortcutKeys ? (
                <SidebarNavigationShortcut
                    href={href}
                    label={label}
                    shortcutKeys={shortcutKeys}
                />
            ) : null}
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
