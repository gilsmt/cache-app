import { beforeEach, describe, expect, mock, test } from "bun:test";

const CRON_SECRET = "gilsmt-cron-secret";

const claimDueAutomationRuns = mock(async () => ({ claimed: [], skipped: 0 }));
const recoverStaleAutomationRuns = mock(async () => ({
    recovered: 0,
    timedOut: 0,
}));
const attachWorkflowRunId = mock(async () => undefined);
const markAutomationRunStartFailed = mock(async () => undefined);

const serverEnv: { CRON_SECRET?: string; NODE_ENV?: string } = {
    CRON_SECRET,
    NODE_ENV: "production",
};

mock.module("@/env/server", () => ({
    serverEnv,
}));

mock.module("workflow/api", () => ({
    start: mock(async () => ({ runId: "wf-run" })),
}));

mock.module("@/app/workflows/automation", () => ({
    automationRunWorkflow: {},
}));

mock.module("@/lib/intelligence/automations/service", () => ({
    attachWorkflowRunId,
    claimDueAutomationRuns,
    markAutomationRunStartFailed,
    recoverStaleAutomationRuns,
}));

const { GET } = await import("./route");

function cronRequest(authorization?: string): Request {
    const headers = new Headers();
    if (authorization !== undefined) {
        headers.set("authorization", authorization);
    }
    return new Request("https://cachd.app/api/cron/automations", { headers });
}

describe("automation cron authorization", () => {
    beforeEach(() => {
        serverEnv.CRON_SECRET = CRON_SECRET;
        serverEnv.NODE_ENV = "production";
        claimDueAutomationRuns.mockClear();
        recoverStaleAutomationRuns.mockClear();
    });

    test("accepts the exact bearer secret and claims runs", async () => {
        const response = await GET(cronRequest(`Bearer ${CRON_SECRET}`));
        expect(response.status).toBe(200);
        expect(claimDueAutomationRuns).toHaveBeenCalledTimes(1);
    });

    test("rejects a missing authorization header without claiming", async () => {
        const response = await GET(cronRequest());
        expect(response.status).toBe(401);
        expect(claimDueAutomationRuns).not.toHaveBeenCalled();
    });

    test("rejects a wrong secret without claiming", async () => {
        const response = await GET(cronRequest("Bearer not-the-secret"));
        expect(response.status).toBe(401);
        expect(claimDueAutomationRuns).not.toHaveBeenCalled();
    });

    test("rejects a malformed authorization header without claiming", async () => {
        const response = await GET(cronRequest(CRON_SECRET));
        expect(response.status).toBe(401);
        expect(claimDueAutomationRuns).not.toHaveBeenCalled();
    });

    test("rejects a secret that only shares the prefix", async () => {
        const response = await GET(cronRequest(`Bearer ${CRON_SECRET}-extra`));
        expect(response.status).toBe(401);
        expect(claimDueAutomationRuns).not.toHaveBeenCalled();
    });

    test("rejects an unauthenticated request when NODE_ENV is not production", async () => {
        serverEnv.NODE_ENV = "development";
        const response = await GET(cronRequest());
        expect(response.status).toBe(401);
        expect(claimDueAutomationRuns).not.toHaveBeenCalled();
    });

    test("rejects an unauthenticated request when NODE_ENV is undefined", async () => {
        serverEnv.NODE_ENV = undefined;
        const response = await GET(cronRequest());
        expect(response.status).toBe(401);
        expect(claimDueAutomationRuns).not.toHaveBeenCalled();
    });

    test("allows an unauthenticated local request when no secret is configured outside production", async () => {
        serverEnv.CRON_SECRET = "";
        serverEnv.NODE_ENV = "development";
        const response = await GET(cronRequest());
        expect(response.status).toBe(200);
        expect(claimDueAutomationRuns).toHaveBeenCalledTimes(1);
    });
});
