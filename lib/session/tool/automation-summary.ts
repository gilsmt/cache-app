import { tool } from "ai";
import * as z from "zod";

const EmptyAutomationToolInputSchema = z.object({});

// Payload implementations load lazily because they are workflow steps.
export function buildAutomationPayloadSummaryTool(args: { runId: string }) {
    return tool({
        description:
            "Return the total size and scope of the saved-content payload available to this automation run.",
        execute: async () => {
            const { getAutomationPayloadSummary } = await import(
                "../automations/payload"
            );
            return await getAutomationPayloadSummary({
                runId: args.runId,
            });
        },
        inputSchema: EmptyAutomationToolInputSchema,
    });
}
