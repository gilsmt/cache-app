/**
 * Format minutes since midnight to a zero-padded "HH:MM" string (24-hour).
 */
export function formatTimeOfDayMinutes(timeOfDayMinutes: number): string {
    const hours = Math.floor(timeOfDayMinutes / 60);
    const minutes = timeOfDayMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Parse a "HH:MM" time value back to minutes since midnight.
 */
export function parseTimeOfDayMinutes(timeValue: string): number {
    const parts = timeValue.split(":");
    const hours = Number(parts[0] ?? "0");
    const minutes = Number(parts[1] ?? "0");
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return 0;
    }
    return hours * 60 + minutes;
}

const MINUTES_PER_15_MIN_BLOCK = 15;
const MINUTES_PER_DAY = 24 * 60;

/**
 * Default 9 AM in minutes-since-midnight, used as the seed time for
 * unscheduled time-of-day pickers (e.g. new automations).
 */
export const DEFAULT_TIME_OF_DAY_MINUTES = 9 * 60;

/**
 * Round time-of-day minutes to the nearest 15-minute block,
 * wrapping at midnight.
 */
export function roundTimeOfDayMinutes(timeOfDayMinutes: number): number {
    const rounded =
        Math.round(timeOfDayMinutes / MINUTES_PER_15_MIN_BLOCK) *
        MINUTES_PER_15_MIN_BLOCK;
    return ((rounded % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * Format a decomposed time value to a human-readable label
 * in 12-hour or 24-hour clock, as determined by the locale.
 */
export function formatTimeOfDayLabel(args: {
    hours: number;
    minutes: number;
    shouldUse24HourClock: boolean;
}): string {
    if (args.shouldUse24HourClock) {
        return formatTimeOfDayMinutes(args.hours * 60 + args.minutes);
    }

    const period = args.hours >= 12 ? "PM" : "AM";
    const displayHours = args.hours % 12 || 12;
    return `${displayHours}:${String(args.minutes).padStart(2, "0")} ${period}`;
}

export interface TimeOfDayOption {
    label: string;
    value: string;
}

/**
 * Generate the full set of 15-minute interval options for a time-of-day
 * Combobox, using the locale to determine 12-hour vs 24-hour labels.
 */
export function getTimeOfDayOptions(locale: string): TimeOfDayOption[] {
    const shouldUse24HourClock = uses24HourClock(locale);
    const options: TimeOfDayOption[] = [];
    for (let hours = 0; hours < 24; hours += 1) {
        for (let minutes = 0; minutes < 60; minutes += 15) {
            const value = formatTimeOfDayMinutes(hours * 60 + minutes);
            options.push({
                label: formatTimeOfDayLabel({
                    hours,
                    minutes,
                    shouldUse24HourClock,
                }),
                value,
            });
        }
    }
    return options;
}

/**
 * Look up a time-of-day option by its serialised "HH:MM" value.
 *
 * Falls back to a synthetic option when the value does not match any
 * pre-defined interval so the Combobox can still display and edit it.
 */
export function getTimeOfDayOption(
    options: TimeOfDayOption[],
    timeValue: string
): TimeOfDayOption {
    return (
        options.find((option) => option.value === timeValue) ?? {
            label: timeValue,
            value: timeValue,
        }
    );
}

/**
 * Look up a time-of-day option by display label (case-insensitive).
 *
 * Also matches against the serialised "HH:MM" value so users can type
 * raw time strings like "09:00" and still find a match.
 */
export function getTimeOfDayOptionByLabel(
    options: TimeOfDayOption[],
    label: string
): TimeOfDayOption | undefined {
    const normalizedLabel = label.trim().toLowerCase();
    return options.find(
        (option) =>
            option.label.toLowerCase() === normalizedLabel ||
            option.value === normalizedLabel
    );
}

/**
 * Detect whether the user's locale prefers a 24-hour clock.
 */
export function uses24HourClock(locale?: string): boolean {
    const { hourCycle } = new Intl.DateTimeFormat(locale, {
        hour: "numeric",
    }).resolvedOptions();

    return hourCycle === "h23" || hourCycle === "h24";
}
