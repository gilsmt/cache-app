"use client";

import * as React from "react";

const DEFAULT_HISTORY_LIMIT = 15;
const EMPTY_HISTORY: never[] = [];

type HistoryEntry = string | number | boolean | object | null;

interface HistoryOptions<T extends HistoryEntry> {
    getEntryKey: (entry: T) => string;
    legacyStorageKey?: string;
    limit?: number;
    parseEntry: (value: unknown) => T | undefined;
    storageKey: string;
}

interface HistoryStore<T extends HistoryEntry> {
    addToHistory: (entry: T) => void;
    clearHistory: () => void;
    getServerSnapshot: () => readonly T[];
    getSnapshot: () => readonly T[];
    subscribe: (listener: () => void) => () => void;
}

const listenersByStorageKey = new Map<string, Set<() => void>>();
const versionsByStorageKey = new Map<string, number>();

/**
 * The store configuration is read once and must remain fixed for this hook's
 * lifetime.
 */
export function useHistory<T extends HistoryEntry>(
    config: HistoryOptions<T>
): {
    addToHistory: (entry: T) => void;
    clearHistory: () => void;
    history: readonly T[];
} {
    const [store] = React.useState(() => createHistoryStore({ ...config }));
    const history = React.useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getServerSnapshot
    );

    return {
        addToHistory: store.addToHistory,
        clearHistory: store.clearHistory,
        history,
    };
}

function createHistoryStore<T extends HistoryEntry>(
    options: HistoryOptions<T>
): HistoryStore<T> {
    const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
    if (!Number.isInteger(limit) || limit < 1) {
        throw new RangeError("History limit must be a positive integer");
    }

    let cachedSnapshot: readonly T[] | undefined;
    let cachedVersion = -1;

    function getSnapshot(): readonly T[] {
        const version = versionsByStorageKey.get(options.storageKey) ?? 0;
        if (cachedSnapshot === undefined || cachedVersion !== version) {
            cachedSnapshot = readHistory(options, limit);
            cachedVersion = version;
        }
        return cachedSnapshot;
    }

    function addToHistory(entry: T): void {
        const normalizedEntry = options.parseEntry(entry);
        if (normalizedEntry === undefined) {
            return;
        }

        const entryKey = options.getEntryKey(normalizedEntry);
        const next = [normalizedEntry];
        for (const existingEntry of readHistory(options, limit)) {
            if (options.getEntryKey(existingEntry) === entryKey) {
                continue;
            }
            if (next.length === limit) {
                break;
            }
            next.push(existingEntry);
        }

        writeHistory(options.storageKey, next);
        cachedSnapshot = next;
        cachedVersion = advanceStorageVersion(options.storageKey);
        emitChange(options.storageKey);
    }

    function clearHistory(): void {
        writeHistory(options.storageKey, EMPTY_HISTORY);
        cachedSnapshot = EMPTY_HISTORY;
        cachedVersion = advanceStorageVersion(options.storageKey);
        emitChange(options.storageKey);
    }

    return {
        addToHistory,
        clearHistory,
        getServerSnapshot: () => EMPTY_HISTORY,
        getSnapshot,
        subscribe: (listener) =>
            subscribeToStorageKey(options.storageKey, listener),
    };
}

function readHistory<T extends HistoryEntry>(
    options: HistoryOptions<T>,
    limit: number
): T[] {
    let raw: string | null;
    try {
        raw = localStorage.getItem(options.storageKey);
    } catch {
        // Browser storage can be unavailable in private or restricted modes.
        return EMPTY_HISTORY;
    }

    if (raw !== null) {
        let value: unknown;
        try {
            value = JSON.parse(raw);
        } catch {
            return EMPTY_HISTORY;
        }
        return parseHistory(value, options, limit);
    }

    if (options.legacyStorageKey === undefined) {
        return EMPTY_HISTORY;
    }

    let legacyRaw: string | null;
    try {
        legacyRaw = localStorage.getItem(options.legacyStorageKey);
    } catch {
        return EMPTY_HISTORY;
    }
    if (legacyRaw === null) {
        return EMPTY_HISTORY;
    }

    let legacyValue: unknown;
    try {
        legacyValue = JSON.parse(legacyRaw);
    } catch {
        removeLegacyHistory(options.legacyStorageKey);
        return EMPTY_HISTORY;
    }

    if (!isUnknownArray(legacyValue)) {
        removeLegacyHistory(options.legacyStorageKey);
        return EMPTY_HISTORY;
    }

    try {
        localStorage.setItem(options.storageKey, legacyRaw);
    } catch {
        return EMPTY_HISTORY;
    }
    removeLegacyHistory(options.legacyStorageKey);
    return parseHistory(legacyValue, options, limit);
}

function removeLegacyHistory(storageKey: string): void {
    try {
        localStorage.removeItem(storageKey);
    } catch {
        // Invalid legacy data stays ignored when storage cleanup is unavailable.
    }
}

function parseHistory<T extends HistoryEntry>(
    value: unknown,
    options: HistoryOptions<T>,
    limit: number
): T[] {
    if (!isUnknownArray(value)) {
        return EMPTY_HISTORY;
    }

    const history: T[] = [];
    for (const entry of value) {
        const parsedEntry = options.parseEntry(entry);
        if (parsedEntry === undefined) {
            continue;
        }
        if (history.length === limit) {
            break;
        }
        history.push(parsedEntry);
    }
    return history.length > 0 ? history : EMPTY_HISTORY;
}

function isUnknownArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

function writeHistory<T>(storageKey: string, entries: readonly T[]): void {
    try {
        localStorage.setItem(storageKey, JSON.stringify(entries));
    } catch {
        // Storage may be unavailable or full.
    }
}

function subscribeToStorageKey(
    storageKey: string,
    listener: () => void
): () => void {
    const isFirstListener = listenersByStorageKey.size === 0;
    let listeners = listenersByStorageKey.get(storageKey);
    if (listeners === undefined) {
        listeners = new Set();
        listenersByStorageKey.set(storageKey, listeners);
        advanceStorageVersion(storageKey);
    }
    listeners.add(listener);

    if (isFirstListener) {
        window.addEventListener("storage", handleStorageChange);
    }

    return () => {
        listeners.delete(listener);
        if (listeners.size > 0) {
            return;
        }
        listenersByStorageKey.delete(storageKey);
        if (listenersByStorageKey.size === 0) {
            window.removeEventListener("storage", handleStorageChange);
        }
    };
}

function handleStorageChange(event: StorageEvent): void {
    if (event.key === null) {
        for (const storageKey of listenersByStorageKey.keys()) {
            advanceStorageVersion(storageKey);
            emitChange(storageKey);
        }
        return;
    }

    if (listenersByStorageKey.has(event.key)) {
        advanceStorageVersion(event.key);
        emitChange(event.key);
    }
}

function advanceStorageVersion(storageKey: string): number {
    const version = (versionsByStorageKey.get(storageKey) ?? 0) + 1;
    versionsByStorageKey.set(storageKey, version);
    return version;
}

function emitChange(storageKey: string): void {
    const listeners = listenersByStorageKey.get(storageKey);
    if (listeners === undefined) {
        return;
    }
    for (const listener of listeners) {
        listener();
    }
}
