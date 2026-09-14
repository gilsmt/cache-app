import "server-only";

import type { ArcjetNextRequest } from "@arcjet/next";
import { isStepCount, ToolLoopAgent, tool } from "ai";
import * as z from "zod";
import { LIBRARY_ITEM_COLLECTIONS_INCLUDE } from "@/lib/collections/utils";
import { ITEM_KIND_FOLDER, SORT_DESC } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { truncateText } from "@/lib/common/string";
import { parseDisplayUrl } from "@/lib/common/url";
import { prisma } from "@/prisma";
import type { Prisma } from "@/prisma/client/client";
import { AUTOMATION_WEB_SEARCH_TIME_RANGES } from "../automations/tool-inputs";
import { automationWebSearch } from "../automations/web-search";
import { EmptyGenerationOutputError, summarizeStepUsage } from "../classify";
import { type GenerationUsage, runModelChain } from "../generation";
import { normalizeGeneratedMarkdown } from "../markdown";
import { estimateGenAiTokens, protectGenAiRequest } from "../protection";
import type { resolveLanguageModel } from "../providers/resolve-model";
import {
    ASK_CACHE_DOMAIN_FILTER_COUNT_MAX,
    ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH,
    ASK_CACHE_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX,
    ASK_CACHE_OPERATION_LIMIT,
    ASK_CACHE_SEARCH_TERM_COUNT_MAX,
    ASK_CACHE_SOURCE_FILTER_VALUES,
    type AskCacheComposerPatch,
    type AskCacheRequest,
    AskCacheToolUpdateInputSchema,
} from "./ask-cache";
import {
    isNoopComposerPatch,
    normalizeComposerPatchForContext,
    resolveComposerPatchContradictions,
} from "./patch";

const ASK_CACHE_OUTPUT_TOKEN_LIMIT = 1200;
const ASK_CACHE_MAX_STEPS = 12;
const ASK_CACHE_TIMEOUT_MS = 60_000;
const ASK_CACHE_LIBRARY_SEARCH_LIMIT_MAX = 50;
const ASK_CACHE_LIBRARY_SEARCH_OFFSET_MAX = 10_000;
const ASK_CACHE_LIBRARY_TEXT_PREVIEW_LENGTH_MAX = 1000;
const ASK_CACHE_RUNTIME_CONTEXT_LOCALE_DEFAULT = "en-US";
const ASK_CACHE_RUNTIME_CONTEXT_SURFACE_LABEL_BY_VALUE = {
    library_composer: "Cache library composer",
} as const;

const WHITESPACE_SPLIT_PATTERN = /\s+/;
const WWW_DOMAIN_PREFIX_PATTERN = /^www\./;

const log = createLogger("intelligence:ask-cache");

const AskCacheLibrarySearchInputSchema = z.strictObject({
    collectionIds: z
        .array(z.string().trim().min(1).max(128))
        .max(10)
        .optional(),
    domainFilters: z
        .array(z.string().trim().min(1).max(ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH))
        .max(ASK_CACHE_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX)
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

const AskCacheWebSearchInputSchema = z.strictObject({
    query: z.string().trim().min(1).max(500),
    timeRange: z.enum(AUTOMATION_WEB_SEARCH_TIME_RANGES).optional(),
});

interface RunAskCacheAgentInput {
    input: AskCacheRequest;
    request: ArcjetNextRequest;
    userId: string;
}

interface RunAskCacheAgentResult {
    markdown: string;
    operations: AskCacheComposerPatch[];
    usage?: GenerationUsage;
}

export async function runAskCacheAgent({
    input,
    request,
    userId,
}: RunAskCacheAgentInput): Promise<RunAskCacheAgentResult> {
    const instructions = buildAskCacheInstructions(input);
    const userMessage = buildAskCacheUserMessage(input);

    await protectGenAiRequest({
        feature: "ask_cache_agent",
        request,
        requestedTokens: estimateGenAiTokens(
            `${instructions}\n\n${userMessage}`,
            ASK_CACHE_OUTPUT_TOKEN_LIMIT
        ),
        userId,
    });

    try {
        const result = await runModelChain(
            {
                defaultErrorMessage: "We couldn't ask Cache right now.",
                feature: "ask-cache-agent",
                logContext: { userId },
                operation: "runAskCacheAgent",
            },
            (model) =>
                runAskCacheAgentModel({
                    input,
                    instructions,
                    model,
                    userId,
                    userMessage,
                })
        );
        return {
            markdown: result.output.markdown,
            operations: result.output.operations,
            usage: result.usage,
        };
    } catch (error) {
        log.error("Ask Cache agent run failed", {
            errorMessage:
                error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : undefined,
            userId,
        });
        throw error;
    }
}

async function runAskCacheAgentModel(args: {
    input: AskCacheRequest;
    instructions: string;
    model: Awaited<ReturnType<typeof resolveLanguageModel>>;
    userMessage: string;
    userId: string;
}): Promise<{
    output: { markdown: string; operations: AskCacheComposerPatch[] };
    usage?: GenerationUsage;
}> {
    const operations: AskCacheComposerPatch[] = [];
    const operationSummaries: string[] = [];

    const agent = new ToolLoopAgent({
        instructions: args.instructions,
        maxOutputTokens: ASK_CACHE_OUTPUT_TOKEN_LIMIT,
        model: args.model,
        stopWhen: isStepCount(ASK_CACHE_MAX_STEPS),
        tools: {
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
                execute: automationWebSearch,
                inputSchema: AskCacheWebSearchInputSchema,
            }),
        },
    });

    const result = await agent.generate({
        messages: [{ content: args.userMessage, role: "user" }],
        timeout: ASK_CACHE_TIMEOUT_MS,
    });

    const markdown = getFinalMarkdown(result.steps, operationSummaries);
    if (!markdown) {
        throw new EmptyGenerationOutputError();
    }

    return {
        output: { markdown, operations },
        usage: summarizeStepUsage(result.steps),
    };
}

async function searchAskCacheLibrary(args: {
    input: z.infer<typeof AskCacheLibrarySearchInputSchema>;
    userId: string;
}) {
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
    const domainFilters = (args.input.domainFilters ?? []).map((domain) =>
        domain.toLowerCase()
    );
    const searchConditions: Prisma.LibraryItemWhereInput[] = [];
    if (search) {
        const terms = search
            .split(WHITESPACE_SPLIT_PATTERN)
            .filter((term) => term.length > 0);
        const termGroups: Prisma.LibraryItemWhereInput[] = terms.map(
            (term) => ({
                OR: [
                    { caption: { contains: term, mode: "insensitive" } },
                    {
                        noteContentText: {
                            contains: term,
                            mode: "insensitive",
                        },
                    },
                    { url: { contains: term, mode: "insensitive" } },
                ],
            })
        );
        searchConditions.push(...termGroups);
    }
    const domainCondition = buildAskCacheDomainCondition(domainFilters);
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
                ? truncateText(
                      item.noteContentText,
                      ASK_CACHE_LIBRARY_TEXT_PREVIEW_LENGTH_MAX
                  )
                : null,
            url: item.url,
        })),
        limit,
        offset,
        truncated: items.length > limit,
    };
}

function buildAskCacheDomainCondition(
    domainFilters: string[]
): Prisma.LibraryItemWhereInput | null {
    if (domainFilters.length === 0) {
        return null;
    }

    const uniqueDomains = [
        ...new Set(
            domainFilters.map((rawDomain) =>
                rawDomain.replace(WWW_DOMAIN_PREFIX_PATTERN, "")
            )
        ),
    ];

    const orConditions: Prisma.LibraryItemWhereInput[] = [];
    for (const domain of uniqueDomains) {
        for (const host of [domain, `www.${domain}`]) {
            orConditions.push({ url: { equals: host, mode: "insensitive" } });
            orConditions.push({
                url: { equals: `http://${host}`, mode: "insensitive" },
            });
            orConditions.push({
                url: { equals: `https://${host}`, mode: "insensitive" },
            });
            for (const prefix of [
                `http://${host}/`,
                `http://${host}?`,
                `http://${host}#`,
                `http://${host}:`,
                `https://${host}/`,
                `https://${host}?`,
                `https://${host}#`,
                `https://${host}:`,
            ]) {
                orConditions.push({
                    url: { mode: "insensitive", startsWith: prefix },
                });
            }
        }
    }

    return { OR: orConditions };
}

function buildAskCacheInstructions(input: AskCacheRequest): string {
    const collectionCatalog = input.visibleContext.availableCollections.map(
        (collection) => ({
            id: collection.id,
            itemCount: collection.itemCount,
            name: collection.name,
        })
    );
    const runtimeContext = buildAskCacheRuntimeContext(input);

    return [
        "You are Ask Cache, an assistant embedded in Cache's library composer.",
        "You can answer conversationally and can update the composer by calling update_composer.",
        "This is a one-shot interaction, not a chat thread. Do not ask the user follow-up questions or end with offers to continue.",
        "When the request is ambiguous, make the best reasonable assumption from the current composer state and visible context, state that assumption briefly, then act.",
        "Never claim to inspect library items unless you called search_library.",
        "Use update_composer for requests that ask to show, find, filter, sort, group, or reset.",
        "Prefer update_composer over setting searchTerms alone when concrete filters (collections, domains, sources) are available.",
        "Use exact collection ids from the collection catalog when selecting collection filters.",
        "selectedCollectionIds and collectionMembershipFilter: 'not-in-collections' are mutually exclusive — an item in a selected collection is by definition in a collection, so combining them always yields zero results. For 'things about X not in the X collection' requests, use collectionMembershipFilter: 'not-in-collections' with searchTerms about X, and set selectedCollectionIds: [] (omit only when none are already selected).",
        "Use exact domains from availableDomains when applying domainFilters.",
        "Composer filters are exact-match tools, not a semantic category classifier.",
        "Library entries usually do not contain category labels like software product, recipe, tutorial, or inspiration in caption, note text, URL, or metadata.",
        "Do not set searchTerms to broad category words such as software, product, tool, recipe, tutorial, article, inspiration, or design unless the user explicitly asks for those literal words.",
        "For conceptual requests: (1) prefer an exact matching collection if one exists; (2) inspect with search_library using concrete product, brand, domain, source, or URL signals; (3) apply high-confidence concrete filters.",
        "When domainFilters express a conceptual match, include every high-confidence matching domain from availableDomains — do not sample a short representative list when more matching domains are available.",
        `domainFilters accept up to ${ASK_CACHE_DOMAIN_FILTER_COUNT_MAX} domains; searchTerms accept up to ${ASK_CACHE_SEARCH_TERM_COUNT_MAX} terms. Use the full budget when the user wants a complete set.`,
        "Relevant sourceFilters can help (for example github_starred_repositories for developer tools) and may be combined with domainFilters.",
        "For 'show me all …' inventory requests, call search_library first (page with offset while truncated is true when needed), then update_composer when a useful filter exists.",
        "Example: for 'show me all software products I saved', do not set searchTerms to ['software']. Prefer a matching collection if present; otherwise select all high-confidence product/app/SaaS/tool domains from availableDomains, include relevant sources, apply them together, and note any mixed-content domains you intentionally left out.",
        "If the concept cannot be expressed completely with composer filters, say so plainly, apply only high-confidence filters, and answer with what search_library found. Never invent vague 'system constraints'; if a hard limit was hit, name the actual limit and that the result is partial.",
        "Use web_search only when public, current information would materially improve the answer beyond what is in the user's library.",
        "Prefer concise markdown. Mention applied composer changes in one short sentence when you call update_composer.",
        "Batch multiple composer changes into one update_composer call. The patch accepts searchTerms, sourceFilters, domainFilters, selectedCollectionIds, collectionMembershipFilter, groupBy, sortMode, columnCountMode, and reset all at once.",
        "Call update_composer at most 8 times. After reaching the limit, stop and explain what was applied.",
        "Do not mutate saved items, collections, notes, or external services.",
        "",
        "Runtime context:",
        JSON.stringify(runtimeContext),
        "",
        "Current composer state:",
        JSON.stringify(input.composerState),
        "",
        "Visible context:",
        JSON.stringify({
            availableDomains: input.visibleContext.availableDomains,
            filteredItemCount: input.visibleContext.filteredItemCount,
            totalItemCount: input.visibleContext.totalItemCount,
        }),
        "",
        "Collection catalog:",
        JSON.stringify(collectionCatalog),
    ].join("\n");
}

function buildAskCacheRuntimeContext(input: AskCacheRequest) {
    const now = new Date();
    const clientTimeZone = normalizeAskCacheTimeZone(
        input.runtimeContext.clientTimeZone
    );
    const clientLocale = normalizeAskCacheLocale(
        input.runtimeContext.clientLocale
    );
    const formatter = new Intl.DateTimeFormat(clientLocale, {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: clientTimeZone,
    });

    return {
        app: "Cache",
        currentDateTime: formatter.format(now),
        currentIsoDateTime: now.toISOString(),
        surface:
            ASK_CACHE_RUNTIME_CONTEXT_SURFACE_LABEL_BY_VALUE[
                input.runtimeContext.surface
            ],
        timeZone: clientTimeZone,
    };
}

function normalizeAskCacheTimeZone(timeZone: string | undefined): string {
    if (!timeZone) {
        return "UTC";
    }

    try {
        new Intl.DateTimeFormat(ASK_CACHE_RUNTIME_CONTEXT_LOCALE_DEFAULT, {
            timeZone,
        }).format(new Date());
        return timeZone;
    } catch {
        return "UTC";
    }
}

function normalizeAskCacheLocale(locale: string | undefined): string {
    if (!locale) {
        return ASK_CACHE_RUNTIME_CONTEXT_LOCALE_DEFAULT;
    }

    try {
        Intl.getCanonicalLocales(locale);
        return locale;
    } catch {
        return ASK_CACHE_RUNTIME_CONTEXT_LOCALE_DEFAULT;
    }
}

function buildAskCacheUserMessage(input: AskCacheRequest): string {
    return [
        "User request:",
        input.prompt,
        "",
        "If this is a library navigation command, call update_composer once with all state changes batched together, then briefly explain what changed.",
        "If this is a normal question, answer directly and call tools only when they are useful.",
        "Do not ask follow-up questions. If details are missing, proceed with a reasonable assumption or explain the limitation as a final answer.",
    ].join("\n");
}

/**
 * Recovers the final markdown from an agent run: the last non-empty step,
 * then aggregated step text, then operation summaries. Each candidate is
 * normalized before acceptance because providers occasionally wrap the
 * response in a JSON envelope.
 */
function getFinalMarkdown(
    steps: Array<{ text: string }>,
    operationSummaries: string[]
): string | null {
    const lastStepText = steps.findLast((step) => step.text.trim())?.text;
    const aggregatedStepText = steps
        .map((step) => step.text.trim())
        .filter((text) => text.length > 0)
        .join("\n");
    const summaryText =
        operationSummaries.length > 0
            ? operationSummaries.join("\n")
            : undefined;

    for (const candidate of [lastStepText, aggregatedStepText, summaryText]) {
        const normalized = normalizeGeneratedMarkdown(candidate);
        if (normalized) {
            return normalized;
        }
    }

    return null;
}
