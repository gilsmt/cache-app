import type { ToolExecutionOptions } from "ai";
import { tool } from "ai";
import * as z from "zod";
import { isAbortError, raceAbort } from "@/lib/common/abort";
import { createLogger } from "@/lib/common/logs/console/logger";
import { isHttpUrl } from "@/lib/common/url";

const searchLog = createLogger("intelligence:web-search");
const repoLog = createLogger("intelligence:github-repo");

/**
 * The module stays client- and workflow-importable: no server-only imports
 * at the top level. The Tavily client and environment load lazily inside
 * the step functions, and web_fetch's SSRF-bounded fetch is an automation
 * payload step loaded at execution time.
 */

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

const GITHUB_REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

const GitHubRepoInputSchema = z.object({
    repo: z
        .string()
        .trim()
        .regex(GITHUB_REPO_PATTERN, 'Must be in "owner/name" format.')
        .describe(
            'The repository in "owner/name" format, e.g. "vercel/next.js"'
        ),
});

const WebFetchInputSchema = z.object({
    // z.url() fails at WorkflowAgent tool schema compilation with unknown format "uri".
    // Use a plain string with a runtime check instead.
    url: z
        .string()
        .trim()
        .min(1)
        .max(4096)
        .refine(isHttpUrl, { error: "URL must be an http(s) URL." })
        .describe("Absolute http(s) URL, e.g. https://example.com/article."),
});

export type AutomationAgentSource =
    | { id: string; title: string; type: "library_item"; url: string }
    | { title?: string; type: "web"; url: string };

const AUTOMATION_AGENT_SOURCE_LIMIT = 100;

export function createWebAgentTools(state: {
    sources: AutomationAgentSource[];
}) {
    const tools = {
        github_repo: tool({
            description:
                "Get public stats for a GitHub repository: stars, forks, open issues, language, and description.",
            execute: async (input, { abortSignal }) => {
                const result = await githubRepo({ ...input, abortSignal });
                if (
                    result.ok &&
                    typeof result.url === "string" &&
                    isHttpUrl(result.url)
                ) {
                    state.sources.push({
                        title: result.repo,
                        type: "web",
                        url: result.url,
                    });
                }
                return result;
            },
            inputSchema: GitHubRepoInputSchema,
        }),
        web_fetch: tool({
            description:
                "Fetch a public http(s) URL with SSRF protections and a bounded response body.",
            execute: async (input) => {
                const { automationWebFetch } = await import(
                    "../automations/payload"
                );
                const result = await automationWebFetch({
                    url: input.url,
                });
                if (typeof result.url === "string" && isHttpUrl(result.url)) {
                    state.sources.push({
                        type: "web",
                        url: result.url,
                    });
                }
                return result;
            },
            inputSchema: WebFetchInputSchema,
        }),
        web_search: tool({
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
        }),
    };

    return tools;
}

export function uniqueSources(sources: AutomationAgentSource[]) {
    const byKey = new Map<string, AutomationAgentSource>();
    for (const source of sources) {
        const tag = source.type === "library_item" ? source.id : source.url;
        const key = `${source.type}:${tag}`;
        if (!byKey.has(key)) {
            byKey.set(key, source);
        }
    }
    return {
        sources: [...byKey.values()].slice(0, AUTOMATION_AGENT_SOURCE_LIMIT),
    };
}

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
            searchLog.info("Tavily search aborted", { query: args.query });
            return {
                error: "Tavily search was aborted.",
                ok: false,
                results: [],
            };
        }
        searchLog.warn("Tavily search failed", {
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

const GITHUB_REPO_TIMEOUT_MS = 5000;
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_USER_AGENT = "CacheApp/1.0 (+https://www.cachd.app)";

const GitHubRepoPayloadSchema = z.object({
    description: z.string().nullable().optional(),
    forks_count: z.number().optional(),
    full_name: z.string().optional(),
    html_url: z.string().optional(),
    language: z.string().nullable().optional(),
    open_issues_count: z.number().optional(),
    stargazers_count: z.number().optional(),
});

export async function githubRepo(args: {
    abortSignal?: AbortSignal;
    repo: string;
}) {
    "use step";

    const { abortSignal, repo } = args;
    const timeout = AbortSignal.timeout(GITHUB_REPO_TIMEOUT_MS);
    const signal = abortSignal
        ? AbortSignal.any([abortSignal, timeout])
        : timeout;

    try {
        const res = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: {
                accept: "application/vnd.github+json",
                "User-Agent": GITHUB_USER_AGENT,
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
            signal,
        });
        if (!res.ok) {
            return { error: `Could not find repository ${repo}.`, ok: false };
        }
        const parsedPayload = GitHubRepoPayloadSchema.safeParse(
            await res.json().catch(() => null)
        );
        if (!parsedPayload.success) {
            return {
                error: `GitHub returned an unexpected response for ${repo}.`,
                ok: false,
            };
        }

        const payload = parsedPayload.data;
        return {
            description: payload.description ?? "",
            forks: payload.forks_count ?? 0,
            language: payload.language ?? "Unknown",
            ok: true,
            openIssues: payload.open_issues_count ?? 0,
            repo: payload.full_name ?? repo,
            stars: payload.stargazers_count ?? 0,
            url: payload.html_url ?? `https://github.com/${repo}`,
        };
    } catch (error) {
        if (isAbortError(error)) {
            if (timeout.aborted) {
                return {
                    error: `GitHub request for ${repo} timed out.`,
                    ok: false,
                };
            }
            repoLog.info("GitHub repo fetch aborted", { repo });
            return {
                error: `GitHub request for ${repo} was aborted.`,
                ok: false,
            };
        }
        repoLog.warn("GitHub repo fetch failed", {
            error: error instanceof Error ? error.message : String(error),
            repo,
        });
        return { error: `Could not reach GitHub for ${repo}.`, ok: false };
    }
}
