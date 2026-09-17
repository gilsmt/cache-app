import { tool } from "ai";
import * as z from "zod";
import { LIBRARY_ITEM_COLLECTIONS_INCLUDE } from "@/lib/collections/utils";
import { ITEM_KIND_FOLDER, SORT_DESC } from "@/lib/common/constants";
import { escapeLikePattern } from "@/lib/common/string";
import { parseDisplayUrl, tryParseUrl } from "@/lib/common/url";
import type { Prisma } from "@/prisma/client/client";
import {
    AutomationPayloadItemsInputSchema,
    AutomationWebFetchInputSchema,
    EmptyAutomationToolInputSchema,
} from "../automations/tool-inputs";
import {
    ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH,
    ASK_CACHE_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX,
    ASK_CACHE_OPERATION_LIMIT,
    ASK_CACHE_SOURCE_FILTER_VALUES,
    type AskCacheComposerPatch,
    type AskCacheRequest,
    AskCacheToolUpdateInputSchema,
} from "../composer/ask-cache";
import {
    isNoopComposerPatch,
    normalizeComposerPatchForContext,
    resolveComposerPatchContradictions,
} from "../composer/patch";
import { truncateChars } from "../truncate";
import { GitHubRepoInputSchema, WebSearchInputSchema } from "./tool-inputs";

const AUTOMATION_AGENT_SOURCE_LIMIT = 100;

const ASK_CACHE_LIBRARY_SEARCH_LIMIT_MAX = 50;
const ASK_CACHE_LIBRARY_SEARCH_OFFSET_MAX = 10_000;
const ASK_CACHE_LIBRARY_TEXT_PREVIEW_LENGTH_MAX = 1000;

const WHITESPACE_SPLIT_PATTERN = /\s+/;
const WWW_DOMAIN_PREFIX_PATTERN = /^www\./;

export type AutomationAgentSource =
    | { id: string; title: string; type: "library_item"; url: string }
    | { title?: string; type: "web"; url: string };

export const AskCacheLibrarySearchInputSchema = z.strictObject({
    collectionIds: z
        .array(z.string().trim().min(1).max(128))
        .max(10)
        .optional(),
    domainFilters: z
        .array(z.string().trim().min(1).max(ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH))
        .max(ASK_CACHE_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX)
        .describe(
            "Optional site domains to match. Each entry is a bare hostname such as example.com — no scheme, path, or www. prefix. Values with extra parts are reduced to the hostname."
        )
        .optional(),
    limit: z.int().min(1).max(ASK_CACHE_LIBRARY_SEARCH_LIMIT_MAX).optional(),
    offset: z
        .int()
        .min(0)
        .max(ASK_CACHE_LIBRARY_SEARCH_OFFSET_MAX)
        .describe(
            "Skip this many matches before returning results. Use with limit when a previous search_library call returned truncated: true."
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
        .array(z.enum(ASK_CACHE_SOURCE_FILTER_VALUES))
        .max(ASK_CACHE_SOURCE_FILTER_VALUES.length)
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
                if (result.ok && typeof result.url === "string") {
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
                    sources.push({
                        id: item.id,
                        title: item.caption ?? item.url,
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
                if (typeof result.url === "string") {
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

export function createAskCacheAgentTools(args: {
    input: AskCacheRequest;
    userId: string;
}) {
    const operations: AskCacheComposerPatch[] = [];
    const operationSummaries: string[] = [];

    const tools = {
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
                "Search the user's saved Cache library. Query words are AND-matched across caption, note text, and URL within each item. Prefer concrete names, brands, domains, domainFilters, sourceFilters, or collectionIds over broad category labels. When truncated is true, page with offset to continue the inventory.",
            execute: (toolInput) =>
                searchAskCacheLibrary({
                    input: toolInput,
                    userId: args.userId,
                }),
            inputSchema: AskCacheLibrarySearchInputSchema,
        }),
        update_composer: tool({
            description:
                "Apply a validated composer patch. Batch all state changes into one call. Only include fields that differ from the current composer state; noop patches are rejected. Prefer high-confidence concrete filters (domains, collections, sources, entity names) over generic category searchTerms.",
            execute: (toolInput) => {
                if (operations.length >= ASK_CACHE_OPERATION_LIMIT) {
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
            inputSchema: AskCacheToolUpdateInputSchema,
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
        getOperations: (): AskCacheComposerPatch[] => [...operations],
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

async function searchAskCacheLibrary(args: {
    input: z.infer<typeof AskCacheLibrarySearchInputSchema>;
    userId: string;
}) {
    // Import the database client lazily so this module stays importable
    // from the automation workflow definition.
    const { prisma } = await import("@/prisma");

    const limit = Math.min(
        args.input.limit ?? 20,
        ASK_CACHE_LIBRARY_SEARCH_LIMIT_MAX
    );
    const offset = Math.min(
        args.input.offset ?? 0,
        ASK_CACHE_LIBRARY_SEARCH_OFFSET_MAX
    );
    const search = args.input.query?.trim();
    const collectionIds = args.input.collectionIds ?? [];
    const sourceFilters = args.input.sourceFilters ?? [];
    const searchConditions: Prisma.LibraryItemWhereInput[] = [];
    if (search) {
        const terms = search
            .split(WHITESPACE_SPLIT_PATTERN)
            .filter((term) => term.length > 0);
        const termGroups: Prisma.LibraryItemWhereInput[] = terms.map((term) => {
            const literal = escapeLikePattern(term);
            return {
                OR: [
                    {
                        caption: { contains: literal, mode: "insensitive" },
                    },
                    {
                        noteContentText: {
                            contains: literal,
                            mode: "insensitive",
                        },
                    },
                    { url: { contains: literal, mode: "insensitive" } },
                ],
            };
        });
        searchConditions.push(...termGroups);
    }
    const domainCondition = buildAskCacheDomainCondition(
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
        orderBy: [{ scrapedAt: SORT_DESC }, { updatedAt: SORT_DESC }],
        skip: offset,
        take: limit + 1,
        where,
    });

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
                      ASK_CACHE_LIBRARY_TEXT_PREVIEW_LENGTH_MAX,
                      "…"
                  )
                : null,
            url: item.url,
        })),
        limit,
        offset,
        truncated: items.length > limit,
    };
}

/**
 * Builds URL match predicates from loose domain filter strings. Model output
 * may carry a scheme, path, or `www.` prefix, so each value is reduced to its
 * bare host before the match variants are expanded. Values with no usable
 * host are ignored.
 */
export function buildAskCacheDomainCondition(
    domainFilters: string[]
): Prisma.LibraryItemWhereInput | null {
    const uniqueDomains = [
        ...new Set(
            domainFilters
                .map(normalizeDomainFilter)
                .filter((domain) => domain.length > 0)
        ),
    ];

    if (uniqueDomains.length === 0) {
        return null;
    }

    const orConditions: Prisma.LibraryItemWhereInput[] = [];
    for (const domain of uniqueDomains) {
        orConditions.push(...buildDomainMatchPredicates(domain));
    }

    return { OR: orConditions };
}

/**
 * Reduces a filter value to its bare host in lowercase, matching the
 * `parseDisplayUrl` format used across the app. Returns "" when the value
 * carries no usable host.
 */
function normalizeDomainFilter(rawDomain: string): string {
    const trimmed = rawDomain.trim().toLowerCase();
    if (trimmed.length === 0) {
        return "";
    }

    const parsed = tryParseUrl(trimmed);
    if (parsed && parsed.hostname.length > 0) {
        return parsed.hostname.replace(WWW_DOMAIN_PREFIX_PATTERN, "");
    }

    // Scheme-less values such as "example.com/blog" or "example.com:8443"
    // parse as URLs with an empty hostname; retry with a scheme prepended.
    const withScheme = tryParseUrl(`https://${trimmed}`);
    if (withScheme && withScheme.hostname.length > 0) {
        return withScheme.hostname.replace(WWW_DOMAIN_PREFIX_PATTERN, "");
    }

    return "";
}

function buildDomainMatchPredicates(
    host: string
): Prisma.LibraryItemWhereInput[] {
    const predicates: Prisma.LibraryItemWhereInput[] = [];
    for (const candidate of [host, `www.${host}`]) {
        predicates.push({ url: { equals: candidate, mode: "insensitive" } });
        predicates.push({
            url: { equals: `http://${candidate}`, mode: "insensitive" },
        });
        predicates.push({
            url: { equals: `https://${candidate}`, mode: "insensitive" },
        });
        for (const prefix of [
            `http://${candidate}/`,
            `http://${candidate}?`,
            `http://${candidate}#`,
            `http://${candidate}:`,
            `https://${candidate}/`,
            `https://${candidate}?`,
            `https://${candidate}#`,
            `https://${candidate}:`,
        ]) {
            predicates.push({
                url: { mode: "insensitive", startsWith: prefix },
            });
        }
    }
    return predicates;
}
