"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { useGT } from "gt-next";
import { type LucideIcon, Monitor, Moon, Sun } from "lucide-react";
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
    const { theme } = useTheme();

    return (
        <Group aria-label={gt("Theme")}>
            {THEME_OPTIONS.map(({ icon: Icon, value }) => (
                <ThemeButton
                    Icon={Icon}
                    isSelected={theme === value}
                    key={value}
                    label={getThemeOptionLabel(gt, value)}
                    value={value}
                />
            ))}
        </Group>
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

interface ThemeButtonProps {
    Icon: LucideIcon;
    isSelected: boolean;
    label: string;
    value: Theme;
}

function ThemeButton({ Icon, isSelected, label, value }: ThemeButtonProps) {
    const { setTheme } = useTheme();

    const handleClick = useStableCallback(() => {
        setTheme(value);
    });

    return (
        <Button
            aria-label={label}
            aria-pressed={isSelected}
            className={cn(isSelected && "brightness-90")}
            data-pressed={isSelected ? "" : undefined}
            onClick={handleClick}
            size="icon-sm"
            title={label}
            variant="secondary"
        >
            <Icon className="size-4" />
        </Button>
    );
}
