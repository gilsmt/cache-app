import { getWorkflowMetadata } from "workflow";
import {
    executeReadOnlyAutomationRun,
    prepareAutomationRunForWorkflow,
} from "@/lib/intelligence/automations/workflow";

export async function automationRunWorkflow(runId: string) {
    "use workflow";

    const { workflowRunId } = getWorkflowMetadata();
    const ready = await prepareAutomationRunForWorkflow({
        runId,
        workflowRunId,
    });

    if (!ready) {
        return { status: "skipped" };
    }

    await executeReadOnlyAutomationRun(ready);
    return { status: "succeeded" };
}
