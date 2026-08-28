"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import * as React from "react";

const HISTORY_LIMIT = 15;

/**
 * Individual search terms are capped so a pasted novel can't bloat
 * localStorage or the rendered list. 200 chars comfortably covers any
 * realistic search query while keeping worst-case storage bounded.
 */
const TERM_MAX_LENGTH = 200;

const LEGACY_STORAGE_KEY = "cache:searchHistory";
const STORAGE_KEY = "cache:searchHistory:v1";

const EMPTY_HISTORY: string[] = [];

let listeners: Array<() => void> = [];
let cachedSnapshot: string[] | undefined;

function normalizeTerm(term: string): string {
    return term.trim().slice(0, TERM_MAX_LENGTH);
}

function readSearchHistory(): string[] {
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
                        return readSearchHistory();
                    }
                } catch {
                    // Legacy data was invalid; start fresh.
                }
                localStorage.removeItem(LEGACY_STORAGE_KEY);
            }
            return EMPTY_HISTORY;
        }
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return EMPTY_HISTORY;
        }
        const terms = parsed
            .filter((entry): entry is string => typeof entry === "string")
            .map(normalizeTerm)
            .filter((term) => term.length > 0)
            .slice(0, HISTORY_LIMIT);
        return terms.length > 0 ? terms : EMPTY_HISTORY;
    } catch {
        return EMPTY_HISTORY;
    }
}

function writeSearchHistory(terms: string[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(terms));
    } catch {
        // Storage unavailable (quota, private mode...)
    }
}

function emitChange() {
    for (const listener of listeners) {
        listener();
    }
}

function getSnapshot(): string[] {
    if (cachedSnapshot === undefined) {
        cachedSnapshot = readSearchHistory();
    }
    return cachedSnapshot;
}

function getServerSnapshot(): string[] {
    return EMPTY_HISTORY;
}

function subscribe(listener: () => void): () => void {
    if (listeners.length === 0) {
        cachedSnapshot = undefined; // The cache is only valid while at least one subscriber exists.
    }
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

export function useSearchHistory(): {
    clearSearchHistory: () => void;
    recordSearchTerm: (term: string) => void;
    searchHistory: string[];
} {
    const searchHistory = React.useSyncExternalStore(
        subscribe,
        getSnapshot,
        getServerSnapshot
    );

    const recordSearchTerm = useStableCallback((term: string) => {
        const normalized = normalizeTerm(term);
        if (!normalized) {
            return;
        }

        const current = readSearchHistory();
        const next = [
            normalized,
            ...current.filter(
                (t) => t.toLowerCase() !== normalized.toLowerCase()
            ),
        ].slice(0, HISTORY_LIMIT);
        writeSearchHistory(next);
        cachedSnapshot = next;
        emitChange();
    });

    const clearSearchHistory = useStableCallback(() => {
        cachedSnapshot = EMPTY_HISTORY;
        writeSearchHistory(EMPTY_HISTORY);
        emitChange();
    });

    return { clearSearchHistory, recordSearchTerm, searchHistory };
}
