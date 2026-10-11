import { platform } from "@base-ui/utils/platform";

export const getSystemControlKey = () => (platform.os.apple ? "⌘" : "Ctrl");

export const getSystemAltKey = () => (platform.os.apple ? "⌥" : "Alt");

export const getSystemShiftKey = () => (platform.os.apple ? "⇧" : "Shift");

export interface KeyEventLike {
    altKey?: boolean;
    code?: string;
    ctrlKey?: boolean;
    isComposing?: boolean;
    key: string;
    metaKey?: boolean;
    nativeEvent?: { isComposing?: boolean };
    shiftKey?: boolean;
}

export function isComposingEvent(event: KeyEventLike): boolean {
    // DOM events carry isComposing on the event. React and Base UI wrap the
    // native event, so read both shapes.
    return event.isComposing ?? event.nativeEvent?.isComposing ?? false;
}

export function isActivationKey(event: KeyEventLike): boolean {
    if (isComposingEvent(event)) {
        return false;
    }
    return (
        event.key === "Enter" ||
        event.key === "Process" ||
        event.key === " " ||
        event.code === "Space"
    );
}

export function isSubmitKey(event: KeyEventLike): boolean {
    if (isComposingEvent(event)) {
        return false;
    }
    return (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
    );
}
