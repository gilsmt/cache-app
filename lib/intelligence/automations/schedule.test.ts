import { describe, expect, test } from "bun:test";
import { getAutomationStallDelayMs } from "@/lib/intelligence/automations/schedule";
import { AutomationStatus } from "@/prisma/client/enums";

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date("2026-09-19T00:00:00.000Z");
const ONE_TICK_HOURS = 24;
const ONE_TICK_AND_SLACK_HOURS = 26;
const PAST_ONE_TICK_HOURS = 27;

function buildActiveArgs(hoursPastSlot: number) {
    return {
        nextRunAtUtc: new Date(NOW.getTime() - hoursPastSlot * HOUR_MS),
        now: NOW,
        status: AutomationStatus.active,
    };
}

describe("getAutomationStallDelayMs", () => {
    test("stays quiet while the next slot is ahead", () => {
        expect(
            getAutomationStallDelayMs({
                nextRunAtUtc: new Date(NOW.getTime() + HOUR_MS),
                now: NOW,
                status: AutomationStatus.active,
            })
        ).toBeNull();
    });

    test("stays quiet for a slot inside one scheduler tick", () => {
        expect(
            getAutomationStallDelayMs(buildActiveArgs(ONE_TICK_HOURS))
        ).toBeNull();
    });

    test("stays quiet for a wait at the tick plus slack", () => {
        expect(
            getAutomationStallDelayMs(buildActiveArgs(ONE_TICK_AND_SLACK_HOURS))
        ).toBeNull();
    });

    test("reports a slot the scheduler left unclaimed past a tick", () => {
        expect(
            getAutomationStallDelayMs(buildActiveArgs(PAST_ONE_TICK_HOURS))
        ).toBe(PAST_ONE_TICK_HOURS * HOUR_MS);
    });

    test("stays quiet for a paused automation", () => {
        expect(
            getAutomationStallDelayMs({
                ...buildActiveArgs(PAST_ONE_TICK_HOURS),
                status: AutomationStatus.paused,
            })
        ).toBeNull();
    });

    test("stays quiet for an automation without a next slot", () => {
        expect(
            getAutomationStallDelayMs({
                ...buildActiveArgs(PAST_ONE_TICK_HOURS),
                nextRunAtUtc: null,
            })
        ).toBeNull();
    });
});
