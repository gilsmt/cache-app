"use client";

import { useGT } from "gt-next";
import { RadioOff } from "lucide-react";
import { useOffline } from "next/offline";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";

export function OfflineBadge() {
    const gt = useGT();
    const label = gt(
        "You are offline. Any changes you make may be lost until you regain connectivity. Please check your connection and try again."
    );

    return (
        <OfflineOnly>
            <Badge
                aria-live="assertive"
                role="alert"
                title={label}
                variant="outline"
            >
                <RadioOff aria-hidden className="size-4" focusable="false" />
                <span data-sidebar-collapsible="">Offline</span>
                <span className="sr-only">{label}</span>
            </Badge>
        </OfflineOnly>
    );
}

/**
 * Renders `children` only while the app is offline. There is no loading
 * state: `useOffline` starts `false` on the server and hydrates in sync, so
 * the online shell never flashes before the true state applies.
 */
interface OfflineOnlyProps {
    children: React.ReactNode;
}

export function OfflineOnly({ children }: OfflineOnlyProps) {
    const isOffline = useOffline();

    return isOffline ? children : null;
}

/**
 * Renders `children` only while the app is online. Invert `OfflineOnly` for
 * affordances like "retry now" buttons that only make sense with a
 * connection.
 */
interface OnlineOnlyProps {
    children: React.ReactNode;
}

export function OnlineOnly({ children }: OnlineOnlyProps) {
    const isOffline = useOffline();

    return isOffline ? null : children;
}
