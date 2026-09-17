import "server-only";

import { tavilySearch } from "@tavily/ai-sdk";
import type { ToolExecutionOptions } from "ai";
import * as z from "zod";
import { serverEnv } from "@/env/server";
import { isAbortError, raceAbort } from "@/lib/common/abort";
import { createLogger } from "@/lib/common/logs/console/logger";
import type { WebSearchTimeRange } from "./tool-inputs";

const log = createLogger("intelligence:web-search");

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

type TavilySearchExecute = (
    args: {
        query: string;
        timeRange?: WebSearchTimeRange;
    },
    options: typeof TAVILY_MANUAL_EXECUTION_OPTIONS
) => Promise<unknown>;

export async function webSearch(args: {
    abortSignal?: AbortSignal;
    query: string;
    timeRange?: WebSearchTimeRange;
}) {
    "use step";

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
            results:
                payload.results?.map((result) => ({
                    content: result.content ?? "",
                    score: result.score ?? null,
                    title: result.title ?? result.url,
                    url: result.url,
                })) ?? [],
        };
    } catch (error) {
        if (isAbortError(error)) {
            log.info("Tavily search aborted", { query: args.query });
            return {
                error: "Tavily search was aborted.",
                ok: false,
                results: [],
            };
        }
        log.warn("Tavily search failed", {
            error: error instanceof Error ? error.message : String(error),
            query: args.query,
        });
        return {
            error: "Tavily search failed.",
            ok: false,
            results: [],
        };
    }
}
