import { start } from "workflow/api";
import { automationRunWorkflow } from "@/app/workflows/automation";
import { serverEnv } from "@/env/server";
import { createLogger } from "@/lib/common/logs/console/logger";
import { withRetry } from "@/lib/common/retry";
import { safeCompare } from "@/lib/common/security/compare";
import {
    attachWorkflowRunId,
    claimDueAutomationRuns,
    markAutomationRunStartFailed,
    recoverStaleAutomationRuns,
} from "@/lib/intelligence/automations/service";

const log = createLogger("automations:cron");

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
    if (
        !isAuthorizedCronRequest(request) &&
        serverEnv.NODE_ENV === "production"
    ) {
        return Response.json(
            { error: "Unauthorized" },
            { headers: NO_STORE_HEADERS, status: 401 }
        );
    }

    const now = new Date();
    const recovered = await recoverStaleAutomationRuns(now);
    const claimed = await claimDueAutomationRuns({ now });

    const startedResults = await Promise.all(
        claimed.claimed.map(async (run) => {
            let workflowRunId: string;
            try {
                const workflowRun = await start(automationRunWorkflow, [
                    run.runId,
                ]);
                workflowRunId = workflowRun.runId;
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error);
                log.error("Failed to start automation workflow", {
                    error: message,
                    runId: run.runId,
                });
                try {
                    await markAutomationRunStartFailed({
                        runId: run.runId,
                    });
                } catch (markError) {
                    log.error("Failed to mark automation run start-failed", {
                        error:
                            markError instanceof Error
                                ? markError.message
                                : String(markError),
                        runId: run.runId,
                    });
                }
                return false;
            }

            try {
                await withRetry(
                    () =>
                        attachWorkflowRunId({
                            runId: run.runId,
                            workflowRunId,
                        }),
                    { factor: 1, minTimeout: 50 }
                );
            } catch (error) {
                log.error("Failed to attach workflow run id", {
                    error:
                        error instanceof Error ? error.message : String(error),
                    runId: run.runId,
                    workflowRunId,
                });
            }
            return true;
        })
    );

    const started = startedResults.filter(Boolean).length;
    const failedToStart = startedResults.length - started;

    return Response.json(
        {
            claimed: claimed.claimed.length,
            failedToStart,
            recovered: recovered.recovered,
            skipped: claimed.skipped,
            started,
            timedOut: recovered.timedOut,
        },
        { headers: NO_STORE_HEADERS }
    );
}

function isAuthorizedCronRequest(request: Request): boolean {
    if (!serverEnv.CRON_SECRET && serverEnv.NODE_ENV !== "production") {
        return true;
    }

    const expected = serverEnv.CRON_SECRET;
    if (!expected) {
        log.warn("CRON_SECRET is not set.");
        return false;
    }

    const authorization = request.headers.get("authorization");
    if (!authorization) {
        return false;
    }

    return safeCompare(authorization, `Bearer ${expected}`);
}
