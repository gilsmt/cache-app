import { tool } from "ai";
import * as z from "zod";
import { isHttpUrl } from "@/lib/common/url";
import { AUTOMATION_ITEM_PAGE_LIMIT_MAX } from "../automations/constants";
import type { AutomationAgentSource } from "./web";

const EmptyAutomationToolInputSchema = z.object({});

const AutomationPayloadItemsInputSchema = z.object({
    cursor: z.string().trim().min(1).optional(),
    limit: z.int().min(1).max(AUTOMATION_ITEM_PAGE_LIMIT_MAX).optional(),
    search: z.string().trim().max(200).optional(),
});

/**
 * The saved-content payload tools exposed to automation agents. Definitions
 * stay import-safe; the payload implementations load lazily because they are
 * workflow steps and touch the database.
 */
export function createAutomationPayloadTools(args: {
    runId: string;
    state: { sources: AutomationAgentSource[] };
}) {
    const tools = {
        getAutomationPayloadSummary: tool({
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
        }),
        listAutomationPayloadItems: tool({
            description:
                "Page through saved items available to this automation run. Use this before writing the final summary.",
            execute: async (input) => {
                const { listAutomationPayloadItems } = await import(
                    "../automations/payload"
                );
                const result = await listAutomationPayloadItems({
                    cursor: input.cursor,
                    limit: input.limit,
                    runId: args.runId,
                    search: input.search,
                });
                for (const item of result.items) {
                    if (!isHttpUrl(item.url)) {
                        continue;
                    }
                    args.state.sources.push({
                        id: item.id,
                        title: item.caption?.trim() || item.url,
                        type: "library_item",
                        url: item.url,
                    });
                }
                return result;
            },
            inputSchema: AutomationPayloadItemsInputSchema,
        }),
    };

    return tools;
}
