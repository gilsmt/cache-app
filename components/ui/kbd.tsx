"use client";

import { cn } from "cn";
import type * as React from "react";
import { useClientOnly } from "@/components/ui/client-only";
import {
    getSystemAltKey,
    getSystemControlKey,
    getSystemShiftKey,
} from "@/lib/common/keyboard";

function splitComboKeys(combo: string) {
    const parts = combo.split("+");
    let key = "";
    return parts.map((part) => {
        key = key ? `${key}+${part}` : part;
        return { key, part };
    });
}

export function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
    return (
        <kbd
            {...props}
            className={cn(
                "bg-card/50 text-muted-foreground pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-1 rounded-xl px-1.5 font-sans text-xs font-medium text-nowrap uppercase select-none max-sm:hidden [&_svg:not([class*='size-'])]:size-3",
                className
            )}
            data-slot="kbd"
        />
    );
}

export function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
    return (
        <kbd
            {...props}
            className={cn("inline-flex items-center gap-0.5", className)}
            data-slot="kbd-group"
        />
    );
}

/**
 * Renders a hotkey combo string (e.g. `"mod+shift+h"`) as key symbols,
 * resolving `mod`, `alt`, and `shift` to their platform symbols.
 *
 * Wrap in `<Kbd>`.
 */
export function KbdCombo({ keys }: { keys: string }) {
    return (
        <>
            {splitComboKeys(keys).map(({ key, part }) => (
                <ComboKeyPart key={key} part={part} />
            ))}
        </>
    );
}

export function CmdKbd() {
    return useClientOnly(getSystemControlKey());
}

export function AltKbd() {
    return useClientOnly(getSystemAltKey());
}

export function ShiftKbd() {
    return useClientOnly(getSystemShiftKey());
}

function ComboKeyPart({ part }: { part: string }) {
    const lowerPart = part.toLowerCase();
    if (lowerPart === "mod") {
        return <CmdKbd />;
    }
    if (lowerPart === "alt") {
        return <AltKbd />;
    }
    if (lowerPart === "shift") {
        return <ShiftKbd />;
    }
    return part;
}
