"use client";

import { T, useGT } from "gt-next";
import { SearchIcon } from "lucide-react";
import * as React from "react";
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook";
import {
    Command,
    CommandCollection,
    CommandEmpty,
    CommandGroup,
    CommandGroupLabel,
    CommandInput,
    CommandItem,
    CommandList,
    useCommandFilter,
} from "@/components/ui/command";
import {
    Drawer,
    DrawerHeader,
    DrawerPanel,
    DrawerPopup,
    DrawerTitle,
    DrawerTrigger,
    DrawerViewport,
} from "@/components/ui/drawer";
import { Kbd, KbdCombo, KbdGroup } from "@/components/ui/kbd";
import { stopPropagationForPrintableKeys } from "@/lib/common/dom";

// Re-exporting with "use client"
export { HotkeysProvider as ShortcutsProvider } from "react-hotkeys-hook";

const SYSTEM_MODIFIER_KEYS = new Set(["mod", "alt", "shift"]);

interface ShortcutItem {
    description: string;
    hotkeys: string[];
    searchValue: string;
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
        /^(?:navigate to|go to|open (?:parent )?issue|open team archive)\b/.test(
            normalizedDescription
        ) ||
        /(?:sidebar|panel|preview)$/.test(normalizedDescription)
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

export function KeyboardShortcutsDialogTrigger(
    props: React.ComponentProps<typeof DrawerTrigger>
) {
    const gt = useGT();
    const [isOpen, setIsOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");
    const filter = useCommandFilter();
    const { hotkeys } = useHotkeysContext();
    const navigationDescriptionPrefix = gt(
        "Navigate to {label}",
        { label: "" }
    ).trim();
    const shortcutsPanelDescription = gt("Open keyboard shortcuts panel");
    const navigationDescriptions = new Set([
        gt("Expand or collapse sidebar"),
        gt("Open or close preview"),
    ]);

    useHotkeys("mod+/, shift+?", () => setIsOpen(true), {
        description: shortcutsPanelDescription,
        useKey: true,
    });

    const handleOpenChange = (shouldOpen: boolean) => {
        setIsOpen(shouldOpen);
        if (!shouldOpen) {
            setSearchQuery("");
        }
    };

    const shortcutHotkeysByDescription = new Map<string, string[]>();
    for (const shortcut of hotkeys) {
        const description = shortcut.description?.trim();
        if (!description) {
            continue;
        }

        const existingHotkeys = shortcutHotkeysByDescription.get(description);
        if (existingHotkeys) {
            if (!existingHotkeys.includes(shortcut.hotkey)) {
                existingHotkeys.push(shortcut.hotkey);
            }
            continue;
        }

        shortcutHotkeysByDescription.set(description, [shortcut.hotkey]);
    }

    const shortcutItems: ShortcutItem[] = Array.from(
        shortcutHotkeysByDescription,
        ([description, hotkeys]) => ({
            description,
            hotkeys,
            searchValue: `${description} ${hotkeys.join(" ")}`,
        })
    );

    const shortcutGroups: ShortcutGroup[] = [
        { items: [], label: gt("General"), name: "general" },
        { items: [], label: gt("Navigation"), name: "navigation" },
    ];

    for (const item of shortcutItems) {
        const shortcutGroupName = getShortcutGroupName(
            item.description,
            navigationDescriptionPrefix,
            shortcutsPanelDescription,
            navigationDescriptions
        );
        const shortcutGroup =
            shortcutGroupName === "navigation"
                ? shortcutGroups[1]
                : shortcutGroups[0];
        shortcutGroup.items.push(item);
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const visibleShortcutGroups = shortcutGroups
        .map((group) => ({
            ...group,
            items: normalizedQuery
                ? group.items.filter((item) =>
                      filter.contains(
                          item.searchValue.toLowerCase(),
                          normalizedQuery
                      )
                  )
                : group.items,
        }))
        .filter((group) => group.items.length > 0);

    return (
        <Drawer onOpenChange={handleOpenChange} open={isOpen} position="right">
            <DrawerTrigger {...props} />
            <DrawerViewport>
                <DrawerPopup shouldShowCloseButton>
                    <DrawerHeader>
                        <DrawerTitle className="text-base">
                            <T>Keyboard Shortcuts</T>
                        </DrawerTitle>
                    </DrawerHeader>
                    <DrawerPanel
                        className="px-5"
                        isScrollable={false}
                        onKeyDown={stopPropagationForPrintableKeys}
                    >
                        <Command
                            autoHighlight={false}
                            filteredItems={visibleShortcutGroups}
                            inline
                            items={shortcutGroups}
                            onValueChange={setSearchQuery}
                            open
                            value={searchQuery}
                        >
                            <CommandInput
                                aria-label={gt("Search shortcuts")}
                                className="rounded-xl"
                                placeholder={gt("Search shortcuts")}
                                startAddon={
                                    <SearchIcon
                                        aria-hidden
                                        className="size-4 text-muted-foreground"
                                    />
                                }
                            />
                            <CommandList className="px-0">
                                <CommandEmpty>
                                    <T>No shortcuts found</T>
                                </CommandEmpty>
                                {(group: ShortcutGroup) => (
                                    <CommandGroup
                                        items={group.items}
                                        key={group.name}
                                    >
                                        <CommandGroupLabel className="px-2 pt-3 pb-2 font-medium text-foreground text-sm">
                                            {group.label}
                                        </CommandGroupLabel>
                                        <CommandCollection>
                                            {(item: ShortcutItem) => (
                                                <CommandItem
                                                    key={item.description}
                                                    value={item.searchValue}
                                                >
                                                    <div className="flex w-full min-w-0 items-center justify-between gap-3">
                                                        <span className="min-w-0 truncate font-normal text-muted-foreground text-sm">
                                                            {item.description}
                                                        </span>
                                                        <ShortcutKeys
                                                            hotkeys={item.hotkeys}
                                                        />
                                                    </div>
                                                </CommandItem>
                                            )}
                                        </CommandCollection>
                                    </CommandGroup>
                                )}
                            </CommandList>
                        </Command>
                    </DrawerPanel>
                </DrawerPopup>
            </DrawerViewport>
        </Drawer>
    );
}

interface ShortcutKeysProps {
    hotkeys: string[];
}

function ShortcutKeys({ hotkeys }: ShortcutKeysProps) {
    return (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
            {hotkeys.map((hotkey, hotkeyIndex) => (
                <React.Fragment key={hotkey}>
                    {hotkeyIndex > 0 && (
                        <span className="text-muted-foreground text-xs">
                            <T>or</T>
                        </span>
                    )}
                    <KbdGroup className="gap-1">
                        {hotkey.split("+").map((key, keyIndex) => (
                            <Kbd
                                className="h-6 min-w-6 rounded-sm border border-border/60 bg-background px-1.5 font-normal text-muted-foreground text-xs normal-case shadow-none max-sm:inline-flex"
                                key={`${key}-${keyIndex}`}
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
