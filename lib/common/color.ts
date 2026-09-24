import { converter, formatHex, parse } from "culori";
import * as z from "zod";
import { djb2Hash, fnv1aHash } from "@/lib/common/hash";
import { clamp } from "@/lib/common/number";

const COLORS: readonly string[] = [
    "#FF6900", // Orange
    "#FCB900", // Yellow
    "#00D084", // Emerald
    "#8ED1FC", // Sky Blue
    "#0693E3", // Blue
    "#ABB8C3", // Gray
    "#EB144C", // Red
    "#F78DA7", // Pink
    "#9900EF", // Purple
    "#0079BF", // Dark Blue
    "#B6BBBF", // Light Gray
    "#FF5A5F", // Coral
    "#F7C59F", // Peach
    "#8492A6", // Slate
    "#4D5055", // Charcoal
    "#AF5A50", // Terracotta
    "#F9D6E7", // Pale Pink
    "#B5EAEA", // Pale Cyan
    "#B388EB", // Lavender
    "#B04632", // Rust
    "#FF78CB", // Pink
    "#4E5A65", // Gray
    "#01FF70", // Lime
    "#85144B", // Pink
    "#F012BE", // Purple
    "#7FDBFF", // Sky Blue
    "#3D9970", // Olive
    "#AAAAAA", // Silver
    "#111111", // Black
    "#0074D9", // Blue
    "#39CCCC", // Teal
    "#001F3F", // Navy
    "#FF9F1C", // Orange
    "#5E6A71", // Ash
    "#75D701", // Neon Green
    "#B6C8A9", // Lichen
    "#00A9FE", // Electric Blue
    "#EAE8E1", // Bone
    "#CD346C", // Raspberry
    "#FF6FA4", // Pink Sherbet
    "#D667FB", // Purple Mountain Majesty
    "#0080FF", // Azure
    "#656D78", // Dim Gray
    "#F8842C", // Tangerine
    "#FF8CFF", // Carnation Pink
    "#647F6A", // Feldgrau
    "#5E574E", // Field Drab
    "#EF5466", // KU Crimson
    "#B0E0E6", // Powder Blue
    "#EB5E7C", // Rose Pink
    "#8A2BE2", // Blue Violet
    "#6B7C85", // Slate Gray
    "#8C92AC", // Lavender Blue
    "#6C587A", // Eminence
    "#52A1FF", // Azureish White
    "#32CD32", // Lime Green
    "#E04F9F", // Orchid Pink
    "#915C83", // Lilac Bush
    "#4C6B88", // Air Force Blue
    "#587376", // Cadet Blue
    "#C46210", // Buff
    "#65B0D0", // Columbia Blue
    "#2F4F4F", // Dark Slate Gray
    "#528B8B", // Dark Cyan
    "#8B4513", // Saddle Brown
    "#4682B4", // Steel Blue
    "#CD853F", // Peru
    "#FFA07A", // Light Salmon
    "#CD5C5C", // Indian Red
    "#483D8B", // Dark Slate Blue
    "#696969", // Dim Gray
];

export function isValidColor(color: string): boolean {
    try {
        return parse(color) !== null;
    } catch {
        return false;
    }
}

export function parseToValidColor(color: string) {
    const parsed = parse(color);
    if (!parsed) {
        throw new Error(`Invalid color format: ${color}`);
    }
    return parsed;
}

export function parseToHex(color: string): string {
    try {
        const parsed = parse(color);
        if (!parsed) {
            throw new Error(`Invalid color: ${color}`);
        }
        return formatHex(parsed);
    } catch (error) {
        throw new Error(
            `Failed to normalize color "${color}": ${error instanceof Error ? error.message : "Unknown error"}`,
            { cause: error }
        );
    }
}

export function parseToRgb(color: string) {
    const parsed = parse(color);
    if (!parsed) {
        throw new Error(`Invalid color format: ${color}`);
    }
    return converter("rgb")(parsed);
}

const RGB_MAX = 255;
const HUE_DEFAULT = 272;
const HUE_SECTOR_DEGREES = 60;
const HUE_FULL_CIRCLE = 360;
const LUMINANCE_THRESHOLD = 0.55;

const GRADIENT_CHROMA_CLAMP_MIN = 0.6;
const GRADIENT_CHROMA_CLAMP_MAX = 2.2;
const GRADIENT_START_CHROMA = 2.4;
const GRADIENT_START_CHROMA_BIAS = 0.7;
const GRADIENT_END_CHROMA = 0.8;
const GRADIENT_END_CHROMA_BIAS = 0.2;
const GRADIENT_LIGHTNESS_LIGHT = 97;
const GRADIENT_LIGHTNESS_DARK = 22;
const GRADIENT_HUE_OFFSET = 10;
const GRADIENT_ANGLE = "90deg";

/**
 * Mirror COLORS entries but stay pinned as literals, so reordering
 * that array can't reshuffle charts
 */
const CHART_COLORS: readonly string[] = [
    "#CD346C", // Raspberry
    "#00D084", // Emerald
    "#0693E3", // Blue
    "#FCB900", // Yellow
    "#8492A6", // Slate
    "#FF6900", // Orange
    "#B388EB", // Lavender
    "#EB144C", // Red
    "#39CCCC", // Teal
    "#E04F9F", // Orchid Pink
    "#4682B4", // Steel Blue
    "#FF5A5F", // Coral
    "#3D9970", // Olive
];

const CHART_DARK_LIGHTNESS_LIFT = 24;
/** Stays short of white. */
const CHART_DARK_LIGHTNESS_MAX = 78;

export function getHexColorFromName(value: string): string {
    const index = getColorIndex(value, COLORS.length);
    const color = COLORS[index];
    if (!color) {
        throw new Error(
            `Invariant violated: no color at computed index ${index}`
        );
    }
    return color;
}

/** @internal */
function getColorIndex(value: string, arrayLength: number): number {
    const hashValue = djb2Hash(value);
    return hashValue % arrayLength;
}

export function getRandomHexColor(): string {
    const randomIndex = Math.floor(Math.random() * COLORS.length);
    const color = COLORS[randomIndex];
    if (!color) {
        throw new Error(
            `Invariant violated: no color at computed index ${randomIndex}`
        );
    }
    return color;
}

export function getHueFromRgb(r: number, g: number, b: number): number {
    const rn = r / RGB_MAX;
    const gn = g / RGB_MAX;
    const bn = b / RGB_MAX;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    if (delta === 0) {
        return HUE_DEFAULT;
    }

    let hue = 0;
    if (max === rn) {
        hue = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
        hue = (bn - rn) / delta + 2;
    } else {
        hue = (rn - gn) / delta + 4;
    }

    return (hue * HUE_SECTOR_DEGREES + HUE_FULL_CIRCLE) % HUE_FULL_CIRCLE;
}

/** @internal */
function buildThemeAwareLch(
    lightnessLight: number,
    lightnessDark: number,
    chroma: number,
    hue: number
): string {
    const c = Number(chroma.toFixed(3));
    const h = Number(hue.toFixed(3));
    return `light-dark(lch(${lightnessLight} ${c} ${h}), lch(${lightnessDark} ${c} ${h}))`;
}

export function getColorGradientFromName(name: string): string {
    const color = parseToRgb(getHexColorFromName(name));
    const rgb = [color.r, color.g, color.b] as const;
    const hue = getHueFromRgb(rgb[0], rgb[1], rgb[2]);
    const chromaBias = clamp(
        Math.max(...rgb) - Math.min(...rgb),
        GRADIENT_CHROMA_CLAMP_MIN,
        GRADIENT_CHROMA_CLAMP_MAX
    );
    const startChroma =
        GRADIENT_START_CHROMA + chromaBias * GRADIENT_START_CHROMA_BIAS;
    const endChroma =
        GRADIENT_END_CHROMA + chromaBias * GRADIENT_END_CHROMA_BIAS;
    const endHue = (hue + GRADIENT_HUE_OFFSET) % HUE_FULL_CIRCLE;
    const start = buildThemeAwareLch(
        GRADIENT_LIGHTNESS_LIGHT,
        GRADIENT_LIGHTNESS_DARK,
        startChroma,
        hue
    );
    const end = buildThemeAwareLch(
        GRADIENT_LIGHTNESS_LIGHT,
        GRADIENT_LIGHTNESS_DARK,
        endChroma,
        endHue
    );
    return `linear-gradient(${GRADIENT_ANGLE}, ${start} 0%, ${end} 100%), ${end}`;
}

export function getChartColorsFromKeys(
    keys: readonly string[]
): Map<string, string> {
    const uniqueKeys = Array.from(new Set(keys)).sort((first, second) =>
        first.localeCompare(second)
    );
    const count = uniqueKeys.length;
    const colors = new Map<string, string>();
    if (count === 0) {
        return colors;
    }

    const startIndex = fnv1aHash(uniqueKeys.join("\0")) % CHART_COLORS.length;

    for (let index = 0; index < count; index += 1) {
        const key = uniqueKeys[index];
        if (key === undefined) {
            throw new Error(
                `Invariant violated: missing key at index ${index}`
            );
        }
        const color = CHART_COLORS[(startIndex + index) % CHART_COLORS.length];
        if (color === undefined) {
            throw new Error(
                `Invariant violated: missing palette entry at index ${index}`
            );
        }
        colors.set(key, buildChartColor(color));
    }

    return colors;
}

/** @internal */
function buildChartColor(hex: string): string {
    const { c, h, l } = converter("lch")(parseToValidColor(hex));
    const lightnessDark = Math.min(
        l + CHART_DARK_LIGHTNESS_LIFT,
        CHART_DARK_LIGHTNESS_MAX
    );
    return buildThemeAwareLch(
        Number(l.toFixed(1)),
        Number(lightnessDark.toFixed(1)),
        c,
        h ?? HUE_DEFAULT
    );
}

export function getContrastColor(hexColor: string) {
    const r = Number.parseInt(hexColor.slice(1, 3), 16) / RGB_MAX;
    const g = Number.parseInt(hexColor.slice(3, 5), 16) / RGB_MAX;
    const b = Number.parseInt(hexColor.slice(5, 7), 16) / RGB_MAX;
    return (Math.min(r, g, b) + Math.max(r, g, b)) / 2 < LUMINANCE_THRESHOLD
        ? "#FFFFFF"
        : "#000000";
}

export const ColorSchema = z
    .string()
    .min(1, "Color cannot be empty")
    .refine(isValidColor, {
        message:
            "Invalid color format. Supported formats: hex (#RGB, #RRGGBB), named colors (red, blue), rgb/rgba, hsl/hsla, etc.",
    })
    .overwrite(parseToHex);
