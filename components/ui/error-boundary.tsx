// biome-ignore-all lint/correctness/useHookAtTopLevel: False positive
"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T } from "gt-next";
import { catchError, type ErrorInfo } from "next/error";
import { useOffline } from "next/offline";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { isNetworkError } from "@/lib/common/network";

const CHUNK_OR_HYDRATION_ERROR_RE =
    /ChunkLoadError|CSSChunkLoadError|Loading chunk failed|Failed to fetch dynamically imported module|Hydration failed|Invariant Violation|Minified React error/u;

interface ErrorFallbackComponentProps {
    title: React.ReactNode;
}

export function ErrorFallbackComponent(
    props: ErrorFallbackComponentProps,
    { error, retry }: ErrorInfo
) {
    const isOffline = useOffline();

    // Heuristics to decide between soft reset vs hard reload
    const isAbortError =
        error instanceof DOMException && error.name === "AbortError";
    const isChunkLoadOrHydration =
        error instanceof Error &&
        CHUNK_OR_HYDRATION_ERROR_RE.test(`${error.name} ${error.message}`);

    const handleClick = useStableCallback(() => {
        if ((isNetworkError(error) && !isOffline) || isAbortError) {
            // Local soft retry/remount for transient or aborted operations
            retry();
            return;
        }

        if (isChunkLoadOrHydration) {
            // Likely requires a full reload to fetch new chunks or recover hydration
            window.location.reload();
            return;
        }

        // Default: try a soft reset
        retry();
    });

    return (
        <div className="flex min-w-0 flex-col items-center justify-center gap-3 p-4 text-center">
            <h2 className="text-foreground text-sm font-medium">
                {props.title}
            </h2>
            <p className="text-muted-foreground text-sm">
                <T>We couldn't load this section.</T>
            </p>
            <Button onClick={handleClick} size="xs" variant="ghost">
                <T>Try again</T>
            </Button>
        </div>
    );
}

export const ErrorBoundary = catchError(ErrorFallbackComponent);
