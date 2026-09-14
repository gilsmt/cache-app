"use client";

import { useRefWithInit } from "@base-ui/utils/useRefWithInit";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import * as React from "react";

export const HOVER_HOTKEY_REGIONS = {
    collections: "collections",
    libraryCards: "library-cards",
} as const;

export type HoverHotkeyRegion =
    (typeof HOVER_HOTKEY_REGIONS)[keyof typeof HOVER_HOTKEY_REGIONS];

/**
 * Arbitrates hover-driven hotkeys between regions that can overlap on screen
 * (for example collection rows and library cards on the library page).
 *
 * - A region claims the surface while it is hovered and releases on
 *   leave/unmount. The most recent claim owns the surface.
 * - A region's own hotkeys proceed only while `isOwnedBy(region)` is true.
 * - Passive surfaces (that never claim) yield while `isClaimed()` is true.
 * - `release` is claim-id scoped so a stale release (for example from a row
 *   that already lost its claim to a newer hover) never clobbers the active
 *   claim.
 * - `clear` force-resets the surface when hover state becomes unreliable
 *   (window blur, tab hide, list remount).
 */
export interface HoverHotkeySurface<Region extends string> {
    claim: (region: Region) => number;
    clear: () => void;
    isClaimed: () => boolean;
    isOwnedBy: (region: Region) => boolean;
    release: (claimId: number) => void;
}

interface HoverHotkeyRegionClaim {
    claim: () => void;
    release: () => void;
}

const HoverHotkeySurfaceContext =
    React.createContext<HoverHotkeySurface<HoverHotkeyRegion> | null>(null);

export function useHoverHotkeySurface(): HoverHotkeySurface<HoverHotkeyRegion> {
    const context = React.use(HoverHotkeySurfaceContext);
    if (!context) {
        throw new Error(
            "Hover hotkey surface must be read within a HoverHotkeySurfaceProvider."
        );
    }
    return context;
}

export function createHoverHotkeySurface<
    Region extends string,
>(): HoverHotkeySurface<Region> {
    let activeClaimId = 0;
    let activeRegion: Region | null = null;
    let nextClaimId = 0;

    return {
        claim: (region) => {
            nextClaimId += 1;
            activeClaimId = nextClaimId;
            activeRegion = region;
            return activeClaimId;
        },
        clear: () => {
            activeClaimId = 0;
            activeRegion = null;
        },
        isClaimed: () => activeClaimId !== 0,
        isOwnedBy: (region) => activeClaimId !== 0 && activeRegion === region,
        release: (claimId) => {
            if (activeClaimId === claimId) {
                activeClaimId = 0;
                activeRegion = null;
            }
        },
    };
}

/**
 * Claims the surface for `region` and guarantees the claim is released when
 * the calling component unmounts, so navigating away can never leave a stale
 * claim behind. Pair `claim`/`release` with the hover lifecycle; the unmount
 * release is a safety net, not a replacement for releasing on leave.
 */
export function useHoverHotkeyRegionClaim(
    region: HoverHotkeyRegion
): HoverHotkeyRegionClaim {
    const surface = useHoverHotkeySurface();
    const claimIdRef = React.useRef(0);

    const claim = useStableCallback(() => {
        claimIdRef.current = surface.claim(region);
    });

    const release = useStableCallback(() => {
        surface.release(claimIdRef.current);
        claimIdRef.current = 0;
    });

    React.useEffect(() => release, [release]);

    return { claim, release };
}

export function HoverHotkeySurfaceProvider({
    children,
}: React.PropsWithChildren) {
    const surface = useRefWithInit(
        createHoverHotkeySurface<HoverHotkeyRegion>
    ).current;

    return (
        <HoverHotkeySurfaceContext value={surface}>
            {children}
        </HoverHotkeySurfaceContext>
    );
}
