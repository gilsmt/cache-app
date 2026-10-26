"use client";

import { T, useGT } from "gt-next";
import { SearchIcon } from "lucide-react";
import * as React from "react";
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook";
import {
    Autocomplete,
    AutocompleteCollection,
    AutocompleteEmpty,
    AutocompleteGroup,
    AutocompleteGroupLabel,
    AutocompleteInput,
    AutocompleteInputGroup,
    AutocompleteItem,
    AutocompleteList,
    AutocompleteStartAddon,
} from "@/components/ui/autocomplete";
import {
    Dialog,
    DialogHeader,
    DialogPanel,
    DialogPopup,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Kbd, KbdCombo, KbdGroup } from "@/components/ui/kbd";
import { stopPropagationForPrintableKeys } from "@/lib/common/dom";

// Re-exporting with "use client"
export { HotkeysProvider as ShortcutsProvider } from "react-hotkeys-hook";

const SYSTEM_MODIFIER_KEYS = new Set(["mod", "alt", "shift"]);
const NAVIGATION_ACTION_DESCRIPTION_PATTERN =
    /^(?:navigate to|go to|open (?:parent )?issue|open team archive)\b/u;
const NAVIGATION_CONTROL_DESCRIPTION_PATTERN = /(?:sidebar|panel|preview)$/u;

interface ShortcutItem {
    description: string;
    hotkeys: string[];
    label: string;
}

type ShortcutGroupName = "general" | "navigation";

interface ShortcutGroup {
    items: ShortcutItem[];
    label: string;
    name: ShortcutGroupName;
}

function getShortcutGroupName(
    description: string,
    navigationDescriptionPrefix: string,
    shortcutsPanelDescription: string,
    navigationDescriptions: ReadonlySet<string>
): ShortcutGroupName {
    const normalizedDescription = description.trim().toLowerCase();
    if (description === shortcutsPanelDescription) {
        return "general";
    }

    if (navigationDescriptions.has(description)) {
        return "navigation";
    }

    if (
        navigationDescriptionPrefix &&
        normalizedDescription.startsWith(
            navigationDescriptionPrefix.toLowerCase()
        )
    ) {
        return "navigation";
    }

    if (
        NAVIGATION_ACTION_DESCRIPTION_PATTERN.test(normalizedDescription) ||
        NAVIGATION_CONTROL_DESCRIPTION_PATTERN.test(normalizedDescription)
    ) {
        return "navigation";
    }

    return "general";
}

function formatShortcutKey(key: string): string {
    switch (key.toLowerCase()) {
        case "arrowdown":
            return "↓";
        case "arrowleft":
            return "←";
        case "arrowright":
            return "→";
        case "arrowup":
            return "↑";
        case "backspace":
            return "Backspace";
        case "ctrl":
            return "Ctrl";
        case "delete":
            return "Delete";
        case "enter":
            return "Enter";
        case "esc":
        case "escape":
            return "Esc";
        case "space":
            return "Space";
        default:
            return key.length === 1 ? key.toUpperCase() : key;
    }
}

export function ShortcutsDialogTrigger(
    props: React.ComponentProps<typeof DialogTrigger>
) {
    const gt = useGT();
    const { hotkeys } = useHotkeysContext();
    const [isOpen, setIsOpen] = React.useState(false);

    const navigationDescriptionPrefix = gt("Navigate to {label}", {
        label: "",
    }).trim();
    const shortcutsPanelDescription = gt("Open keyboard shortcuts panel");
    const navigationDescriptions = new Set([
        gt("Expand or collapse sidebar"),
        gt("Open or close preview"),
    ]);

    useHotkeys("mod+/, shift+?", () => setIsOpen(true), {
        description: shortcutsPanelDescription,
        useKey: true,
    });

    const hotkeysByDescription = new Map<string, string[]>();
    for (const shortcut of hotkeys) {
        const description = shortcut.description?.trim();
        if (!description) {
            continue;
        }

        const existingHotkeys = hotkeysByDescription.get(description);
        if (existingHotkeys) {
            if (!existingHotkeys.includes(shortcut.hotkey)) {
                existingHotkeys.push(shortcut.hotkey);
            }
            continue;
        }

        hotkeysByDescription.set(description, [shortcut.hotkey]);
    }

    const items: ShortcutItem[] = Array.from(
        hotkeysByDescription,
        ([description, shortcutHotkeys]) => ({
            description,
            hotkeys: shortcutHotkeys,
            label: `${description} ${shortcutHotkeys.join(" ")}`,
        })
    );

    const groups: ShortcutGroup[] = [
        { items: [], label: gt("General"), name: "general" },
        { items: [], label: gt("Navigation"), name: "navigation" },
    ];

    for (const item of items) {
        const shortcutGroupName = getShortcutGroupName(
            item.description,
            navigationDescriptionPrefix,
            shortcutsPanelDescription,
            navigationDescriptions
        );
        const shortcutGroup =
            shortcutGroupName === "navigation" ? groups[1] : groups[0];
        shortcutGroup.items.push(item);
    }

    return (
        <Dialog onOpenChange={setIsOpen} open={isOpen}>
            <DialogTrigger {...props} />
            <DialogPopup
                className="w-[calc(100%-(--spacing(12)))] max-w-md rounded-none rounded-s-2xl border-s transition-[translate,opacity,box-shadow] ease-[cubic-bezier(0.32,0.72,0,1)] before:rounded-none before:rounded-s-[calc(var(--radius-2xl)-1px)] data-ending-style:translate-x-6 data-ending-style:translate-y-0 data-ending-style:shadow-transparent data-ending-style:ease-[cubic-bezier(0.32,0.72,0,1)] data-starting-style:translate-x-6 data-starting-style:translate-y-0 data-starting-style:shadow-transparent"
                viewportClassName="flex justify-end p-0"
            >
                <DialogHeader className="p-5">
                    <DialogTitle className="text-base">
                        <T>Keyboard Shortcuts</T>
                    </DialogTitle>
                </DialogHeader>
                <DialogPanel
                    className="flex-1 flex-col gap-4 px-5"
                    onKeyDown={stopPropagationForPrintableKeys}
                >
                    <Autocomplete
                        autoHighlight={false}
                        inline
                        items={groups}
                        open
                    >
                        <AutocompleteInputGroup>
                            <AutocompleteStartAddon>
                                <SearchIcon
                                    aria-hidden
                                    className="text-muted-foreground size-4"
                                />
                            </AutocompleteStartAddon>
                            <AutocompleteInput
                                aria-label={gt("Search shortcuts")}
                                placeholder={gt("Search shortcuts")}
                            />
                        </AutocompleteInputGroup>
                        <AutocompleteEmpty>
                            <T>No shortcuts found</T>
                        </AutocompleteEmpty>
                        <AutocompleteList
                            className="not-empty:px-0"
                            shouldUseScrollArea={false}
                        >
                            {(group: ShortcutGroup) => (
                                <AutocompleteGroup
                                    items={group.items}
                                    key={group.name}
                                >
                                    <AutocompleteGroupLabel className="text-foreground px-2 pt-3 pb-2 text-sm font-medium">
                                        {group.label}
                                    </AutocompleteGroupLabel>
                                    <AutocompleteCollection>
                                        {(item: ShortcutItem) => (
                                            <AutocompleteItem
                                                key={item.description}
                                                value={item.label}
                                            >
                                                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                                    <span className="text-muted-foreground min-w-0 truncate text-sm font-medium">
                                                        {item.description}
                                                    </span>
                                                    <ShortcutHotkeys
                                                        hotkeys={item.hotkeys}
                                                    />
                                                </div>
                                            </AutocompleteItem>
                                        )}
                                    </AutocompleteCollection>
                                </AutocompleteGroup>
                            )}
                        </AutocompleteList>
                    </Autocomplete>
                </DialogPanel>
            </DialogPopup>
        </Dialog>
    );
}

interface ShortcutHotkeysProps {
    hotkeys: string[];
}

function ShortcutHotkeys({ hotkeys }: ShortcutHotkeysProps) {
    return (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {hotkeys.map((hotkey, hotkeyIndex) => (
                <React.Fragment key={hotkey}>
                    {hotkeyIndex > 0 ? (
                        <span className="text-muted-foreground text-xs text-nowrap">
                            <T>or</T>
                        </span>
                    ) : null}
                    <KbdGroup className="gap-1">
                        {hotkey.split("+").map((key) => (
                            <Kbd
                                className="border-border/60 bg-background text-muted-foreground h-6 min-w-6 rounded-sm border px-1.5 text-xs font-normal normal-case shadow-none max-sm:inline-flex"
                                key={key}
                            >
                                {SYSTEM_MODIFIER_KEYS.has(key.toLowerCase()) ? (
                                    <KbdCombo keys={key} />
                                ) : (
                                    formatShortcutKey(key)
                                )}
                            </Kbd>
                        ))}
                    </KbdGroup>
                </React.Fragment>
            ))}
        </div>
    );
}
