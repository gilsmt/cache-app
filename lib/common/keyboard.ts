import { platform } from "@base-ui/utils/platform";

export const getSystemControlKey = () => (platform.os.apple ? "⌘" : "Ctrl");

export const getSystemAltKey = () => (platform.os.apple ? "⌥" : "Alt");

export const getSystemShiftKey = () => (platform.os.apple ? "⇧" : "Shift");

const IME_KEY_CODE = 229;

export interface KeyEventTarget {
    isComposing?: boolean;
    key?: string;
    keyCode?: number;
    which?: number;
}

export interface KeyEventLike extends KeyEventTarget {
    altKey?: boolean;
    code?: string;
    ctrlKey?: boolean;
    key: string;
    metaKey?: boolean;
    nativeEvent?: KeyEventTarget;
    shiftKey?: boolean;
}

export function getKeyEventTarget(event: KeyEventLike): KeyEventTarget {
    // React copies fields at wrap time, so the native event holds the
    // truth when present.
    return event.nativeEvent ?? event;
}

export function isComposingEvent(event: KeyEventLike): boolean {
    // Some IMEs send keyCode 229 or Process key without isComposing.
    const target = getKeyEventTarget(event);
    return (
        target.isComposing === true ||
        target.keyCode === IME_KEY_CODE ||
        target.which === IME_KEY_CODE ||
        target.key === "Process"
    );
}

export function isActivationKey(event: KeyEventLike): boolean {
    if (isComposingEvent(event)) {
        return false;
    }
    return event.key === "Enter" || event.key === " " || event.code === "Space";
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
