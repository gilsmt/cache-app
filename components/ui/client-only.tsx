"use client";

import * as React from "react";

function useClientBoundary() {
    return React.useSyncExternalStore(
        () => () => {
            // No-op
        },
        () => "client",
        () => "server"
    );
}

export function useClientOnly<T>(value: T, fallback?: T): T | null {
    const boundaryValue = useClientBoundary();
    return boundaryValue === "server" ? (fallback ?? null) : value;
}

export function ClientOnly({ children }: React.PropsWithChildren) {
    const boundaryValue = useClientBoundary();
    return boundaryValue === "server" ? null : children;
}
