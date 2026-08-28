"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T, useGT } from "gt-next";
import * as React from "react";
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook";
import {
    Command,
    CommandCollection,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
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

interface ShortcutItem {
    description: string;
    hotkey: string;
    label: string;
}

/**
 * Button that opens a read-only drawer listing all library keyboard shortcuts.
 */
export function KeyboardShortcutsDialogTrigger(
    props: React.ComponentProps<typeof DrawerTrigger>
) {
    const gt = useGT();
    const [isOpen, setIsOpen] = React.useState(false);
    const { hotkeys } = useHotkeysContext();

    const handleOpen = useStableCallback(() => {
        setIsOpen(true);
    });

    useHotkeys("mod+/, ?", handleOpen, {
        description: gt("Open keyboard shortcuts panel"),
    });

    const shortcutItems: ShortcutItem[] = hotkeys.map((shortcut) => ({
        description: shortcut.description ?? "",
        hotkey: shortcut.hotkey,
        label: `${shortcut.description ?? ""} ${shortcut.hotkey}`,
    }));

    return (
        <Drawer onOpenChange={setIsOpen} open={isOpen} position="right">
            <DrawerTrigger {...props} />
            <DrawerViewport>
                <DrawerPopup shouldShowCloseButton>
                    <DrawerHeader>
                        <DrawerTitle>
                            <T>Keyboard shortcuts</T>
                        </DrawerTitle>
                    </DrawerHeader>
                    <DrawerPanel
                        className="px-5"
                        isScrollable={false}
                        onKeyDown={stopPropagationForPrintableKeys}
                    >
                        <Command inline items={shortcutItems} open>
                            <CommandInput
                                aria-label={gt("Search shortcuts")}
                                placeholder={gt("Search…")}
                            />
                            <CommandList className="px-0">
                                <CommandEmpty>
                                    <T>No shortcuts found</T>
                                </CommandEmpty>
                                <CommandCollection>
                                    {(item: ShortcutItem) => (
                                        <CommandItem
                                            key={`${item.description}:${item.hotkey}`}
                                            value={item.label}
                                        >
                                            <div className="flex w-full items-center justify-between">
                                                <span className="font-medium text-foreground text-sm">
                                                    {item.description}
                                                </span>
                                                <KbdGroup>
                                                    <Kbd>
                                                        <KbdCombo
                                                            keys={item.hotkey}
                                                        />
                                                    </Kbd>
                                                </KbdGroup>
                                            </div>
                                        </CommandItem>
                                    )}
                                </CommandCollection>
                            </CommandList>
                        </Command>
                    </DrawerPanel>
                </DrawerPopup>
            </DrawerViewport>
        </Drawer>
    );
}
