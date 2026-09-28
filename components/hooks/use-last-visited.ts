"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import * as React from "react";

const HISTORY_LIMIT = 50;
const LEGACY_STORAGE_KEY = "cache:lastVisitedItemIds";
const STORAGE_KEY = "cache:lastVisitedItemIds:v1";

let listeners: Array<() => void> = [];
let cachedSnapshot: string[] | null | undefined;

function isQuotaExceededError(error: unknown): boolean {
    return (
        error instanceof DOMException &&
        (error.name === "QuotaExceededError" ||
            // Legacy WebKit / Firefox names.
            error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
            error.code === 22)
    );
}

function readLastVisitedItemIds(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) {
            const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
            if (legacyRaw !== null) {
                try {
                    const parsed = JSON.parse(legacyRaw);
                    if (Array.isArray(parsed)) {
                        localStorage.setItem(STORAGE_KEY, legacyRaw);
                        localStorage.removeItem(LEGACY_STORAGE_KEY);
                        return readLastVisitedItemIds();
                    }
                } catch {
                    // Legacy data was invalid; start fresh.
                }
                localStorage.removeItem(LEGACY_STORAGE_KEY);
            }
            return [];
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }
        const strings = parsed.filter(
            (entry): entry is string => typeof entry === "string"
        );
        return strings.length > 0 ? strings : [];
    } catch {
        return [];
    }
}

function writeLastVisitedItemIds(ids: string[]): string[] {
    let candidate = ids;
    for (;;) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
            return candidate;
        } catch (error) {
            if (!isQuotaExceededError(error) || candidate.length <= 1) {
                // Keep the last known good snapshot — never adopt an
                // unpersisted list that would diverge from storage.
                return cachedSnapshot ?? [];
            }
            candidate = candidate.slice(0, Math.floor(candidate.length / 2));
        }
    }
}

function emitChange() {
    for (const listener of listeners) {
        listener();
    }
}

function getSnapshot(): string[] {
    // `undefined` distinguishes "not yet read" from a real `[]` (no
    // stored items), so the first read hits storage exactly once per
    // change.
    if (cachedSnapshot === undefined) {
        cachedSnapshot = readLastVisitedItemIds();
    }
    return cachedSnapshot ?? readLastVisitedItemIds();
}

function getServerSnapshot(): string[] {
    return [];
}

function subscribe(listener: () => void): () => void {
    listeners.push(listener);

    const handleStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === STORAGE_KEY) {
            cachedSnapshot = undefined;
            listener();
        }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
        listeners = listeners.filter((l) => l !== listener);
        window.removeEventListener("storage", handleStorage);
    };
}

interface UseLastVisitedReturnType {
    isLastVisited: (itemId: string) => boolean;
    lastVisitedItemIds: string[];
    markVisited: (itemId: string) => void;
}

export function useLastVisited(): UseLastVisitedReturnType {
    const lastVisitedItemIds = React.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
    );

    const markVisited = useStableCallback((itemId: string) => {
        const current = cachedSnapshot ?? readLastVisitedItemIds();
        const next = [itemId, ...current.filter((id) => id !== itemId)].slice(
            0,
            HISTORY_LIMIT
        );
        const persisted = writeLastVisitedItemIds(next);
        cachedSnapshot = persisted;
        emitChange();
    });

    const isLastVisited = (itemId: string): boolean =>
        itemId === lastVisitedItemIds[0];

    return { isLastVisited, lastVisitedItemIds, markVisited };
}
