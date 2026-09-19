import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import vercelConfig from "./vercel.json";

const AUTOMATIONS_CRON_PATH = "/api/cron/automations";
const CRON_FIELD_COUNT = 5;
const CRON_FIELD_SEPARATOR = /\s+/;

describe("vercel.json cron jobs", () => {
    test("targets the automations scheduler route", () => {
        const cron = vercelConfig.crons.find(
            ({ path: cronPath }) => cronPath === AUTOMATIONS_CRON_PATH
        );

        expect(cron).toBeDefined();
        expect(
            existsSync(
                path.join(
                    import.meta.dir,
                    `app${AUTOMATIONS_CRON_PATH}/route.ts`
                )
            )
        ).toBe(true);
    });

    test("uses five-field cron expressions", () => {
        for (const { schedule } of vercelConfig.crons) {
            expect(schedule.trim().split(CRON_FIELD_SEPARATOR)).toHaveLength(
                CRON_FIELD_COUNT
            );
        }
    });
});
