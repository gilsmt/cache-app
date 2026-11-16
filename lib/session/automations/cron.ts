import "server-only";

import { prisma } from "@/prisma";
import { AUTOMATION_RUNNING_TIMEOUT_MS } from "./constants";

export async function hasAutomationCronWork(now: Date): Promise<boolean> {
    const runningStartedBefore = new Date(
        now.getTime() - AUTOMATION_RUNNING_TIMEOUT_MS
    );
    const [result] = await prisma.$queryRaw<{ hasWork: boolean }[]>`
        SELECT
            EXISTS (
                SELECT 1 FROM "automation_run"
                WHERE "status" = 'pending' AND "scheduledForUtc" <= ${now}
            ) OR EXISTS (
                SELECT 1 FROM "automation_run"
                WHERE "status" = 'starting' AND "leaseExpiresAt" < ${now}
            ) OR EXISTS (
                SELECT 1 FROM "automation_run"
                WHERE "status" = 'running' AND "startedAt" < ${runningStartedBefore}
            ) OR EXISTS (
                SELECT 1 FROM "automation"
                WHERE "status" = 'active' AND "nextRunAtUtc" <= ${now}
            ) AS "hasWork"
    `;
    if (!result) {
        throw new Error("Automation cron work check returned no result.");
    }
    return result.hasWork;
}
