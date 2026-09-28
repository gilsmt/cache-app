import { useSyncExternalStore } from "react";
import { CACHE_EXTENSION_READY_EVENT } from "@/lib/common/constants";
import { getOwnerWindow } from "@/lib/common/dom";

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

// function hasExtensionReadyMessage(payload: unknown): boolean {
//     return asRecord(payload)?.type === CACHE_EXTENSION_READY_EVENT;
// }

function subscribe(callbackFn: () => void) {
    const ownerWindow = getOwnerWindow();

    ownerWindow.addEventListener(CACHE_EXTENSION_READY_EVENT, callbackFn);
    ownerWindow.addEventListener("message", callbackFn);

    return () => {
        ownerWindow.removeEventListener(
            CACHE_EXTENSION_READY_EVENT,
            callbackFn
        );
        ownerWindow.removeEventListener("message", callbackFn);
    };
}

export function useIsExtensionInstalled(): boolean {
    return useSyncExternalStore(
        subscribe,
        () => readExtensionInstalledFlag(getOwnerWindow()),
        () => false
    );
}
