import { tool } from "ai";
import * as z from "zod";
import { LIBRARY_ITEM_COLLECTIONS_INCLUDE } from "@/lib/collections/utils";
import { ITEM_KIND_FOLDER, SORT_DESC } from "@/lib/common/constants";
import { isHttpUrl, parseDisplayUrl } from "@/lib/common/url";
import type { Prisma } from "@/prisma/client/client";
import {
    AutomationPayloadItemsInputSchema,
    AutomationWebFetchInputSchema,
    EmptyAutomationToolInputSchema,
} from "../automations/tool-inputs";
import {
    ASSISTANT_DOMAIN_FILTER_MAX_LENGTH,
    ASSISTANT_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX,
    ASSISTANT_OPERATION_LIMIT,
    ASSISTANT_SOURCE_FILTER_VALUES,
    type AssistantComposerPatch,
    type AssistantRequest,
    AssistantToolUpdateInputSchema,
} from "../composer/assistant";
import {
    isNoopComposerPatch,
    normalizeComposerPatchForContext,
    resolveComposerPatchContradictions,
} from "../composer/patch";
import {
    type AgentViewPage,
    DefineAgentViewToolInputSchema,
    normalizeAgentViewQueryForContext,
} from "../composer/view";
import {
    buildLibraryDomainCondition,
    buildLibraryTextSearchConditions,
} from "../search";
import { truncateChars } from "../truncate";
import { GitHubRepoInputSchema, WebSearchInputSchema } from "./tool-inputs";

const AUTOMATION_AGENT_SOURCE_LIMIT = 100;

const ASSISTANT_LIBRARY_SEARCH_LIMIT_MAX = 50;
const ASSISTANT_LIBRARY_SEARCH_OFFSET_MAX = 10_000;
const ASSISTANT_LIBRARY_TEXT_PREVIEW_LENGTH_MAX = 1000;

export type AutomationAgentSource =
    | { id: string; title: string; type: "library_item"; url: string }
    | { title?: string; type: "web"; url: string };

export const AssistantLibrarySearchInputSchema = z.strictObject({
    collectionIds: z
        .array(z.string().trim().min(1).max(128))
        .max(10)
        .optional(),
    domainFilters: z
        .array(z.string().trim().min(1).max(ASSISTANT_DOMAIN_FILTER_MAX_LENGTH))
        .max(ASSISTANT_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX)
        .describe(
            "Optional site domains to match. Each entry is a bare hostname such as example.com — no scheme, path, or www. prefix. Values with extra parts are reduced to the hostname."
        )
        .optional(),
    limit: z.int().min(1).max(ASSISTANT_LIBRARY_SEARCH_LIMIT_MAX).optional(),
    offset: z
        .int()
        .min(0)
        .max(ASSISTANT_LIBRARY_SEARCH_OFFSET_MAX)
        .describe(
            `Skip this many matches before returning results. Continue with the previous result's nextOffset when it is not null. If truncated is true and nextOffset is null, the ${ASSISTANT_LIBRARY_SEARCH_OFFSET_MAX} offset limit prevents another page.`
        )
        .optional(),
    query: z
        .string()
        .trim()
        .max(200)
        .describe(
            "Optional lexical search over captions, note text, and URLs. Words are AND-matched within a single item. For conceptual requests, prefer concrete candidate names, brands, or domains — or use domainFilters — instead of broad category labels."
        )
        .optional(),
    sourceFilters: z
        .array(z.enum(ASSISTANT_SOURCE_FILTER_VALUES))
        .max(ASSISTANT_SOURCE_FILTER_VALUES.length)
        .optional(),
});

export function createAutomationAgentTools(args: { runId: string }) {
    const sources: AutomationAgentSource[] = [];

    const tools = {
        getAutomationPayloadSummary: tool({
            description:
                "Return the total size and scope of the saved-content payload available to this automation run.",
            execute: async () => {
                // Import server implementations lazily so the automation
                // workflow definition stays free of server-only modules.
                const { getAutomationPayloadSummary } = await import(
                    "../automations/payload"
                );
                return await getAutomationPayloadSummary({
                    runId: args.runId,
                });
            },
            inputSchema: EmptyAutomationToolInputSchema,
        }),
        github_repo: tool({
            description:
                "Get public stats for a GitHub repository: stars, forks, open issues, language, and description.",
            execute: async (input, { abortSignal }) => {
                const { githubRepo } = await import("./github-repo");
                const result = await githubRepo({ ...input, abortSignal });
                if (
                    result.ok &&
                    typeof result.url === "string" &&
                    isHttpUrl(result.url)
                ) {
                    sources.push({
                        title: result.repo,
                        type: "web",
                        url: result.url,
                    });
                }
                return result;
            },
            inputSchema: GitHubRepoInputSchema,
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
                    sources.push({
                        id: item.id,
                        title: item.caption?.trim() ? item.caption : item.url,
                        type: "library_item",
                        url: item.url,
                    });
                }
                return result;
            },
            inputSchema: AutomationPayloadItemsInputSchema,
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
                    sources.push({
                        type: "web",
                        url: result.url,
                    });
                }
                return result;
            },
            inputSchema: AutomationWebFetchInputSchema,
        }),
        web_search: tool({
            description:
                "Search the web for current public information using Tavily.",
            execute: async (input, { abortSignal }) => {
                const { webSearch } = await import("./web-search");
                const result = await webSearch({ ...input, abortSignal });
                for (const webResult of result.results) {
                    if (!isHttpUrl(webResult.url)) {
                        continue;
                    }
                    sources.push({
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

    return {
        getSources: (): { sources: AutomationAgentSource[] } =>
            uniqueSources(sources),
        tools,
    };
}

export function createAssistantAgentTools(args: {
    input: AssistantRequest;
    userId: string;
}) {
    const operations: AssistantComposerPatch[] = [];
    const operationSummaries: string[] = [];
    let view: AgentViewPage | null = null;

    const tools = {
        define_view: tool({
            description:
                "Define the ephemeral library view for show, find, or filter requests. Prefer this over update_composer for navigation. Returns server-resolved item ids in recency order with a truncated flag. One view per run; the last call wins.",
            execute: async (toolInput) => {
                const query = normalizeAgentViewQueryForContext(
                    toolInput.query,
                    {
                        availableCollections:
                            args.input.visibleContext.availableCollections,
                        availableDomains:
                            args.input.visibleContext.availableDomains,
                    }
                );

                const { resolveAgentViewPage } = await import(
                    "../composer/view-service"
                );
                const page = await resolveAgentViewPage({
                    query,
                    userId: args.userId,
                });

                view = {
                    explanation: toolInput.explanation,
                    itemIds: page.itemIds,
                    nextOffset: page.nextOffset,
                    query,
                    title: toolInput.title,
                    truncated: page.truncated,
                };

                return {
                    itemCount: view.itemIds.length,
                    ok: true,
                    previewLimited: page.previewLimited,
                    title: view.title,
                    truncated: view.truncated,
                };
            },
            inputSchema: DefineAgentViewToolInputSchema,
        }),
        github_repo: tool({
            description:
                "Get public stats for a GitHub repository: stars, forks, open issues, language, and description. Use this for questions about a specific repository.",
            execute: async (input, { abortSignal }) => {
                const { githubRepo } = await import("./github-repo");
                return await githubRepo({ ...input, abortSignal });
            },
            inputSchema: GitHubRepoInputSchema,
        }),
        search_library: tool({
            description:
                "Search the user's saved Cache library. Query words are AND-matched across caption, note text, and URL within each item. Prefer concrete names, brands, domains, domainFilters, sourceFilters, or collectionIds over broad category labels. When truncated is true, continue with nextOffset while it is not null; if it is null, explain that the offset limit was reached and the result is partial.",
            execute: (toolInput) =>
                searchAssistantLibrary({
                    input: toolInput,
                    userId: args.userId,
                }),
            inputSchema: AssistantLibrarySearchInputSchema,
        }),
        update_composer: tool({
            description:
                "Apply a validated composer patch. Batch all state changes into one call. Only include fields that differ from the current composer state; noop patches are rejected. Prefer high-confidence concrete filters (domains, collections, sources, entity names) over generic category searchTerms.",
            execute: (toolInput) => {
                if (operations.length >= ASSISTANT_OPERATION_LIMIT) {
                    return {
                        ok: false,
                        reason: "operation_limit_reached",
                    };
                }

                const patch = resolveComposerPatchContradictions(
                    normalizeComposerPatchForContext(
                        toolInput.patch,
                        args.input
                    ),
                    args.input.composerState
                );

                if (isNoopComposerPatch(patch, args.input.composerState)) {
                    return {
                        ok: false,
                        reason: "patch_is_noop",
                        validationNote:
                            "All proposed changes already match the current composer state. Update only fields that differ.",
                    };
                }

                operations.push(patch);
                operationSummaries.push(toolInput.summary);
                return {
                    appliedOperationCount: operations.length,
                    ok: true,
                    patch,
                    summary: toolInput.summary,
                };
            },
            inputSchema: AssistantToolUpdateInputSchema,
        }),
        web_search: tool({
            description:
                "Search the public web for current context. Use this only when public, current information would improve the answer.",
            execute: async (input, { abortSignal }) => {
                const { webSearch } = await import("./web-search");
                return await webSearch({ ...input, abortSignal });
            },
            inputSchema: WebSearchInputSchema,
        }),
    };

    return {
        getOperationSummaries: (): string[] => [...operationSummaries],
        getOperations: (): AssistantComposerPatch[] => [...operations],
        getView: (): AgentViewPage | null => view,
        tools,
    };
}

function uniqueSources(sources: AutomationAgentSource[]) {
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

async function searchAssistantLibrary(args: {
    input: z.infer<typeof AssistantLibrarySearchInputSchema>;
    userId: string;
}) {
    // Import the database client lazily so this module stays importable
    // from the automation workflow definition.
    const { prisma } = await import("@/prisma");

    const limit = Math.min(
        args.input.limit ?? 20,
        ASSISTANT_LIBRARY_SEARCH_LIMIT_MAX
    );
    const offset = Math.min(
        args.input.offset ?? 0,
        ASSISTANT_LIBRARY_SEARCH_OFFSET_MAX
    );
    const search = args.input.query?.trim();
    const collectionIds = args.input.collectionIds ?? [];
    const sourceFilters = args.input.sourceFilters ?? [];
    const searchConditions: Prisma.LibraryItemWhereInput[] = [];
    if (search) {
        searchConditions.push(...buildLibraryTextSearchConditions(search));
    }
    const domainCondition = buildLibraryDomainCondition(
        args.input.domainFilters ?? []
    );
    if (domainCondition) {
        searchConditions.push(domainCondition);
    }

    const where: Prisma.LibraryItemWhereInput = {
        deletedAt: null,
        kind: { not: ITEM_KIND_FOLDER },
        userId: args.userId,
        ...(collectionIds.length > 0
            ? {
                  collections: {
                      some: { id: { in: collectionIds } },
                  },
              }
            : {}),
        ...(sourceFilters.length > 0 ? { source: { in: sourceFilters } } : {}),
        ...(searchConditions.length > 0 ? { AND: searchConditions } : {}),
    };

    const items = await prisma.libraryItem.findMany({
        include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
        orderBy: [
            { scrapedAt: SORT_DESC },
            { updatedAt: SORT_DESC },
            { id: SORT_DESC },
        ],
        skip: offset,
        take: limit + 1,
        where,
    });

    const truncated = items.length > limit;
    const nextOffset = offset + limit;

    return {
        items: items.slice(0, limit).map((item) => ({
            caption: item.caption,
            collectionNames: item.collections.map(
                (collection) => collection.name
            ),
            createdAt: item.createdAt.toISOString(),
            domain: parseDisplayUrl(item.url),
            id: item.id,
            kind: item.kind,
            postedAt: item.postedAt?.toISOString() ?? null,
            source: item.source,
            textPreview: item.noteContentText
                ? truncateChars(
                      item.noteContentText,
                      ASSISTANT_LIBRARY_TEXT_PREVIEW_LENGTH_MAX,
                      "…"
                  )
                : null,
            url: item.url,
        })),
        limit,
        nextOffset:
            truncated && nextOffset <= ASSISTANT_LIBRARY_SEARCH_OFFSET_MAX
                ? nextOffset
                : null,
        offset,
        truncated,
    };
}
