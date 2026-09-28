import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { getOwnerWindow } from "@/lib/common/dom";

/**
 * Prevents the browser window from unloading when the given condition is met.
 *
 * When `isEnabled` is a function, it is called each time a `beforeunload` event
 * fires to determine whether to block navigation. This allows the hook to react
 * to mutable ref state (e.g. `isDirtyRef.current`) without re-running the effect.
 */
export const usePreventWindowUnload = (
    isEnabled: boolean | (() => boolean) = true
) => {
    useIsoLayoutEffect(() => {
        const ownerWindow = getOwnerWindow();

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            const _isEnabled =
                typeof isEnabled === "function" ? isEnabled() : isEnabled;
            if (!_isEnabled) {
                return;
            }

            event.preventDefault();
            // Modern browsers show a generic message and ignore this value.
            // But it's required for older browser compatibility.
            event.returnValue = "";
        };

        ownerWindow.addEventListener("beforeunload", handleBeforeUnload);
        return () =>
            ownerWindow.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isEnabled]);
};
