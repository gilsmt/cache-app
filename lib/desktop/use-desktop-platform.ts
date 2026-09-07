"use client";

import { useSyncExternalStore } from "react";
import type { DesktopPlatform } from "@/lib/desktop/constants";
import { detectDesktopPlatform, isDesktopApp } from "@/lib/desktop/platform";

const subscribe = () => () => {
    // Platform and desktop-app detection never change during a session.
};

const getServerPlatformSnapshot = (): DesktopPlatform | null => null;

const getServerIsDesktopAppSnapshot = (): boolean => false;

export function useDesktopApp(): {
    isDesktopApp: boolean;
    platform: DesktopPlatform | null;
} {
    const isDesktopAppValue = useSyncExternalStore(
        subscribe,
        isDesktopApp,
        getServerIsDesktopAppSnapshot
    );
    const platform = useSyncExternalStore(
        subscribe,
        detectDesktopPlatform,
        getServerPlatformSnapshot
    );

    return {
        isDesktopApp: isDesktopAppValue,
        platform,
    };
}
