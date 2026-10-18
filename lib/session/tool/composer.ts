import { tool } from "ai";
import * as z from "zod";
import {
    buildLibraryDomainCondition,
    buildLibraryTextSearchConditions,
} from "@/lib/collections/search";
import { ITEM_KIND_FOLDER, SORT_DESC } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import type { Prisma } from "@/prisma/client/client";
import { LibraryItemSource } from "@/prisma/client/enums";

/**
 * Server dependencies load lazily inside functions so the client can
 * import the contract.
 */

const log = createLogger("intelligence:composer");

export const ASSISTANT_DOMAIN_FILTER_MAX_LENGTH = 120;
/** Cap for search_library domainFilters — each domain expands into many URL predicates. */
export const ASSISTANT_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX = 40;

export const ASSISTANT_SOURCE_FILTER_VALUES = [
    LibraryItemSource.cache_note,
    LibraryItemSource.chrome_bookmarks,
    LibraryItemSource.extension_clip,
    LibraryItemSource.github_starred_repositories,
    LibraryItemSource.google_photos,
    LibraryItemSource.instagram,
    LibraryItemSource.markdown_import,
    LibraryItemSource.other,
    LibraryItemSource.pinterest,
    LibraryItemSource.reddit_saved,
    LibraryItemSource.rss_feed,
    LibraryItemSource.tiktok,
    LibraryItemSource.x_bookmarks,
    LibraryItemSource.youtube_watch_later,
] as const;

const ASSISTANT_PROMPT_MAX_LENGTH = 500;
const ASSISTANT_SEARCH_TERM_MAX_LENGTH = 200;
export const ASSISTANT_VISIBLE_ITEM_LIMIT = 50;
export const ASSISTANT_VISIBLE_ITEM_LABEL_MAX_LENGTH = 120;
const ASSISTANT_COLLECTION_NAME_MAX_LENGTH = 120;
export const ASSISTANT_CONTEXT_COLLECTION_LIMIT = 200;
export const ASSISTANT_CONTEXT_DOMAIN_LIMIT = 200;
const ASSISTANT_DOMAIN_FILTER_COUNT_MAX = 200;
const ASSISTANT_SEARCH_TERM_COUNT_MAX = 50;
export const ASSISTANT_OPERATION_LIMIT = 8;
const ASSISTANT_LOCALE_MAX_LENGTH = 64;
const ASSISTANT_TIME_ZONE_MAX_LENGTH = 64;

const ASSISTANT_GROUP_BY_VALUES = [
    "none",
    "source",
    "domain",
    "collection",
    "month-added",
    "year-added",
    "month-created",
    "year-created",
] as const;

const ASSISTANT_SORT_MODE_VALUES = [
    "added-newest",
    "added-oldest",
    "created-newest",
    "created-oldest",
    "count-desc",
    "source",
    "title",
    "domain",
] as const;

const ASSISTANT_COLUMN_COUNT_VALUES = [
    "auto",
    "2",
    "3",
    "4",
    "5",
    "6",
] as const;

const ASSISTANT_COLLECTION_MEMBERSHIP_FILTER_VALUES = [
    "all",
    "in-collections",
    "not-in-collections",
] as const;

const AssistantTextSchema = z
    .string()
    .trim()
    .min(1)
    .max(ASSISTANT_SEARCH_TERM_MAX_LENGTH);

const AssistantCollectionIdSchema = z.string().trim().min(1).max(128);

const AssistantComposerStateSchema = z.strictObject({
    collectionMembershipFilter: z.enum(
        ASSISTANT_COLLECTION_MEMBERSHIP_FILTER_VALUES
    ),
    columnCountMode: z.enum(ASSISTANT_COLUMN_COUNT_VALUES),
    domainFilters: z
        .array(z.string().trim().min(1).max(ASSISTANT_DOMAIN_FILTER_MAX_LENGTH))
        .max(ASSISTANT_DOMAIN_FILTER_COUNT_MAX),
    groupBy: z.enum(ASSISTANT_GROUP_BY_VALUES),
    searchTerms: z
        .array(AssistantTextSchema)
        .max(ASSISTANT_SEARCH_TERM_COUNT_MAX),
    selectedCollectionIds: z.array(AssistantCollectionIdSchema).max(50),
    sortMode: z.enum(ASSISTANT_SORT_MODE_VALUES),
    sourceFilters: z
        .array(z.enum(ASSISTANT_SOURCE_FILTER_VALUES))
        .max(ASSISTANT_SOURCE_FILTER_VALUES.length),
});

const AssistantComposerPatchSchema = z
    .strictObject({
        collectionMembershipFilter: z
            .enum(ASSISTANT_COLLECTION_MEMBERSHIP_FILTER_VALUES)
            .optional(),
        columnCountMode: z.enum(ASSISTANT_COLUMN_COUNT_VALUES).optional(),
        domainFilters: z
            .array(
                z.string().trim().min(1).max(ASSISTANT_DOMAIN_FILTER_MAX_LENGTH)
            )
            .max(ASSISTANT_DOMAIN_FILTER_COUNT_MAX)
            .optional(),
        groupBy: z.enum(ASSISTANT_GROUP_BY_VALUES).optional(),
        reset: z.boolean().optional(),
        searchTerms: z
            .array(AssistantTextSchema)
            .max(ASSISTANT_SEARCH_TERM_COUNT_MAX)
            .optional(),
        selectedCollectionIds: z
            .array(AssistantCollectionIdSchema)
            .max(50)
            .optional(),
        sortMode: z.enum(ASSISTANT_SORT_MODE_VALUES).optional(),
        sourceFilters: z
            .array(z.enum(ASSISTANT_SOURCE_FILTER_VALUES))
            .max(ASSISTANT_SOURCE_FILTER_VALUES.length)
            .optional(),
    })
    .refine(
        (patch) => Object.values(patch).some((value) => value !== undefined),
        {
            message: "Enter at least one composer change.",
        }
    );

const AssistantAvailableCollectionSchema = z.strictObject({
    id: AssistantCollectionIdSchema,
    itemCount: z.int().min(0).max(100_000),
    name: z.string().trim().min(1).max(ASSISTANT_COLLECTION_NAME_MAX_LENGTH),
});

const AssistantAvailableDomainSchema = z.strictObject({
    domain: z.string().trim().min(1).max(ASSISTANT_DOMAIN_FILTER_MAX_LENGTH),
    itemCount: z.int().min(1).max(100_000),
});

const AssistantVisibleItemSchema = z.strictObject({
    domain: z.string().trim().min(1).max(ASSISTANT_DOMAIN_FILTER_MAX_LENGTH),
    id: AssistantCollectionIdSchema,
    label: z
        .string()
        .trim()
        .min(1)
        .max(ASSISTANT_VISIBLE_ITEM_LABEL_MAX_LENGTH),
});

const AssistantVisibleContextSchema = z.strictObject({
    availableCollections: z
        .array(AssistantAvailableCollectionSchema)
        .max(ASSISTANT_CONTEXT_COLLECTION_LIMIT),
    availableDomains: z
        .array(AssistantAvailableDomainSchema)
        .max(ASSISTANT_CONTEXT_DOMAIN_LIMIT),
    filteredItemCount: z.int().min(0).max(1_000_000),
    totalItemCount: z.int().min(0).max(1_000_000),
    visibleItems: z
        .array(AssistantVisibleItemSchema)
        .max(ASSISTANT_VISIBLE_ITEM_LIMIT),
});

const AssistantRuntimeContextSchema = z.strictObject({
    clientLocale: z
        .string()
        .trim()
        .min(1)
        .max(ASSISTANT_LOCALE_MAX_LENGTH)
        .optional(),
    clientTimeZone: z
        .string()
        .trim()
        .min(1)
        .max(ASSISTANT_TIME_ZONE_MAX_LENGTH)
        .optional(),
    surface: z.literal("library_composer"),
});

export const AssistantRequestSchema = z.strictObject({
    composerState: AssistantComposerStateSchema,
    prompt: z.string().trim().min(1).max(ASSISTANT_PROMPT_MAX_LENGTH),
    runtimeContext: AssistantRuntimeContextSchema,
    visibleContext: AssistantVisibleContextSchema,
});

const AssistantToolUpdateInputSchema = z.strictObject({
    patch: AssistantComposerPatchSchema,
    summary: z.string().trim().min(1).max(200),
});

export type AssistantComposerPatch = z.infer<
    typeof AssistantComposerPatchSchema
>;
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;
export type AssistantVisibleItem = z.infer<typeof AssistantVisibleItemSchema>;

export const AGENT_VIEW_PAGE_ITEM_LIMIT = 100;
const AGENT_VIEW_OFFSET_MAX = 10_000;
const AGENT_VIEW_TITLE_MAX_LENGTH = 120;
const AGENT_VIEW_EXPLANATION_MAX_LENGTH = 500;
export const AGENT_VIEW_TEXT_MAX_LENGTH = 200;
const AGENT_VIEW_COLLECTION_ID_MAX = 10;
const AGENT_VIEW_COLLECTION_ID_LENGTH_MAX = 128;

const AgentViewCollectionIdSchema = z
    .string()
    .trim()
    .min(1)
    .max(AGENT_VIEW_COLLECTION_ID_LENGTH_MAX);

const AgentViewQuerySchema = z.strictObject({
    collectionIds: z
        .array(AgentViewCollectionIdSchema)
        .max(AGENT_VIEW_COLLECTION_ID_MAX)
        .optional(),
    domainFilters: z
        .array(z.string().trim().min(1).max(ASSISTANT_DOMAIN_FILTER_MAX_LENGTH))
        .max(ASSISTANT_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX)
        .optional(),
    favoritedOnly: z.boolean().optional(),
    kind: z.enum(["bookmark", "note"]).optional(),
    membership: z
        .enum(ASSISTANT_COLLECTION_MEMBERSHIP_FILTER_VALUES)
        .optional(),
    sourceFilters: z
        .array(z.enum(ASSISTANT_SOURCE_FILTER_VALUES))
        .max(ASSISTANT_SOURCE_FILTER_VALUES.length)
        .optional(),
    text: z.string().trim().min(1).max(AGENT_VIEW_TEXT_MAX_LENGTH).optional(),
});

const AgentViewPageSchema = z.strictObject({
    explanation: z
        .string()
        .trim()
        .min(1)
        .max(AGENT_VIEW_EXPLANATION_MAX_LENGTH),
    itemIds: z
        .array(z.string().trim().min(1).max(128))
        .max(AGENT_VIEW_PAGE_ITEM_LIMIT),
    nextOffset: z.int().min(0).max(AGENT_VIEW_OFFSET_MAX).nullable(),
    query: AgentViewQuerySchema,
    title: z.string().trim().min(1).max(AGENT_VIEW_TITLE_MAX_LENGTH),
    truncated: z.boolean(),
});

export const AgentViewPageRequestSchema = z.strictObject({
    offset: z.int().min(0).max(AGENT_VIEW_OFFSET_MAX).optional(),
    query: AgentViewQuerySchema,
});

const DefineAgentViewToolInputSchema = z.strictObject({
    explanation: z
        .string()
        .trim()
        .min(1)
        .max(AGENT_VIEW_EXPLANATION_MAX_LENGTH),
    query: AgentViewQuerySchema,
    title: z.string().trim().min(1).max(AGENT_VIEW_TITLE_MAX_LENGTH),
});

export type AgentViewQuery = z.infer<typeof AgentViewQuerySchema>;
export type AgentViewPage = z.infer<typeof AgentViewPageSchema>;
export type AgentViewPageRequest = z.infer<typeof AgentViewPageRequestSchema>;

interface AgentViewPageResult {
    itemIds: string[];
    nextOffset: number | null;
    truncated: boolean;
}

function compileAgentViewQueryToWhere(
    userId: string,
    query: AgentViewQuery
): Prisma.LibraryItemWhereInput {
    const where: Prisma.LibraryItemWhereInput = {
        deletedAt: null,
        kind:
            query.kind === undefined
                ? { not: ITEM_KIND_FOLDER }
                : { equals: query.kind },
        userId,
    };

    const conditions: Prisma.LibraryItemWhereInput[] = [];

    if (query.favoritedOnly) {
        conditions.push({ favoritedAt: { not: null } });
    }

    if (query.collectionIds !== undefined) {
        conditions.push({
            collections: { some: { id: { in: query.collectionIds } } },
        });
    }

    if (query.membership === "in-collections") {
        conditions.push({ collections: { some: {} } });
    }

    if (query.membership === "not-in-collections") {
        conditions.push({ collections: { none: {} } });
    }

    if ((query.sourceFilters ?? []).length > 0) {
        conditions.push({ source: { in: query.sourceFilters } });
    }

    const text = query.text?.trim();
    if (text) {
        conditions.push(
            ...buildLibraryTextSearchConditions(
                text,
                ASSISTANT_SEARCH_TERM_MAX_LENGTH
            )
        );
    }

    const domainCondition = buildLibraryDomainCondition(
        query.domainFilters ?? []
    );
    if (domainCondition) {
        conditions.push(domainCondition);
    }

    if (conditions.length > 0) {
        where.AND = conditions;
    }

    return where;
}

interface ResolveAgentViewPageInput {
    offset?: number;
    query: AgentViewQuery;
    userId: string;
}

/**
 * Resolves one page of an agent view query in stable recency order with an
 * id tiebreak so offset cursors do not skip or repeat rows. Free preview
 * shares the same cap; cards render only from page-loaded items, so locked
 * ids resolve to nothing client-side. Server dependencies load lazily so
 * this module stays client-importable.
 */
export async function resolveAgentViewPage(
    input: ResolveAgentViewPageInput
): Promise<AgentViewPageResult & { previewLimited: boolean }> {
    const { userHasProAccess } = await import("@/lib/billing/service");
    const { prisma } = await import("@/prisma");

    const offset = Math.min(
        Math.max(input.offset ?? 0, 0),
        AGENT_VIEW_OFFSET_MAX
    );
    const [hasAccess, rows] = await Promise.all([
        userHasProAccess(input.userId),
        prisma.libraryItem.findMany({
            orderBy: [
                { scrapedAt: SORT_DESC },
                { updatedAt: SORT_DESC },
                { id: SORT_DESC },
            ],
            select: { id: true },
            skip: offset,
            take: AGENT_VIEW_PAGE_ITEM_LIMIT + 1,
            where: compileAgentViewQueryToWhere(input.userId, input.query),
        }),
    ]);

    const truncated = rows.length > AGENT_VIEW_PAGE_ITEM_LIMIT;
    const itemIds = rows
        .slice(0, AGENT_VIEW_PAGE_ITEM_LIMIT)
        .map((row) => row.id);

    log.debug("Resolved agent view page", {
        itemCount: itemIds.length,
        offset,
        truncated,
        userId: input.userId,
    });

    const nextOffset = offset + itemIds.length;

    return {
        itemIds,
        nextOffset:
            truncated && nextOffset <= AGENT_VIEW_OFFSET_MAX
                ? nextOffset
                : null,
        previewLimited: !hasAccess,
        truncated,
    };
}

/**
 * Each tool owns its policy; changes made during a run are recorded into
 * the run state the runner provides, so the agent can report them back.
 */
export function createComposerTools(args: {
    input: AssistantRequest;
    state: {
        operations: AssistantComposerPatch[];
        operationSummaries: string[];
        view: AgentViewPage | null;
    };
    userId: string;
}) {
    const { state } = args;

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

                const page = await resolveAgentViewPage({
                    query,
                    userId: args.userId,
                });

                state.view = {
                    explanation: toolInput.explanation,
                    itemIds: page.itemIds,
                    nextOffset: page.nextOffset,
                    query,
                    title: toolInput.title,
                    truncated: page.truncated,
                };

                return {
                    itemCount: state.view.itemIds.length,
                    ok: true,
                    previewLimited: page.previewLimited,
                    title: state.view.title,
                    truncated: state.view.truncated,
                };
            },
            inputSchema: DefineAgentViewToolInputSchema,
        }),
        update_composer: tool({
            description:
                "Apply a validated composer patch. Batch all state changes into one call. Only include fields that differ from the current composer state; noop patches are rejected. Prefer high-confidence concrete filters (domains, collections, sources, entity names) over generic category searchTerms.",
            execute: (toolInput) => {
                if (state.operations.length >= ASSISTANT_OPERATION_LIMIT) {
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

                state.operations.push(patch);
                state.operationSummaries.push(toolInput.summary);
                return {
                    appliedOperationCount: state.operations.length,
                    ok: true,
                    patch,
                    summary: toolInput.summary,
                };
            },
            inputSchema: AssistantToolUpdateInputSchema,
        }),
    };

    return tools;
}

/**
 * Maps the domains and collection ids a model asks for onto the ones the
 * visible context exposes. The model writes values in any casing and can
 * invent them, so matching is case-insensitive and unmatched entries drop.
 */
function matchAvailableDomains(
    requestedDomains: string[],
    availableDomains: Array<{ domain: string }>
): string[] {
    const domainsByLowerCase = new Map(
        availableDomains.map((entry) => [
            entry.domain.toLowerCase(),
            entry.domain,
        ])
    );
    const matchedDomains: string[] = [];
    for (const requestedDomain of requestedDomains) {
        const domain = domainsByLowerCase.get(requestedDomain.toLowerCase());
        if (domain !== undefined) {
            matchedDomains.push(domain);
        }
    }
    return matchedDomains;
}

function arraysEqual(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    const sortedLeft = left.toSorted((a, b) => a.localeCompare(b));
    const sortedRight = right.toSorted((a, b) => a.localeCompare(b));
    for (let i = 0; i < sortedLeft.length; i += 1) {
        if (sortedLeft[i] !== sortedRight[i]) {
            return false;
        }
    }
    return true;
}

function normalizeComposerPatchForContext(
    patch: AssistantComposerPatch,
    request: AssistantRequest
): AssistantComposerPatch {
    const collectionIds = new Set(
        request.visibleContext.availableCollections.map(
            (collection) => collection.id
        )
    );

    return {
        ...patch,
        ...(patch.domainFilters === undefined
            ? {}
            : {
                  domainFilters: matchAvailableDomains(
                      patch.domainFilters,
                      request.visibleContext.availableDomains
                  ),
              }),
        ...(patch.selectedCollectionIds === undefined
            ? {}
            : {
                  selectedCollectionIds: patch.selectedCollectionIds.filter(
                      (collectionId) => collectionIds.has(collectionId)
                  ),
              }),
    };
}

/**
 * Resolves mutually exclusive collection filters so a valid patch never
 * yields an empty result set. Prefer the field the model set explicitly:
 * `not-in-collections` clears selections; selecting collections resets
 * membership to `all`. Also heals latent contradictory state left by older
 * patches so a partial update (e.g. searchTerms only) does not keep zero results.
 */
function resolveComposerPatchContradictions(
    patch: AssistantComposerPatch,
    state: AssistantRequest["composerState"]
): AssistantComposerPatch {
    const resultingMembership =
        patch.collectionMembershipFilter ?? state.collectionMembershipFilter;
    const resultingSelectedCollectionIds =
        patch.selectedCollectionIds ?? state.selectedCollectionIds;

    if (
        resultingMembership !== "not-in-collections" ||
        resultingSelectedCollectionIds.length === 0
    ) {
        return patch;
    }

    if (patch.collectionMembershipFilter === "not-in-collections") {
        return { ...patch, selectedCollectionIds: [] };
    }

    if (
        patch.selectedCollectionIds !== undefined &&
        patch.selectedCollectionIds.length > 0
    ) {
        return { ...patch, collectionMembershipFilter: "all" };
    }

    return { ...patch, selectedCollectionIds: [] };
}

function isNoopComposerPatch(
    patch: AssistantComposerPatch,
    state: AssistantRequest["composerState"]
): boolean {
    if (patch.reset) {
        return false;
    }

    const checks: Array<() => boolean> = [
        () =>
            patch.collectionMembershipFilter !== undefined &&
            patch.collectionMembershipFilter !==
                state.collectionMembershipFilter,
        () =>
            patch.columnCountMode !== undefined &&
            patch.columnCountMode !== state.columnCountMode,
        () =>
            patch.domainFilters !== undefined &&
            !arraysEqual(patch.domainFilters, state.domainFilters),
        () => patch.groupBy !== undefined && patch.groupBy !== state.groupBy,
        () =>
            patch.searchTerms !== undefined &&
            !arraysEqual(patch.searchTerms, state.searchTerms),
        () => patch.sortMode !== undefined && patch.sortMode !== state.sortMode,
        () =>
            patch.sourceFilters !== undefined &&
            !arraysEqual(patch.sourceFilters, state.sourceFilters),
        () =>
            patch.selectedCollectionIds !== undefined &&
            !arraysEqual(
                patch.selectedCollectionIds,
                state.selectedCollectionIds
            ),
    ];

    return !checks.some((check) => check());
}

function normalizeAgentViewQueryForContext(
    query: AgentViewQuery,
    context: {
        availableCollections: Array<{ id: string }>;
        availableDomains: Array<{ domain: string }>;
    }
): AgentViewQuery {
    const collectionIds = new Set(
        context.availableCollections.map((collection) => collection.id)
    );

    const normalizedCollectionIds = normalizeCollectionIdsForContext(
        query.collectionIds,
        collectionIds
    );
    const normalizedDomainFilters =
        query.domainFilters === undefined
            ? undefined
            : matchAvailableDomains(
                  query.domainFilters,
                  context.availableDomains
              );
    const normalized: AgentViewQuery = {
        ...query,
        ...(query.domainFilters === undefined
            ? {}
            : { domainFilters: normalizedDomainFilters ?? [] }),
    };
    if (query.collectionIds !== undefined) {
        normalized.collectionIds = normalizedCollectionIds;
    }

    return resolveAgentViewContradictions(normalized);
}

function normalizeCollectionIdsForContext(
    collectionIds: string[] | undefined,
    allowedIds: Set<string>
): string[] | undefined {
    if (collectionIds === undefined) {
        return undefined;
    }
    if (collectionIds.length === 0) {
        return undefined;
    }
    return collectionIds.filter((id) => allowedIds.has(id));
}

function resolveAgentViewContradictions(query: AgentViewQuery): AgentViewQuery {
    if (
        query.membership !== "not-in-collections" ||
        (query.collectionIds ?? []).length === 0
    ) {
        return query;
    }
    return { ...query, collectionIds: undefined };
}
