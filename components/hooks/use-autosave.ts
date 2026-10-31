import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useTimeout } from "@base-ui/utils/useTimeout";
import { useValueAsRef } from "@base-ui/utils/useValueAsRef";
import { useEffect, useRef, useState } from "react";
import { usePreventWindowUnload } from "@/components/hooks/use-prevent-unload";
import { createLogger } from "@/lib/common/logs/console/logger";

const log = createLogger("use-autosave");
const MIN_SAVING_DISPLAY_MS = 600;
const SAVE_STATUS_IDLE_DELAY_MS = 2000;

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * Result of an `onSave` call.
 * - `false` marks failure.
 * - `string` marks success and becomes the new saved baseline.
 */
type AutosaveResult = string | false;

interface ActiveSave {
    contentVersion: number;
    promise: Promise<boolean>;
}

interface UseAutosaveOptions {
    content: string;
    delay?: number;
    enabled?: boolean;
    onSave: (content: string) => Promise<AutosaveResult> | AutosaveResult;
    savedContent: string;
}

interface UseAutosaveReturn {
    isDirty: boolean;
    saveImmediately: () => Promise<boolean>;
    status: AutosaveStatus;
}

/**
 * Shared autosave hook that debounces content changes and persists them automatically.
 * Keeps Cmd+S / Save button working via `saveImmediately`, and flushes on unmount
 * so edits aren't lost when navigating away.
 */
export function useAutosave({
    content,
    savedContent,
    onSave: onSaveProp,
    delay = 1500,
    enabled = true,
}: UseAutosaveOptions): UseAutosaveReturn {
    const [status, setSaveStatus] = useState<AutosaveStatus>("idle");
    const debounceTimeout = useTimeout();
    const idleTimeout = useTimeout();

    const contentRef = useValueAsRef(content);
    const savedContentRef = useValueAsRef(savedContent);
    const onSave = useStableCallback(onSaveProp);
    const delayRef = useValueAsRef(delay);
    const enabledRef = useValueAsRef(enabled);

    const activeSaveRef = useRef<ActiveSave | null>(null);
    const latestContentChangeMsRef = useRef(0);
    // Text can return to the same value after an edit while a save is pending.
    const contentChangeVersionRef = useRef(0);
    const isMountedRef = useRef(false);
    const savingStartMsRef = useRef(0);

    const isDirty = content !== savedContent;
    const isDirtyRef = useValueAsRef(isDirty);

    const checkShouldPreventUnload = useStableCallback(
        () => activeSaveRef.current !== null || isDirtyRef.current
    );
    usePreventWindowUnload(checkShouldPreventUnload);

    const scheduleSettledStatus = useStableCallback(
        (nextStatus: AutosaveStatus) => {
            if (!isMountedRef.current) {
                return;
            }

            const elapsedMs = Date.now() - savingStartMsRef.current;
            const remainingMs = Math.max(0, MIN_SAVING_DISPLAY_MS - elapsedMs);

            idleTimeout.start(remainingMs, () => {
                if (!isMountedRef.current) {
                    return;
                }

                setSaveStatus(nextStatus);
                idleTimeout.start(SAVE_STATUS_IDLE_DELAY_MS, () => {
                    if (isMountedRef.current) {
                        setSaveStatus("idle");
                    }
                });
            });
        }
    );

    useIsoLayoutEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    useIsoLayoutEffect(() => {
        latestContentChangeMsRef.current = Date.now();
        contentChangeVersionRef.current += 1;
    }, [content]);

    const saveRef = useRef<(shouldFlushQueued?: boolean) => Promise<boolean>>(
        () => Promise.resolve(true)
    );

    const save = useStableCallback(
        (shouldFlushQueued = false): Promise<boolean> => {
            if (!enabledRef.current) {
                return Promise.resolve(true);
            }

            // A pending write can make a draft dirty even when it matches the old baseline.
            const activeSave = activeSaveRef.current;
            if (activeSave) {
                if (!shouldFlushQueued) {
                    return activeSave.promise;
                }

                const contentVersion = activeSave.contentVersion;
                return activeSave.promise.then((didSave) => {
                    if (
                        !didSave &&
                        contentChangeVersionRef.current === contentVersion
                    ) {
                        return false;
                    }

                    return saveRef.current(true);
                });
            }

            const contentToSave = contentRef.current;
            if (contentToSave === savedContentRef.current) {
                return Promise.resolve(true);
            }

            idleTimeout.clear();
            savingStartMsRef.current = Date.now();
            if (isMountedRef.current) {
                setSaveStatus("saving");
            }
            const contentVersion = contentChangeVersionRef.current;

            const savePromise = (async () => {
                let didSave = false;
                try {
                    const result = await Promise.resolve().then(() =>
                        onSave(contentToSave)
                    );
                    if (result !== false) {
                        didSave = true;
                        savedContentRef.current = result;
                    }
                } catch (error) {
                    log.error("Save failed", error);
                }

                activeSaveRef.current = null;
                const isCurrentContentSaved =
                    contentRef.current === savedContentRef.current;
                scheduleSettledStatus(
                    didSave || isCurrentContentSaved ? "saved" : "error"
                );

                if (
                    enabledRef.current &&
                    contentRef.current !== savedContentRef.current
                ) {
                    const hasNewerChanges =
                        contentChangeVersionRef.current !== contentVersion;
                    if (!(didSave || hasNewerChanges)) {
                        return false;
                    }

                    if (shouldFlushQueued) {
                        return saveRef.current(true);
                    }

                    const elapsedSinceChangeMs =
                        Date.now() - latestContentChangeMsRef.current;
                    const remainingCooldownMs = Math.max(
                        0,
                        delayRef.current - elapsedSinceChangeMs
                    );

                    debounceTimeout.start(remainingCooldownMs, () => {
                        saveRef.current().catch((error: unknown) => {
                            log.error("Queued autosave failed", error);
                        });
                    });
                }

                return didSave || isCurrentContentSaved;
            })();

            activeSaveRef.current = { contentVersion, promise: savePromise };
            return savePromise;
        }
    );
    saveRef.current = save;

    useEffect(() => {
        if (!enabled || content === savedContent || activeSaveRef.current) {
            return;
        }
        debounceTimeout.start(delayRef.current, save);
        return debounceTimeout.clear;
    }, [content, savedContent, enabled, save, debounceTimeout, delayRef]);

    useEffect(
        () => () => {
            // A pending write can still change the saved baseline after unmount.
            if (
                enabledRef.current &&
                (activeSaveRef.current !== null ||
                    contentRef.current !== savedContentRef.current)
            ) {
                save(true).catch((error: unknown) => {
                    log.error("Unmount autosave failed", error);
                });
            }
        },
        [contentRef, enabledRef, save, savedContentRef]
    );

    const saveImmediately = useStableCallback(async () => {
        debounceTimeout.clear();
        return await save(true);
    });

    return { isDirty, saveImmediately, status };
}
