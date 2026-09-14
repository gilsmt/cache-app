import "server-only";

import { tavilySearch } from "@tavily/ai-sdk";
import type { ToolExecutionOptions } from "ai";
import * as z from "zod";
import { serverEnv } from "@/env/server";
import type { AutomationWebSearchTimeRange } from "./tool-inputs";

const TAVILY_TIMEOUT_MS = 15_000;
const TAVILY_RESULT_COUNT_MAX = 5;
const TAVILY_MANUAL_EXECUTION_OPTIONS = {
    context: undefined,
    messages: [],
    toolCallId: "automation-web-search",
} satisfies ToolExecutionOptions<unknown>;

const TavilySearchPayloadSchema = z.object({
    answer: z.string().optional(),
    query: z.string().optional(),
    results: z
        .array(
            z.object({
                content: z.string().optional(),
                score: z.number().optional(),
                title: z.string().optional(),
                url: z.string(),
            })
        )
        .optional(),
});

export async function automationWebSearch(args: {
    query: string;
    timeRange?: AutomationWebSearchTimeRange;
}) {
    "use step";

    if (!serverEnv.TAVILY_API_KEY) {
        return {
            error: "Tavily search is not configured.",
            ok: false,
            results: [],
        };
    }

    try {
        const searchTool = tavilySearch({
            apiKey: serverEnv.TAVILY_API_KEY,
            includeAnswer: true,
            includeRawContent: false,
            maxResults: TAVILY_RESULT_COUNT_MAX,
            searchDepth: "basic",
            timeout: TAVILY_TIMEOUT_MS,
        });

        if (!searchTool.execute) {
            return {
                error: "Tavily search execution is not available.",
                ok: false,
                results: [],
            };
        }

        const parsedPayload = TavilySearchPayloadSchema.safeParse(
            await searchTool.execute(
                {
                    query: args.query,
                    timeRange: args.timeRange,
                },
                TAVILY_MANUAL_EXECUTION_OPTIONS
            )
        );
        if (!parsedPayload.success) {
            return {
                error: "Tavily search returned an unexpected response.",
                ok: false,
                results: [],
            };
        }

        const payload = parsedPayload.data;
        return {
            answer: payload.answer ?? null,
            ok: true,
            query: payload.query ?? args.query,
            results:
                payload.results?.map((result) => ({
                    content: result.content ?? "",
                    score: result.score ?? null,
                    title: result.title ?? result.url,
                    url: result.url,
                })) ?? [],
        };
    } catch (error) {
        return {
            error: error instanceof Error ? error.message : String(error),
            ok: false,
            results: [],
        };
    }
}
