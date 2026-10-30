import { useSyncExternalStore } from "react";
import { CACHE_EXTENSION_READY_EVENT } from "@/lib/common/constants";
import { getOwnerWindow } from "@/lib/common/dom";
import { asRecord } from "@/lib/common/object";

function readExtensionInstalledFlag(window: Window): boolean {
    try {
        return (
            window.document.documentElement.dataset.cacheExtensionInstalled ===
            "true"
        );
    } catch {
        return false;
    }
}

function subscribe(callbackFn: () => void) {
    const ownerWindow = getOwnerWindow();

    const handleMessage = (event: MessageEvent<unknown>) => {
        if (asRecord(event.data)?.type !== CACHE_EXTENSION_READY_EVENT) {
            return;
        }
        callbackFn();
    };

    ownerWindow.addEventListener(CACHE_EXTENSION_READY_EVENT, callbackFn);
    ownerWindow.addEventListener("message", handleMessage);

    return () => {
        ownerWindow.removeEventListener(
            CACHE_EXTENSION_READY_EVENT,
            callbackFn
        );
        ownerWindow.removeEventListener("message", handleMessage);
    };
}

export function useIsExtensionInstalled(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => readExtensionInstalledFlag(getOwnerWindow()),
        () => false
    );
}
