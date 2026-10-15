import type { Dayjs } from "@/lib/common/dayjs";
import { dayjs } from "@/lib/common/dayjs";
import type { AutomationCadence } from "@/prisma/client/enums";

const MINUTES_PER_DAY = 24 * 60;
const WEEK_DAY_MIN = 0;
const WEEK_DAY_MAX = 6;
const MONTH_DAY_MIN = 1;
const MONTH_DAY_MAX = 31;

export interface AutomationScheduleInput {
    cadence: AutomationCadence;
    monthDay?: number | null;
    timeOfDayMinutes: number;
    timezone: string;
    weekDay?: number | null;
}

export interface AutomationScheduleSnapshot extends AutomationScheduleInput {
    nextRunAtUtc: string;
}

export function validateAutomationSchedule(
    schedule: AutomationScheduleInput
): boolean {
    if (!isValidTimezone(schedule.timezone)) {
        return false;
    }
    if (
        !Number.isInteger(schedule.timeOfDayMinutes) ||
        schedule.timeOfDayMinutes < 0 ||
        schedule.timeOfDayMinutes >= MINUTES_PER_DAY
    ) {
        return false;
    }
    if (
        schedule.cadence === "weekly" &&
        !isIntegerBetween(schedule.weekDay, WEEK_DAY_MIN, WEEK_DAY_MAX)
    ) {
        return false;
    }
    if (
        schedule.cadence === "monthly" &&
        !isIntegerBetween(schedule.monthDay, MONTH_DAY_MIN, MONTH_DAY_MAX)
    ) {
        return false;
    }
    return true;
}

export function computeNextRunAtUtc(args: {
    afterUtc: Date;
    schedule: AutomationScheduleInput;
}): Date {
    const { afterUtc, schedule } = args;
    if (!validateAutomationSchedule(schedule)) {
        throw new Error("Invalid automation schedule.");
    }

    const localAfter = dayjs(afterUtc).tz(schedule.timezone);
    const candidate = computeLocalCandidateAfter(localAfter, schedule);

    return candidate.utc().toDate();
}

export function buildScheduleSnapshot(args: {
    nextRunAtUtc: Date;
    schedule: AutomationScheduleInput;
}): AutomationScheduleSnapshot {
    return {
        ...args.schedule,
        nextRunAtUtc: args.nextRunAtUtc.toISOString(),
    };
}

function computeLocalCandidateAfter(
    localAfter: Dayjs,
    schedule: AutomationScheduleInput
): Dayjs {
    if (schedule.cadence === "daily") {
        return advanceDaily(localAfter, schedule);
    }
    if (schedule.cadence === "weekly") {
        return advanceWeekly(localAfter, schedule);
    }
    return advanceMonthly(localAfter, schedule);
}

function advanceDaily(
    localAfter: Dayjs,
    schedule: AutomationScheduleInput
): Dayjs {
    let candidate = buildLocalWallClockCandidate(
        localAfter,
        schedule.timeOfDayMinutes,
        schedule.timezone
    );
    if (!candidate.isAfter(localAfter)) {
        candidate = buildLocalWallClockCandidate(
            localAfter.add(1, "day"),
            schedule.timeOfDayMinutes,
            schedule.timezone
        );
    }
    return candidate;
}

function advanceWeekly(
    localAfter: Dayjs,
    schedule: AutomationScheduleInput
): Dayjs {
    let candidate = buildLocalWallClockCandidate(
        localAfter.day(schedule.weekDay ?? WEEK_DAY_MIN),
        schedule.timeOfDayMinutes,
        schedule.timezone
    );
    if (!candidate.isAfter(localAfter)) {
        candidate = buildLocalWallClockCandidate(
            candidate.add(1, "week"),
            schedule.timeOfDayMinutes,
            schedule.timezone
        );
    }
    return candidate;
}

function advanceMonthly(
    localAfter: Dayjs,
    schedule: AutomationScheduleInput
): Dayjs {
    let candidate = buildMonthlyCandidate(localAfter, schedule);
    if (!candidate.isAfter(localAfter)) {
        candidate = buildMonthlyCandidate(localAfter.add(1, "month"), schedule);
    }
    return candidate;
}

function buildMonthlyCandidate(
    localDate: Dayjs,
    schedule: AutomationScheduleInput
): Dayjs {
    const monthStart = dayjs.tz(
        `${formatYearMonth(localDate)}-01T00:00:00`,
        schedule.timezone
    );
    const day = Math.min(
        schedule.monthDay ?? MONTH_DAY_MIN,
        monthStart.daysInMonth()
    );

    return buildLocalWallClockCandidate(
        monthStart.date(day),
        schedule.timeOfDayMinutes,
        schedule.timezone
    );
}

function buildLocalWallClockCandidate(
    localDate: Dayjs,
    timeOfDayMinutes: number,
    timezone: string
): Dayjs {
    return dayjs.tz(
        `${formatLocalDate(localDate)}T${formatLocalTime(timeOfDayMinutes)}:00`,
        timezone
    );
}

function formatLocalDate(localDate: Dayjs): string {
    return `${formatYearMonth(localDate)}-${formatTwoDigitNumber(
        localDate.date()
    )}`;
}

function formatYearMonth(localDate: Dayjs): string {
    return `${localDate.year()}-${formatTwoDigitNumber(localDate.month() + 1)}`;
}

function formatLocalTime(timeOfDayMinutes: number): string {
    return `${formatTwoDigitNumber(
        Math.floor(timeOfDayMinutes / 60)
    )}:${formatTwoDigitNumber(timeOfDayMinutes % 60)}`;
}

function formatTwoDigitNumber(value: number): string {
    return String(value).padStart(2, "0");
}

function isIntegerBetween(
    value: number | null | undefined,
    min: number,
    max: number
): value is number {
    if (value === null || value === undefined) {
        return false;
    }

    return Number.isInteger(value) && value >= min && value <= max;
}

function isValidTimezone(timezone: string): boolean {
    try {
        return dayjs.tz(new Date(), timezone).isValid();
    } catch {
        return false;
    }
}
