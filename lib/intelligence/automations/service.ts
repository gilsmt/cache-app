import "server-only";

import { randomUUID } from "node:crypto";
import { getRun } from "workflow/api";
import { userHasActiveSubscription } from "@/lib/billing/service";
import { createChatForAutomationRun } from "@/lib/chats/service";
import { createLogger } from "@/lib/common/logs/console/logger";
import type { GenerationUsage } from "@/lib/intelligence/generation";
import { DEFAULT_REGISTERED_MODEL } from "@/lib/intelligence/providers/model-registry";
import { prisma } from "@/prisma";
import type { Prisma } from "@/prisma/client/client";
import {
    type AutomationCadence,
    AutomationPayloadScope,
    AutomationRunStatus,
    AutomationStatus,
    type AutomationTemplateKey,
} from "@/prisma/client/enums";
import {
    AUTOMATION_DUE_BATCH_LIMIT,
    AUTOMATION_LEASE_DURATION_MS,
    AUTOMATION_RUNNING_TIMEOUT_MS,
    AUTOMATION_TEMPLATE_DEFINITIONS,
} from "./constants";
import { createAutomationError } from "./error";
import {
    type AutomationScheduleInput,
    buildScheduleSnapshot,
    computeNextRunAtUtc,
    validateAutomationSchedule,
} from "./schedule";

const log = createLogger("automations:service");

type AutomationTransaction = Prisma.TransactionClient;
type AutomationRunClaimResult =
    | { leaseId: string; status: "claimed" }
    | { status: "skipped" }
    | null;

const AUTOMATION_SELECT = {
    activatedAtUtc: true,
    cadence: true,
    collection: {
        select: {
            id: true,
            name: true,
        },
    },
    collectionId: true,
    collectionNameSnapshot: true,
    createdAt: true,
    id: true,
    lastFailureCode: true,
    lastRunAtUtc: true,
    lastSucceededAtUtc: true,
    monthDay: true,
    nextRunAtUtc: true,
    payloadScope: true,
    prompt: true,
    runs: {
        orderBy: {
            createdAt: "desc",
        },
        select: {
            createdAt: true,
            status: true,
        },
        take: 3,
    },
    status: true,
    templateKey: true,
    timeOfDayMinutes: true,
    timezone: true,
    title: true,
    updatedAt: true,
    userId: true,
    weekDay: true,
} satisfies Prisma.AutomationSelect;

export type AutomationScheduleData = AutomationScheduleInput;

export interface AutomationInput {
    collectionId?: string | null;
    payloadScope: AutomationPayloadScope;
    prompt: string;
    schedule: AutomationScheduleData;
    title: string;
}

export type AutomationListItem = ReturnType<typeof toAutomationListItem>;

export async function seedDefaultUserAutomations(userId: string) {
    await prisma.$transaction(async (tx) => {
        for (const definition of AUTOMATION_TEMPLATE_DEFINITIONS) {
            await tx.automation.upsert({
                create: {
                    payloadScope: AutomationPayloadScope.all_library_items,
                    prompt: definition.prompt,
                    status: AutomationStatus.paused,
                    templateKey: definition.templateKey,
                    title: definition.title,
                    userId,
                },
                update: {},
                where: {
                    userId_templateKey: {
                        templateKey: definition.templateKey,
                        userId,
                    },
                },
            });
        }
    });
}

export async function listAutomations(args: {
    userId: string;
}): Promise<AutomationListItem[]> {
    const automations = await prisma.automation.findMany({
        orderBy: [{ templateKey: "asc" }, { createdAt: "desc" }],
        select: AUTOMATION_SELECT,
        where: {
            userId: args.userId,
        },
    });

    return automations.map(toAutomationListItem);
}

export async function listAutomationRuns(args: {
    automationId: string;
    limit?: number;
    userId: string;
}) {
    const automation = await requireAutomationOwned(prisma, {
        automationId: args.automationId,
        operation: "listAutomationRuns",
        userId: args.userId,
    });

    const runs = await prisma.automationRun.findMany({
        orderBy: {
            createdAt: "desc",
        },
        select: {
            createdAt: true,
            errorCode: true,
            errorMessage: true,
            finishedAt: true,
            id: true,
            scheduledForUtc: true,
            sources: true,
            startedAt: true,
            status: true,
            summaryMarkdown: true,
            usage: true,
        },
        take: Math.min(args.limit ?? 20, 50),
        where: {
            automationId: automation.id,
            userId: args.userId,
        },
    });

    return runs;
}

export async function createAutomation(args: {
    input: AutomationInput;
    userId: string;
}): Promise<AutomationListItem> {
    await requireCanUseAutomations(args.userId, "createAutomation");

    return prisma.$transaction(async (tx) => {
        const now = new Date();
        const normalized = await normalizeAutomationInput(tx, {
            input: args.input,
            operation: "createAutomation",
            userId: args.userId,
        });
        const nextRunAtUtc = computeNextRunAtUtc({
            afterUtc: now,
            schedule: normalized.schedule,
        });

        const automation = await tx.automation.create({
            data: {
                activatedAtUtc: now,
                cadence: normalized.schedule.cadence,
                collectionId: normalized.collectionId,
                collectionNameSnapshot: normalized.collectionNameSnapshot,
                monthDay: normalized.schedule.monthDay,
                nextRunAtUtc,
                payloadScope: normalized.payloadScope,
                prompt: normalized.prompt,
                status: AutomationStatus.active,
                timeOfDayMinutes: normalized.schedule.timeOfDayMinutes,
                timezone: normalized.schedule.timezone,
                title: normalized.title,
                userId: args.userId,
                weekDay: normalized.schedule.weekDay,
            },
            select: AUTOMATION_SELECT,
        });

        await createPendingRun(tx, automation, nextRunAtUtc);

        return toAutomationListItem(automation);
    });
}

export async function updateAutomation(args: {
    automationId: string;
    input: AutomationInput;
    userId: string;
}): Promise<AutomationListItem> {
    const automation = await prisma.$transaction(async (tx) => {
        const current = await requireAutomationOwned(tx, {
            automationId: args.automationId,
            operation: "updateAutomation",
            userId: args.userId,
        });
        if (current.status === AutomationStatus.active) {
            await requireCanUseAutomations(args.userId, "updateAutomation");
        }

        const normalized = await normalizeAutomationInput(tx, {
            input: args.input,
            operation: "updateAutomation",
            userId: args.userId,
        });
        const nextRunAtUtc =
            current.status === AutomationStatus.active
                ? computeNextRunAtUtc({
                      afterUtc: new Date(),
                      schedule: normalized.schedule,
                  })
                : null;

        const updated = await tx.automation.update({
            data: {
                cadence: normalized.schedule.cadence,
                collectionId: normalized.collectionId,
                collectionNameSnapshot: normalized.collectionNameSnapshot,
                monthDay: normalized.schedule.monthDay,
                nextRunAtUtc,
                payloadScope: normalized.payloadScope,
                prompt: normalized.prompt,
                timeOfDayMinutes: normalized.schedule.timeOfDayMinutes,
                timezone: normalized.schedule.timezone,
                title: normalized.title,
                weekDay: normalized.schedule.weekDay,
            },
            select: AUTOMATION_SELECT,
            where: {
                id: current.id,
            },
        });

        await tx.automationRun.deleteMany({
            where: {
                automationId: updated.id,
                status: AutomationRunStatus.pending,
            },
        });
        if (updated.status === AutomationStatus.active && nextRunAtUtc) {
            await createPendingRun(tx, updated, nextRunAtUtc);
        }

        return toAutomationListItem(updated);
    });
    return automation;
}

export async function resumeAutomation(args: {
    automationId: string;
    schedule: AutomationScheduleData;
    userId: string;
}): Promise<AutomationListItem> {
    await requireCanUseAutomations(args.userId, "resumeAutomation");
    if (!validateAutomationSchedule(args.schedule)) {
        throw createAutomationError({
            code: "invalid_schedule",
            message: "Choose a valid automation schedule.",
            operation: "resumeAutomation",
        });
    }

    return prisma.$transaction(async (tx) => {
        const current = await requireAutomationOwned(tx, {
            automationId: args.automationId,
            operation: "resumeAutomation",
            userId: args.userId,
        });
        const now = new Date();
        const nextRunAtUtc = computeNextRunAtUtc({
            afterUtc: now,
            schedule: args.schedule,
        });

        const automation = await tx.automation.update({
            data: {
                activatedAtUtc: now,
                cadence: args.schedule.cadence,
                lastFailureCode: null,
                monthDay: args.schedule.monthDay,
                nextRunAtUtc,
                status: AutomationStatus.active,
                timeOfDayMinutes: args.schedule.timeOfDayMinutes,
                timezone: args.schedule.timezone,
                weekDay: args.schedule.weekDay,
            },
            select: AUTOMATION_SELECT,
            where: {
                id: current.id,
            },
        });

        await tx.automationRun.deleteMany({
            where: {
                automationId: automation.id,
                status: AutomationRunStatus.pending,
            },
        });
        await createPendingRun(tx, automation, nextRunAtUtc);

        return toAutomationListItem(automation);
    });
}

export async function pauseAutomation(args: {
    automationId: string;
    userId: string;
}): Promise<AutomationListItem> {
    const { automation, workflowRunIds } = await prisma.$transaction(
        async (tx) => {
            const current = await requireAutomationOwned(tx, {
                automationId: args.automationId,
                operation: "pauseAutomation",
                userId: args.userId,
            });
            const now = new Date();

            const inFlightRuns = await tx.automationRun.findMany({
                select: {
                    id: true,
                    userId: true,
                    workflowRunId: true,
                },
                where: {
                    automationId: current.id,
                    status: {
                        in: [
                            AutomationRunStatus.starting,
                            AutomationRunStatus.running,
                        ],
                    },
                },
            });

            await tx.automationRun.deleteMany({
                where: {
                    automationId: current.id,
                    status: AutomationRunStatus.pending,
                },
            });

            let canceledCount = 0;
            for (const run of inFlightRuns) {
                const canceled = await tx.automationRun.updateMany({
                    data: {
                        errorCode: "automation_paused",
                        errorMessage:
                            "The automation was paused before this run finished.",
                        finishedAt: now,
                        leaseExpiresAt: null,
                        leaseId: null,
                        status: AutomationRunStatus.canceled,
                    },
                    where: {
                        id: run.id,
                        status: {
                            in: [
                                AutomationRunStatus.starting,
                                AutomationRunStatus.running,
                            ],
                        },
                    },
                });
                if (canceled.count !== 1) {
                    continue;
                }
                canceledCount += 1;
                await createChatForAutomationRun({
                    runId: run.id,
                    tx,
                    userId: run.userId,
                });
            }

            const paused = await tx.automation.update({
                data: {
                    // Keep parent metadata aligned with canceled in-flight runs.
                    ...(canceledCount > 0 ? { lastRunAtUtc: now } : {}),
                    nextRunAtUtc: null,
                    status: AutomationStatus.paused,
                },
                select: AUTOMATION_SELECT,
                where: {
                    id: current.id,
                },
            });

            return {
                automation: toAutomationListItem(paused),
                workflowRunIds: inFlightRuns
                    .map((run) => run.workflowRunId)
                    .filter(
                        (workflowRunId): workflowRunId is string =>
                            !!workflowRunId
                    ),
            };
        }
    );

    await cancelWorkflowRuns(workflowRunIds);
    return automation;
}

export async function deleteAutomation(args: {
    automationId: string;
    userId: string;
}): Promise<{ id: string }> {
    // Atomic status gate: only a paused row owned by this user can be deleted.
    const deleted = await prisma.automation.deleteMany({
        where: {
            id: args.automationId,
            status: AutomationStatus.paused,
            userId: args.userId,
        },
    });

    if (deleted.count === 1) {
        return { id: args.automationId };
    }

    const existing = await prisma.automation.findFirst({
        select: {
            status: true,
        },
        where: {
            id: args.automationId,
            userId: args.userId,
        },
    });

    if (!existing) {
        throw createAutomationError({
            code: "not_found",
            message: "That automation is no longer available.",
            operation: "deleteAutomation",
        });
    }

    throw createAutomationError({
        code: "must_be_paused",
        message: "Pause this automation before deleting it.",
        operation: "deleteAutomation",
    });
}

export async function recoverStaleAutomationRuns(now = new Date()) {
    const starting = await prisma.automationRun.updateMany({
        data: {
            leaseExpiresAt: null,
            leaseId: null,
            status: AutomationRunStatus.pending,
            workflowRunId: null,
        },
        where: {
            leaseExpiresAt: {
                lt: now,
            },
            status: AutomationRunStatus.starting,
        },
    });

    const runningStartedBefore = new Date(
        now.getTime() - AUTOMATION_RUNNING_TIMEOUT_MS
    );
    const staleRunningRuns = await prisma.automationRun.findMany({
        select: {
            automationId: true,
            id: true,
            userId: true,
            workflowRunId: true,
        },
        where: {
            startedAt: {
                lt: runningStartedBefore,
            },
            status: AutomationRunStatus.running,
        },
    });

    if (staleRunningRuns.length === 0) {
        return {
            recovered: starting.count,
            timedOut: 0,
        };
    }

    await cancelWorkflowRuns(
        staleRunningRuns
            .map((run) => run.workflowRunId)
            .filter((workflowRunId): workflowRunId is string => !!workflowRunId)
    );

    const timedOutRunIds: string[] = [];
    for (const run of staleRunningRuns) {
        const timedOut = await finishTimedOutAutomationRun({
            now,
            run,
        });
        if (timedOut) {
            timedOutRunIds.push(run.id);
        }
    }

    if (timedOutRunIds.length > 0) {
        await prisma.automation.updateMany({
            data: {
                lastFailureCode: "run_timeout",
                lastRunAtUtc: now,
            },
            where: {
                id: {
                    in: [
                        ...new Set(
                            staleRunningRuns
                                .filter((run) =>
                                    timedOutRunIds.includes(run.id)
                                )
                                .map((run) => run.automationId)
                        ),
                    ],
                },
            },
        });
    }

    return {
        recovered: starting.count,
        timedOut: timedOutRunIds.length,
    };
}

async function finishTimedOutAutomationRun(args: {
    now: Date;
    run: { automationId: string; id: string; userId: string };
}): Promise<boolean> {
    try {
        return await prisma.$transaction(async (tx) => {
            const timedOut = await tx.automationRun.updateMany({
                data: {
                    errorCode: "run_timeout",
                    errorMessage:
                        "The automation run exceeded its execution timeout.",
                    finishedAt: args.now,
                    leaseExpiresAt: null,
                    leaseId: null,
                    status: AutomationRunStatus.failed,
                },
                where: {
                    id: args.run.id,
                    status: AutomationRunStatus.running,
                },
            });
            if (timedOut.count !== 1) {
                return false;
            }

            await createChatForAutomationRun({
                runId: args.run.id,
                tx,
                userId: args.run.userId,
            });
            return true;
        });
    } catch (error) {
        log.warn("Failed to finish timed-out automation run", {
            error: error instanceof Error ? error.message : String(error),
            runId: args.run.id,
        });
        return false;
    }
}

async function cancelWorkflowRuns(workflowRunIds: string[]) {
    if (workflowRunIds.length === 0) {
        return;
    }

    await Promise.all(
        workflowRunIds.map(async (workflowRunId) => {
            try {
                await getRun(workflowRunId).cancel();
            } catch (error) {
                log.warn("Failed to cancel automation workflow run", {
                    error:
                        error instanceof Error ? error.message : String(error),
                    workflowRunId,
                });
            }
        })
    );
}

export async function claimDueAutomationRuns(
    args: { limit?: number; now?: Date } = {}
) {
    const now = args.now ?? new Date();
    const limit = Math.min(args.limit ?? AUTOMATION_DUE_BATCH_LIMIT, 50);
    await syncMissingPendingRunsForOverdueAutomations(now, limit);

    const dueRuns = await prisma.automationRun.findMany({
        orderBy: {
            scheduledForUtc: "asc",
        },
        select: {
            id: true,
        },
        take: limit,
        where: {
            scheduledForUtc: {
                lte: now,
            },
            status: AutomationRunStatus.pending,
        },
    });

    const claimed: Array<{ leaseId: string; runId: string }> = [];
    let skipped = 0;

    for (const dueRun of dueRuns) {
        const result = await claimAutomationRun({
            now,
            runId: dueRun.id,
        });
        if (result?.status === "claimed") {
            claimed.push({
                leaseId: result.leaseId,
                runId: dueRun.id,
            });
            continue;
        }
        if (result?.status === "skipped") {
            skipped += 1;
        }
    }

    return {
        claimed,
        skipped,
    };
}

export async function attachWorkflowRunId(args: {
    runId: string;
    workflowRunId: string;
}) {
    await prisma.automationRun.updateMany({
        data: {
            workflowRunId: args.workflowRunId,
        },
        where: {
            id: args.runId,
            status: AutomationRunStatus.starting,
        },
    });
}

export async function markAutomationRunStartFailed(args: { runId: string }) {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
        const run = await tx.automationRun.findUnique({
            select: {
                automationId: true,
                status: true,
                userId: true,
            },
            where: {
                id: args.runId,
            },
        });
        if (!run || run.status !== AutomationRunStatus.starting) {
            return;
        }

        const failed = await tx.automationRun.updateMany({
            data: {
                errorCode: "workflow_start_failed",
                errorMessage: "This automation run could not be started.",
                finishedAt: now,
                leaseExpiresAt: null,
                leaseId: null,
                status: AutomationRunStatus.failed,
            },
            where: {
                id: args.runId,
                status: AutomationRunStatus.starting,
            },
        });
        if (failed.count !== 1) {
            return;
        }

        await tx.automation.update({
            data: {
                lastFailureCode: "workflow_start_failed",
                lastRunAtUtc: now,
            },
            where: {
                id: run.automationId,
            },
        });

        await createChatForAutomationRun({
            runId: args.runId,
            tx,
            userId: run.userId,
        });
    });
}

export async function markAutomationRunRunning(args: {
    runId: string;
    workflowRunId: string;
}) {
    "use step";

    const now = new Date();
    const run = await prisma.automationRun.findUnique({
        include: {
            automation: true,
        },
        where: {
            id: args.runId,
        },
    });

    if (!run || run.status !== AutomationRunStatus.starting) {
        return null;
    }

    const { automation } = run;
    if (automation.status !== AutomationStatus.active) {
        await prisma.$transaction(async (tx) => {
            const canceled = await tx.automationRun.updateMany({
                data: {
                    errorCode: "automation_paused",
                    errorMessage:
                        "The automation was paused before this run started.",
                    finishedAt: now,
                    leaseExpiresAt: null,
                    leaseId: null,
                    status: AutomationRunStatus.canceled,
                },
                where: {
                    id: run.id,
                    status: AutomationRunStatus.starting,
                },
            });
            if (canceled.count !== 1) {
                return;
            }
            await createChatForAutomationRun({
                runId: run.id,
                tx,
                userId: run.userId,
            });
        });
        return null;
    }

    if (automation.payloadScope === AutomationPayloadScope.collection) {
        const collectionId =
            automation.collectionId ?? run.collectionIdSnapshot;
        if (!collectionId) {
            await pauseAutomationForMissingCollection({
                automationId: automation.id,
                runId: run.id,
                userId: run.userId,
            });
            return null;
        }

        const collection = await prisma.collection.findFirst({
            select: { id: true },
            where: {
                id: collectionId,
                userId: automation.userId,
            },
        });
        if (!collection) {
            await pauseAutomationForMissingCollection({
                automationId: automation.id,
                runId: run.id,
                userId: run.userId,
            });
            return null;
        }
    }

    const promoted = await prisma.automationRun.updateMany({
        data: {
            startedAt: now,
            status: AutomationRunStatus.running,
            workflowRunId: args.workflowRunId,
        },
        where: {
            id: run.id,
            status: AutomationRunStatus.starting,
        },
    });
    if (promoted.count !== 1) {
        return null;
    }

    return {
        automationId: run.automationId,
        collectionId: run.collectionIdSnapshot,
        modelId: DEFAULT_REGISTERED_MODEL,
        payloadScope: run.payloadScopeSnapshot,
        prompt: run.promptSnapshot,
        runId: run.id,
        scheduledForUtc: run.scheduledForUtc.toISOString(),
        templateKey: run.templateKeySnapshot,
        userId: run.userId,
    };
}

export async function finishAutomationRun(args: {
    errorCode?: string;
    errorMessage?: string;
    runId: string;
    sources?: Prisma.InputJsonValue;
    status:
        | typeof AutomationRunStatus.succeeded
        | typeof AutomationRunStatus.failed;
    summaryMarkdown?: string;
    usage?: GenerationUsage;
}) {
    "use step";

    const now = new Date();

    await prisma.$transaction(async (tx) => {
        const run = await tx.automationRun.findUnique({
            select: {
                automationId: true,
                status: true,
                userId: true,
            },
            where: {
                id: args.runId,
            },
        });
        if (!run || run.status !== AutomationRunStatus.running) {
            return;
        }

        const finished = await tx.automationRun.updateMany({
            data: {
                errorCode: args.errorCode,
                errorMessage: args.errorMessage,
                finishedAt: now,
                leaseExpiresAt: null,
                leaseId: null,
                sources: args.sources,
                status: args.status,
                summaryMarkdown: args.summaryMarkdown,
                usage: args.usage
                    ? {
                          inputTokens: args.usage.inputTokens,
                          outputTokens: args.usage.outputTokens,
                          totalTokens: args.usage.totalTokens,
                      }
                    : undefined,
            },
            where: {
                id: args.runId,
                status: AutomationRunStatus.running,
            },
        });
        if (finished.count !== 1) {
            return;
        }

        await tx.automation.update({
            data: {
                lastFailureCode:
                    args.status === AutomationRunStatus.failed
                        ? (args.errorCode ?? "run_failed")
                        : null,
                lastRunAtUtc: now,
                lastSucceededAtUtc:
                    args.status === AutomationRunStatus.succeeded
                        ? now
                        : undefined,
            },
            where: {
                id: run.automationId,
            },
        });

        await createChatForAutomationRun({
            runId: args.runId,
            tx,
            userId: run.userId,
        });
    });
}

async function requireAutomationOwned(
    tx: Pick<AutomationTransaction, "automation">,
    args: {
        automationId: string;
        operation: string;
        userId: string;
    }
) {
    const automation = await tx.automation.findFirst({
        where: {
            id: args.automationId,
            userId: args.userId,
        },
    });

    if (!automation) {
        throw createAutomationError({
            code: "not_found",
            message: "That automation is no longer available.",
            operation: args.operation,
        });
    }

    return automation;
}

async function requireCanUseAutomations(
    userId: string,
    operation: string
): Promise<void> {
    if (await userHasActiveSubscription(userId)) {
        return;
    }

    throw createAutomationError({
        code: "forbidden",
        message: "Upgrade to schedule automations.",
        operation,
    });
}

async function normalizeAutomationInput(
    tx: AutomationTransaction,
    args: {
        input: AutomationInput;
        operation: string;
        userId: string;
    }
) {
    if (!validateAutomationSchedule(args.input.schedule)) {
        throw createAutomationError({
            code: "invalid_schedule",
            message: "Choose a valid automation schedule.",
            operation: args.operation,
        });
    }

    if (args.input.payloadScope === AutomationPayloadScope.all_library_items) {
        return {
            collectionId: null,
            collectionNameSnapshot: null,
            payloadScope: args.input.payloadScope,
            prompt: args.input.prompt.trim(),
            schedule: args.input.schedule,
            title: args.input.title.trim(),
        };
    }

    const collection = await tx.collection.findFirst({
        select: {
            id: true,
            name: true,
        },
        where: {
            id: args.input.collectionId ?? "",
            userId: args.userId,
        },
    });

    if (!collection) {
        throw createAutomationError({
            code: "missing_collection",
            message: "Choose a valid collection for this automation.",
            operation: args.operation,
        });
    }

    return {
        collectionId: collection.id,
        collectionNameSnapshot: collection.name,
        payloadScope: args.input.payloadScope,
        prompt: args.input.prompt.trim(),
        schedule: args.input.schedule,
        title: args.input.title.trim(),
    };
}

async function createPendingRun(
    tx: AutomationTransaction,
    automation: AutomationForRunSnapshot,
    scheduledForUtc: Date
) {
    const schedule = getAutomationSchedule(automation);
    await tx.automationRun.create({
        data: {
            automationId: automation.id,
            collectionIdSnapshot: automation.collectionId,
            collectionNameSnapshot: automation.collection
                ? automation.collection.name
                : automation.collectionNameSnapshot,
            payloadScopeSnapshot: automation.payloadScope,
            promptSnapshot: automation.prompt,
            scheduledForUtc,
            scheduleSnapshot: buildScheduleSnapshotJson({
                nextRunAtUtc: scheduledForUtc,
                schedule,
            }),
            status: AutomationRunStatus.pending,
            templateKeySnapshot: automation.templateKey,
            userId: automation.userId,
        },
    });
}

interface AutomationForRunSnapshot {
    cadence: AutomationCadence | null;
    collection?: { id: string; name: string } | null;
    collectionId: string | null;
    collectionNameSnapshot: string | null;
    id: string;
    monthDay: number | null;
    payloadScope: AutomationPayloadScope;
    prompt: string;
    templateKey: AutomationTemplateKey | null;
    timeOfDayMinutes: number | null;
    timezone: string | null;
    userId: string;
    weekDay: number | null;
}

function getAutomationSchedule(
    automation: Pick<
        AutomationForRunSnapshot,
        "cadence" | "monthDay" | "timeOfDayMinutes" | "timezone" | "weekDay"
    >
): AutomationScheduleData {
    if (
        !(
            automation.cadence &&
            automation.timezone &&
            automation.timeOfDayMinutes !== null
        )
    ) {
        throw new Error("Automation is missing schedule data.");
    }

    return {
        cadence: automation.cadence,
        monthDay: automation.monthDay,
        timeOfDayMinutes: automation.timeOfDayMinutes,
        timezone: automation.timezone,
        weekDay: automation.weekDay,
    };
}

function buildScheduleSnapshotJson(args: {
    nextRunAtUtc: Date;
    schedule: AutomationScheduleData;
}): Prisma.InputJsonObject {
    const snapshot = buildScheduleSnapshot(args);

    return {
        cadence: snapshot.cadence,
        monthDay: snapshot.monthDay ?? null,
        nextRunAtUtc: snapshot.nextRunAtUtc,
        timeOfDayMinutes: snapshot.timeOfDayMinutes,
        timezone: snapshot.timezone,
        weekDay: snapshot.weekDay ?? null,
    };
}

async function syncMissingPendingRunsForOverdueAutomations(
    now: Date,
    limit: number
) {
    try {
        const overdue = await prisma.automation.findMany({
            include: {
                collection: true,
            },
            orderBy: {
                nextRunAtUtc: "asc",
            },
            take: limit,
            where: {
                nextRunAtUtc: {
                    lte: now,
                },
                runs: {
                    none: {
                        status: AutomationRunStatus.pending,
                    },
                },
                status: AutomationStatus.active,
            },
        });
        if (overdue.length === 0) {
            return;
        }

        const data: Prisma.AutomationRunCreateManyInput[] = [];
        for (const automation of overdue) {
            if (!automation.nextRunAtUtc) {
                continue;
            }
            let schedule: AutomationScheduleData;
            try {
                schedule = getAutomationSchedule(automation);
            } catch {
                log.warn("Skipped overdue automation with invalid schedule", {
                    automationId: automation.id,
                });
                continue;
            }
            data.push({
                automationId: automation.id,
                collectionIdSnapshot: automation.collectionId,
                collectionNameSnapshot:
                    automation.collection?.name ??
                    automation.collectionNameSnapshot,
                payloadScopeSnapshot: automation.payloadScope,
                promptSnapshot: automation.prompt,
                scheduledForUtc: automation.nextRunAtUtc,
                scheduleSnapshot: buildScheduleSnapshotJson({
                    nextRunAtUtc: automation.nextRunAtUtc,
                    schedule,
                }),
                status: AutomationRunStatus.pending,
                templateKeySnapshot: automation.templateKey,
                userId: automation.userId,
            });
        }
        if (data.length === 0) {
            return;
        }

        await prisma.automationRun.createMany({
            data,
            skipDuplicates: true,
        });
    } catch (error) {
        log.warn("Failed to sync overdue automation schedules", {
            error: error instanceof Error ? error.message : String(error),
        });
    }
}

async function claimAutomationRun(args: {
    now: Date;
    runId: string;
}): Promise<AutomationRunClaimResult> {
    const claim = await prisma.$transaction<AutomationRunClaimResult>(
        async (tx) => {
            const run = await tx.automationRun.findUnique({
                include: {
                    automation: {
                        include: {
                            collection: true,
                        },
                    },
                },
                where: {
                    id: args.runId,
                },
            });
            if (!run || run.status !== AutomationRunStatus.pending) {
                return null;
            }
            if (run.automation.status !== AutomationStatus.active) {
                await tx.automationRun.update({
                    data: {
                        errorCode: "automation_paused",
                        errorMessage: "The automation is paused.",
                        finishedAt: args.now,
                        status: AutomationRunStatus.skipped,
                    },
                    where: { id: run.id },
                });
                await createChatForAutomationRun({
                    runId: run.id,
                    tx,
                    userId: run.userId,
                });
                return { status: "skipped" };
            }

            const activeRun = await tx.automationRun.findFirst({
                select: { id: true },
                where: {
                    automationId: run.automationId,
                    id: { not: run.id },
                    status: {
                        in: [
                            AutomationRunStatus.starting,
                            AutomationRunStatus.running,
                        ],
                    },
                },
            });

            if (activeRun) {
                await tx.automationRun.update({
                    data: {
                        errorCode: "overlapping_run",
                        errorMessage:
                            "Skipped because the previous automation run was still active.",
                        finishedAt: args.now,
                        status: AutomationRunStatus.skipped,
                    },
                    where: { id: run.id },
                });
                await createChatForAutomationRun({
                    runId: run.id,
                    tx,
                    userId: run.userId,
                });
                await materializeNextRunAfterClaim(
                    tx,
                    run.automation,
                    args.now
                );
                return { status: "skipped" };
            }

            const leaseId = randomUUID();
            const updated = await tx.automationRun.updateMany({
                data: {
                    leaseExpiresAt: new Date(
                        args.now.getTime() + AUTOMATION_LEASE_DURATION_MS
                    ),
                    leaseId,
                    status: AutomationRunStatus.starting,
                },
                where: {
                    id: run.id,
                    status: AutomationRunStatus.pending,
                },
            });

            if (updated.count !== 1) {
                return null;
            }

            await materializeNextRunAfterClaim(tx, run.automation, args.now);

            return { leaseId, status: "claimed" };
        }
    );
    return claim;
}

async function materializeNextRunAfterClaim(
    tx: AutomationTransaction,
    automation: AutomationForRunSnapshot,
    now: Date
) {
    const nextRunAtUtc = computeNextRunAtUtc({
        afterUtc: now,
        schedule: getAutomationSchedule(automation),
    });

    const updated = await tx.automation.update({
        data: {
            nextRunAtUtc,
        },
        include: {
            collection: true,
        },
        where: {
            id: automation.id,
        },
    });

    await tx.automationRun.createMany({
        data: [
            {
                automationId: updated.id,
                collectionIdSnapshot: updated.collectionId,
                collectionNameSnapshot:
                    updated.collection?.name ?? updated.collectionNameSnapshot,
                payloadScopeSnapshot: updated.payloadScope,
                promptSnapshot: updated.prompt,
                scheduledForUtc: nextRunAtUtc,
                scheduleSnapshot: buildScheduleSnapshotJson({
                    nextRunAtUtc,
                    schedule: getAutomationSchedule(updated),
                }),
                status: AutomationRunStatus.pending,
                templateKeySnapshot: updated.templateKey,
                userId: updated.userId,
            },
        ],
        skipDuplicates: true,
    });
}

async function pauseAutomationForMissingCollection(args: {
    automationId: string;
    runId: string;
    userId: string;
}) {
    const now = new Date();
    await prisma.$transaction(async (tx) => {
        const failed = await tx.automationRun.updateMany({
            data: {
                errorCode: "missing_collection",
                errorMessage:
                    "The collection targeted by this automation no longer exists.",
                finishedAt: now,
                leaseExpiresAt: null,
                leaseId: null,
                status: AutomationRunStatus.failed,
            },
            where: { id: args.runId, status: AutomationRunStatus.starting },
        });
        if (failed.count !== 1) {
            return;
        }

        await tx.automation.update({
            data: {
                lastFailureCode: "missing_collection",
                nextRunAtUtc: null,
                status: AutomationStatus.paused,
            },
            where: { id: args.automationId },
        });
        await tx.automationRun.deleteMany({
            where: {
                automationId: args.automationId,
                status: AutomationRunStatus.pending,
            },
        });
        await createChatForAutomationRun({
            runId: args.runId,
            tx,
            userId: args.userId,
        });
    });
}

function toAutomationListItem(automation: {
    activatedAtUtc: Date | null;
    cadence: AutomationCadence | null;
    collection: { id: string; name: string } | null;
    collectionId: string | null;
    collectionNameSnapshot: string | null;
    createdAt: Date;
    id: string;
    lastFailureCode: string | null;
    lastRunAtUtc: Date | null;
    lastSucceededAtUtc: Date | null;
    monthDay: number | null;
    nextRunAtUtc: Date | null;
    payloadScope: AutomationPayloadScope;
    prompt: string;
    runs: Array<{
        createdAt: Date;
        status: AutomationRunStatus;
    }>;
    status: AutomationStatus;
    templateKey: AutomationTemplateKey | null;
    timeOfDayMinutes: number | null;
    timezone: string | null;
    title: string;
    updatedAt: Date;
    weekDay: number | null;
}) {
    return {
        activatedAtUtc: automation.activatedAtUtc,
        cadence: automation.cadence,
        collectionId: automation.collectionId,
        collectionName: automation.collection
            ? automation.collection.name
            : automation.collectionNameSnapshot,
        createdAt: automation.createdAt,
        id: automation.id,
        lastFailureCode: automation.lastFailureCode,
        lastRun: automation.runs[0] ?? null,
        lastRunAtUtc: automation.lastRunAtUtc,
        lastSucceededAtUtc: automation.lastSucceededAtUtc,
        monthDay: automation.monthDay,
        nextRunAtUtc: automation.nextRunAtUtc,
        payloadScope: automation.payloadScope,
        prompt: automation.prompt,
        recentRuns: automation.runs,
        status: automation.status,
        templateKey: automation.templateKey,
        timeOfDayMinutes: automation.timeOfDayMinutes,
        timezone: automation.timezone,
        title: automation.title,
        updatedAt: automation.updatedAt,
        weekDay: automation.weekDay,
    };
}
