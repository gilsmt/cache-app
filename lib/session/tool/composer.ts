import * as z from "zod";
import { LibraryItemSource } from "@/prisma/client/enums";
import {
    DEFAULT_COLLECTION_MEMBERSHIP_FILTER,
    DEFAULT_COLUMN_COUNT_MODE,
    DEFAULT_GROUP_BY_MODE,
    DEFAULT_SORT_MODE,
} from "../composer/defaults";

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
});

export const AssistantRequestSchema = z.strictObject({
    composerState: AssistantComposerStateSchema,
    prompt: z.string().trim().min(1).max(ASSISTANT_PROMPT_MAX_LENGTH),
    runtimeContext: AssistantRuntimeContextSchema,
    visibleContext: AssistantVisibleContextSchema,
});

export const AssistantToolUpdateInputSchema = z.strictObject({
    patch: AssistantComposerPatchSchema,
    summary: z.string().trim().min(1).max(200),
});

export type AssistantComposerPatch = z.infer<
    typeof AssistantComposerPatchSchema
>;
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;
export type AssistantVisibleItem = z.infer<typeof AssistantVisibleItemSchema>;

export const DEFAULT_ASSISTANT_COMPOSER_STATE = {
    collectionMembershipFilter: DEFAULT_COLLECTION_MEMBERSHIP_FILTER,
    columnCountMode: DEFAULT_COLUMN_COUNT_MODE,
    domainFilters: [],
    groupBy: DEFAULT_GROUP_BY_MODE,
    searchTerms: [],
    selectedCollectionIds: [],
    sortMode: DEFAULT_SORT_MODE,
    sourceFilters: [],
} satisfies AssistantRequest["composerState"];

export const AGENT_VIEW_PAGE_ITEM_LIMIT = 100;
export const AGENT_VIEW_OFFSET_MAX = 10_000;
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

export const DefineAgentViewToolInputSchema = z.strictObject({
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

export interface NormalizedAgentViewQuery {
    matchesNoItems: boolean;
    query: AgentViewQuery;
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

export function normalizeComposerPatchForContext(
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
export function resolveComposerPatchContradictions(
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

export function isNoopComposerPatch(
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

export function normalizeAgentViewQueryForContext(
    query: AgentViewQuery,
    context: {
        availableCollections: Array<{ id: string }>;
        availableDomains: Array<{ domain: string }>;
    }
): NormalizedAgentViewQuery {
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

    return {
        matchesNoItems:
            (query.domainFilters?.length ?? 0) > 0 &&
            (normalizedDomainFilters?.length ?? 0) === 0,
        query: resolveAgentViewContradictions(normalized),
    };
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
