import { platform } from "@base-ui/utils/platform";
import type { KeyboardEvent } from "react";

export const getSystemControlKey = () => (platform.os.apple ? "⌘" : "Ctrl");

export const getSystemAltKey = () => (platform.os.apple ? "⌥" : "Alt");

export const getSystemShiftKey = () => (platform.os.apple ? "⇧" : "Shift");

export function isKeyboardActivation(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing) {
        // Ignore key events during IME composition
        return false;
    }
    return (
        event.key === "Enter" ||
        event.key === "Process" ||
        event.key === " " ||
        event.code === "Space"
    );
}
