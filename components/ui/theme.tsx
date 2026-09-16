"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useGT } from "gt-next";
import { Monitor, Moon, Sun } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "@/components/ui/button";
import { Group } from "@/components/ui/group";
import { type Theme, useTheme } from "@/hooks/use-theme";

const THEME_OPTIONS = [
    { icon: Sun, value: "light" },
    { icon: Moon, value: "dark" },
    { icon: Monitor, value: "system" },
] as const;

const THEME_CYCLE = THEME_OPTIONS.map(({ value }) => value);

function getThemeOptionLabel(
    gt: ReturnType<typeof useGT>,
    value: Theme
): string {
    switch (value) {
        case "light":
            return gt("Use light theme");
        case "dark":
            return gt("Use dark theme");
        default:
            return gt("Use system theme");
    }
}

function getNextTheme(current: Theme): Theme {
    const index = THEME_CYCLE.indexOf(current);
    return THEME_CYCLE[(index + 1) % THEME_CYCLE.length] ?? "light";
}

export function ThemeSelector() {
    const gt = useGT();
    const { setTheme, theme } = useTheme();

    const handleValueChange = useStableCallback((next: Theme[]) => {
        const [first] = next;
        if (!first) {
            return;
        }
        setTheme(first);
    });

    return (
        <ToggleGroup
            aria-label={gt("Theme")}
            onValueChange={handleValueChange}
            render={<Group />}
            value={[theme]}
        >
            {THEME_OPTIONS.map(({ icon: Icon, value }) => {
                const label = getThemeOptionLabel(gt, value);
                return (
                    <Toggle
                        aria-label={label}
                        key={value}
                        render={<Button size="icon-sm" variant="secondary" />}
                        title={label}
                        value={value}
                    >
                        <Icon className="size-4" />
                    </Toggle>
                );
            })}
        </ToggleGroup>
    );
}

export function ThemeHotkey() {
    const gt = useGT();
    const { theme, setTheme } = useTheme();

    const handleThemeToggle = useStableCallback(() => {
        setTheme(getNextTheme(theme));
    });

    useHotkeys("mod+shift+d", handleThemeToggle, {
        description: gt("Cycle theme: light → dark → system"),
        enableOnFormTags: false,
        preventDefault: true,
    });

    return null;
}
