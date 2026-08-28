"use client";

import { T } from "gt-next";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth/client";
import { createLogger } from "@/lib/common/logs/console/logger";

const log = createLogger("logout-page-client");

export function LogoutPageClient() {
    const router = useRouter();

    useEffect(() => {
        const handleLogOut = async () => {
            try {
                const result = await authClient.signOut();
                if (result.data?.success) {
                    router.push("/");
                    router.refresh();
                } else {
                    router.push("/library");
                }
            } catch (error) {
                log.error("signOut failed", error);
                router.push("/");
            }
        };

        handleLogOut();
    }, [router]);

    return (
        <div className="flex h-dvh w-full flex-col items-center justify-center bg-muted">
            <div className="flex flex-col items-center gap-4">
                <Spinner aria-hidden className="size-8" />
                <p
                    aria-live="polite"
                    className="shimmer shimmer-duration-1000 text-muted-foreground text-sm"
                    role="status"
                >
                    <T context="Logout redirect page">Signing out…</T>
                </p>
            </div>
        </div>
    );
}
