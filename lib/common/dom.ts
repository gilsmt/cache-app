// `Node` can be undefined outside the DOM.
const DOCUMENT_NODE = 9;

export const canUseDOM =
    typeof window !== "undefined" &&
    typeof window.document !== "undefined" &&
    typeof window.document.createElement !== "undefined";

export function getOwnerWindow(
    node?:
        | (EventTarget & { ownerDocument?: Document | null })
        | null
        | undefined
) {
    if (isDocument(node)) {
        return node.defaultView ?? globalThis.window;
    }
    return node?.ownerDocument?.defaultView ?? globalThis.window;
}

export function getOwnerDocument(node?: Node | null) {
    if (isDocument(node)) {
        return node;
    }
    return node?.ownerDocument ?? globalThis.document;
}

function isDocument(value: unknown): value is Document {
    return (
        typeof value === "object" &&
        value !== null &&
        "nodeType" in value &&
        value.nodeType === DOCUMENT_NODE
    );
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
    const ownerWindow = getOwnerWindow(target);
    if (!(target instanceof ownerWindow.Node)) {
        return false;
    }

    return (
        target instanceof ownerWindow.HTMLElement &&
        (target.isContentEditable ||
            !!target.closest('input, textarea, select, [role="textbox"]'))
    );
}

/**
 * Stops React's synthetic keydown from bubbling past the caller for single
 * printable keys, isolating the input from a Base UI `Menu` ancestor's
 * `useTypeahead` handler — which would otherwise `preventDefault` the
 * character.
 */
export function stopPropagationForPrintableKeys(event: React.KeyboardEvent) {
    if (isPrintableKey(event)) {
        event.stopPropagation();
    }
}

/**
 * Stops React's synthetic keydown from bubbling past the caller for every key
 * a Base UI `Menu` popup would otherwise hijack while a text input inside it
 * is focused: `useTypeahead` `preventDefault`s printable characters, and
 * `useListNavigation` `preventDefault`s arrow keys plus Home/End for item
 * navigation. Broader than `stopPropagationForPrintableKeys` because menus
 * also steal caret-navigation keys.
 */
export function stopPropagationForMenuTextInputKeys(
    event: React.KeyboardEvent
) {
    if (isMenuTextInputKey(event)) {
        event.stopPropagation();
    }
}

function hasModifier(event: React.KeyboardEvent): boolean {
    return event.ctrlKey || event.metaKey || event.altKey;
}

function isPrintableKey(event: React.KeyboardEvent): boolean {
    return event.key.length === 1 && event.key !== " " && !hasModifier(event);
}

function isMenuTextInputKey(event: React.KeyboardEvent): boolean {
    if (hasModifier(event)) {
        return false;
    }
    return (
        event.key.length === 1 ||
        event.key.startsWith("Arrow") ||
        event.key === "Home" ||
        event.key === "End"
    );
}
