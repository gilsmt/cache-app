import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AutomationRunStatus, AutomationStatus } from "@/prisma/client/enums";

interface AutomationUpdateArgs {
    data: {
        lastFailureCode?: string | null;
        nextRunAtUtc?: Date | null;
        status?: string;
    };
    where: { id: string };
}

interface AutomationRunUpdateManyArgs {
    data: {
        errorCode?: string | null;
        errorMessage?: string;
        finishedAt?: Date;
        status?: string;
    };
    where: { id: string; status?: string };
}

interface AutomationRunLeaseArgs {
    data: { leaseExpiresAt?: Date; leaseId?: string; status?: string };
    where: { id: string; status?: string };
}

interface FakeAutomation {
    cadence: string;
    collection: null;
    collectionId: string | null;
    collectionNameSnapshot: string | null;
    id: string;
    monthDay: number | null;
    nextRunAtUtc: Date | null;
    payloadScope: string;
    prompt: string;
    status: string;
    templateKey: string | null;
    timeOfDayMinutes: number | null;
    timezone: string;
    userId: string;
    weekDay: number | null;
}

interface FakeRun {
    automation: FakeAutomation;
    automationId: string;
    id: string;
    scheduledForUtc: Date;
    status: string;
    userId: string;
}

const state: {
    activeSubscription: { status: string } | null;
    automationUpdates: AutomationUpdateArgs[];
    cancelUpdateCount: number;
    createManyCalls: number;
    deleteManyCalls: number;
    dueRuns: Array<{ id: string }>;
    leaseUpdates: AutomationRunLeaseArgs[];
    run: FakeRun | null;
    runUpdates: AutomationRunUpdateManyArgs[];
} = {
    activeSubscription: null,
    automationUpdates: [],
    cancelUpdateCount: 1,
    createManyCalls: 0,
    deleteManyCalls: 0,
    dueRuns: [],
    leaseUpdates: [],
    run: null,
    runUpdates: [],
};

mock.module("server-only", () => ({}));

mock.module("@/lib/billing/service", () => ({
    getUserActiveSubscriptionStatus: () => state.activeSubscription,
    userHasActiveSubscription: () => state.activeSubscription !== null,
}));

const tx = {
    automation: {
        update: (args: AutomationUpdateArgs) => {
            state.automationUpdates.push(args);
            return { ...state.run?.automation, ...args.data };
        },
    },
    automationRun: {
        createMany: () => {
            state.createManyCalls += 1;
            return { count: 1 };
        },
        deleteMany: () => {
            state.deleteManyCalls += 1;
            return { count: 1 };
        },
        findFirst: () => null,
        findUnique: () => state.run,
        update: (args: AutomationRunUpdateManyArgs) => {
            state.runUpdates.push(args);
            return state.run;
        },
        updateMany: (
            args: AutomationRunUpdateManyArgs | AutomationRunLeaseArgs
        ) => {
            if ("leaseId" in args.data) {
                state.leaseUpdates.push(args as AutomationRunLeaseArgs);
                return { count: 1 };
            }
            state.runUpdates.push(args as AutomationRunUpdateManyArgs);
            return { count: state.cancelUpdateCount };
        },
    },
};

mock.module("@/prisma", () => ({
    prisma: {
        $transaction: (callback: (client: typeof tx) => Promise<unknown>) =>
            callback(tx),
        automation: {
            findMany: () => [],
        },
        automationRun: {
            findMany: () => state.dueRuns,
        },
    },
}));

function makeRun(): FakeRun {
    return {
        automation: {
            cadence: "daily",
            collection: null,
            collectionId: null,
            collectionNameSnapshot: null,
            id: "automation-1",
            monthDay: null,
            nextRunAtUtc: new Date("2026-09-21T08:00:00.000Z"),
            payloadScope: "all_library_items",
            prompt: "Summarize the day.",
            status: AutomationStatus.active,
            templateKey: "daily_digest",
            timeOfDayMinutes: 480,
            timezone: "UTC",
            userId: "user-1",
            weekDay: null,
        },
        automationId: "automation-1",
        id: "run-1",
        scheduledForUtc: new Date("2026-09-21T08:00:00.000Z"),
        status: AutomationRunStatus.pending,
        userId: "user-1",
    };
}

const NOW = new Date("2026-09-21T09:00:00.000Z");

describe("claimDueAutomationRuns subscription entitlement", () => {
    beforeEach(() => {
        state.activeSubscription = null;
        state.automationUpdates = [];
        state.cancelUpdateCount = 1;
        state.createManyCalls = 0;
        state.deleteManyCalls = 0;
        state.dueRuns = [{ id: "run-1" }];
        state.leaseUpdates = [];
        state.run = makeRun();
        state.runUpdates = [];
    });

    test("claims a due run when the owner has an active subscription", async () => {
        state.activeSubscription = { status: "active" };
        const { claimDueAutomationRuns } = await import("./service");

        const result = await claimDueAutomationRuns({ now: NOW });

        expect(result.claimed).toEqual([
            { leaseId: expect.any(String), runId: "run-1" },
        ]);
        expect(result.skipped).toBe(0);
        expect(state.leaseUpdates).toHaveLength(1);
        expect(state.automationUpdates).toHaveLength(1);
        expect(state.automationUpdates[0]?.data).toEqual({
            nextRunAtUtc: expect.any(Date),
        });
    });

    test("leaves the run pending when the owner has no active subscription", async () => {
        state.activeSubscription = null;
        const { claimDueAutomationRuns } = await import("./service");

        const result = await claimDueAutomationRuns({ now: NOW });

        expect(result.claimed).toHaveLength(0);
        expect(result.skipped).toBe(1);
        expect(state.leaseUpdates).toHaveLength(0);
        expect(state.createManyCalls).toBe(0);
    });

    test("pauses the automation and cancels the run when the subscription lapsed", async () => {
        state.activeSubscription = null;
        const { claimDueAutomationRuns } = await import("./service");

        await claimDueAutomationRuns({ now: NOW });

        expect(state.automationUpdates).toEqual([
            {
                data: {
                    lastFailureCode: "subscription_inactive",
                    nextRunAtUtc: null,
                    status: AutomationStatus.paused,
                },
                where: { id: "automation-1" },
            },
        ]);
        expect(state.runUpdates).toEqual([
            {
                data: {
                    errorCode: "subscription_inactive",
                    errorMessage:
                        "The automation paused because the subscription is not active.",
                    finishedAt: NOW,
                    status: AutomationRunStatus.canceled,
                },
                where: {
                    id: "run-1",
                    status: AutomationRunStatus.pending,
                },
            },
        ]);
        expect(state.deleteManyCalls).toBe(1);
    });

    test("does not pause the automation when a concurrent claim already took the run", async () => {
        state.activeSubscription = null;
        state.cancelUpdateCount = 0;
        const { claimDueAutomationRuns } = await import("./service");

        const result = await claimDueAutomationRuns({ now: NOW });

        expect(result.claimed).toHaveLength(0);
        expect(result.skipped).toBe(0);
        expect(state.automationUpdates).toHaveLength(0);
        expect(state.deleteManyCalls).toBe(0);
    });
});
