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
    if (!canUseDOM) {
        throw new Error("Cannot access window outside of the DOM");
    }
    return node?.ownerDocument?.defaultView ?? globalThis.window;
}

export function getOwnerDocument(node?: Node | Document | null | undefined) {
    if (!canUseDOM) {
        throw new Error("Cannot access document outside of the DOM");
    }
    return node?.ownerDocument ?? globalThis.document;
}

export function getComputedStyle(element: Element, pseudoElement?: string) {
    return getOwnerWindow(element).getComputedStyle(element, pseudoElement);
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
    if (
        event.key.length === 1 &&
        event.key !== " " &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
    ) {
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
    if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
    }
    const isMenuHandledKey =
        event.key.length === 1 ||
        event.key.startsWith("Arrow") ||
        event.key === "Home" ||
        event.key === "End";
    if (isMenuHandledKey) {
        event.stopPropagation();
    }
}
