"use client";

import { T } from "gt-next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import { createLogger } from "@/lib/common/logs/console/logger";
import { useDesktopApp } from "@/lib/desktop/use-desktop-platform";

const log = createLogger("signout-page-client");

export function SignoutPageClient() {
    const router = useRouter();
    const { isDesktopApp } = useDesktopApp();

    useEffect(() => {
        const handleSignOut = async () => {
            const returnUrl = isDesktopApp ? "/signin" : "/";
            try {
                const result = await authClient.signOut();
                if (result.data?.success) {
                    router.push(returnUrl);
                    router.refresh();
                } else {
                    router.push("/library");
                }
            } catch (error) {
                log.error("signOut failed", error);
                router.push(returnUrl);
            }
        };

        handleSignOut();
    }, [router, isDesktopApp]);

    return (
        <div className="bg-muted flex h-dvh w-full flex-col items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <Spinner aria-hidden className="size-8" />
                <p
                    aria-live="polite"
                    className="shimmer shimmer-duration-1000 text-muted-foreground text-sm"
                    role="status"
                >
                    <T context="Signout redirect page">Signing out…</T>
                </p>
            </div>
        </div>
    );
}
