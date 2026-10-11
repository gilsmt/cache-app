"use client";

import { useLocale } from "gt-next";
import { useRouter } from "next/navigation";
import type * as React from "react";
import { useEffect } from "react";
import { useDesktopApp } from "@/lib/desktop/use-desktop-platform";

export function DesktopRedirect({ children }: React.PropsWithChildren) {
    const router = useRouter();
    const locale = useLocale();
    const { isDesktopApp } = useDesktopApp();

    useEffect(() => {
        if (isDesktopApp) {
            router.replace(`/${locale}/signin`);
        }
    }, [isDesktopApp, locale, router]);

    if (isDesktopApp) {
        return null;
    }

    return children;
}
