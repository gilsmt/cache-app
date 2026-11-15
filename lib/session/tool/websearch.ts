import type { ToolExecutionOptions } from "ai";
import { tool } from "ai";
import * as z from "zod";
import { isAbortError, raceAbort } from "@/lib/common/abort";
import { createLogger } from "@/lib/common/logs/console/logger";
import { isHttpUrl } from "@/lib/common/url";
import type { AutomationAgentSource } from "../ai/runner";

const searchLog = createLogger("intelligence:web-search");

const WEB_SEARCH_TIME_RANGES = [
    "year",
    "month",
    "week",
    "day",
    "y",
    "m",
    "w",
    "d",
] as const;

type WebSearchTimeRange = (typeof WEB_SEARCH_TIME_RANGES)[number];

const WebSearchInputSchema = z.object({
    query: z.string().trim().min(1).max(500),
    timeRange: z.enum(WEB_SEARCH_TIME_RANGES).optional(),
});

const TAVILY_TIMEOUT_MS = 15_000;
const TAVILY_RESULT_COUNT_MAX = 5;
const TAVILY_MANUAL_EXECUTION_OPTIONS = {
    context: undefined,
    messages: [],
    toolCallId: "web-search",
} satisfies ToolExecutionOptions<unknown>;

const TavilySearchPayloadSchema = z.object({
    answer: z.string().optional(),
    query: z.string().optional(),
    results: z.array(
        z.object({
            content: z.string().optional(),
            score: z.number().optional(),
            title: z.string().optional(),
            url: z.string(),
        })
    ),
});

type TavilySearchExecute = (
    args: {
        query: string;
        timeRange?: WebSearchTimeRange;
    },
    options: typeof TAVILY_MANUAL_EXECUTION_OPTIONS
) => Promise<unknown>;

export function buildWebSearchTool(state: {
    sources: AutomationAgentSource[];
}) {
    return tool({
        description:
            "Search the web for current public information using Tavily.",
        execute: async (input, { abortSignal }) => {
            const result = await webSearch({ ...input, abortSignal });
            for (const webResult of result.results) {
                if (!isHttpUrl(webResult.url)) {
                    continue;
                }
                state.sources.push({
                    title: webResult.title,
                    type: "web",
                    url: webResult.url,
                });
            }
            return result;
        },
        inputSchema: WebSearchInputSchema,
    });
}

export async function webSearch(args: {
    abortSignal?: AbortSignal;
    query: string;
    timeRange?: WebSearchTimeRange;
}) {
    "use step";

    const { serverEnv } = await import("@/env/server");
    const { tavilySearch } = await import("@tavily/ai-sdk");

    if (!serverEnv.TAVILY_API_KEY) {
        return {
            error: "Tavily search is not configured.",
            ok: false,
            results: [],
        };
    }

    if (args.abortSignal?.aborted) {
        return { error: "Tavily search was aborted.", ok: false, results: [] };
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

        const execute = searchTool.execute as unknown as TavilySearchExecute;
        const parsedPayload = TavilySearchPayloadSchema.safeParse(
            await raceAbort(
                execute(
                    {
                        query: args.query,
                        timeRange: args.timeRange,
                    },
                    TAVILY_MANUAL_EXECUTION_OPTIONS
                ),
                args.abortSignal
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
            results: payload.results.map((result) => ({
                content: result.content ?? "",
                score: result.score ?? null,
                title: result.title ?? result.url,
                url: result.url,
            })),
        };
    } catch (error) {
        if (isAbortError(error)) {
            searchLog.info("Tavily search aborted", {
                queryLength: args.query.length,
            });
            return {
                error: "Tavily search was aborted.",
                ok: false,
                results: [],
            };
        }
        searchLog.warn("Tavily search failed", {
            errorType: error instanceof Error ? error.name : typeof error,
            queryLength: args.query.length,
        });
        return {
            error: "Tavily search failed.",
            ok: false,
            results: [],
        };
    }
}
