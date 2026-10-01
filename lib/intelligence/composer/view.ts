import * as z from "zod";
import type { LibraryItemWithCollections } from "@/lib/collections/utils";
import { ITEM_KIND_FOLDER } from "@/lib/common/constants";
import type { Prisma } from "@/prisma/client/client";
import {
    buildLibraryDomainCondition,
    buildLibraryTextSearchConditions,
} from "../search";
import {
    ASK_CACHE_COLLECTION_MEMBERSHIP_FILTER_VALUES,
    ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH,
    ASK_CACHE_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX,
    ASK_CACHE_SEARCH_TERM_MAX_LENGTH,
    ASK_CACHE_SOURCE_FILTER_VALUES,
} from "./ask-cache";

export const AGENT_VIEW_PAGE_ITEM_LIMIT = 100;
export const AGENT_VIEW_OFFSET_MAX = 10_000;
export const AGENT_VIEW_TITLE_MAX_LENGTH = 120;
export const AGENT_VIEW_EXPLANATION_MAX_LENGTH = 500;
export const AGENT_VIEW_TEXT_MAX_LENGTH = 200;
export const AGENT_VIEW_COLLECTION_ID_MAX = 10;
export const AGENT_VIEW_COLLECTION_ID_LENGTH_MAX = 128;

const AgentViewCollectionIdSchema = z
    .string()
    .trim()
    .min(1)
    .max(AGENT_VIEW_COLLECTION_ID_LENGTH_MAX);

export const AgentViewQuerySchema = z.strictObject({
    collectionIds: z
        .array(AgentViewCollectionIdSchema)
        .max(AGENT_VIEW_COLLECTION_ID_MAX)
        .optional(),
    domainFilters: z
        .array(z.string().trim().min(1).max(ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH))
        .max(ASK_CACHE_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX)
        .optional(),
    favoritedOnly: z.boolean().optional(),
    kind: z.enum(["bookmark", "note"]).optional(),
    membership: z
        .enum(ASK_CACHE_COLLECTION_MEMBERSHIP_FILTER_VALUES)
        .optional(),
    sourceFilters: z
        .array(z.enum(ASK_CACHE_SOURCE_FILTER_VALUES))
        .max(ASK_CACHE_SOURCE_FILTER_VALUES.length)
        .optional(),
    text: z.string().trim().min(1).max(AGENT_VIEW_TEXT_MAX_LENGTH).optional(),
});

export const AgentViewPageSchema = z.strictObject({
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
export type DefineAgentViewToolInput = z.infer<
    typeof DefineAgentViewToolInputSchema
>;

export interface AgentViewPageResult {
    itemIds: string[];
    nextOffset: number | null;
    truncated: boolean;
}

interface AgentViewVisibleContext {
    availableCollections: Array<{ id: string }>;
    availableDomains: Array<{ domain: string }>;
}

export function normalizeAgentViewQueryForContext(
    query: AgentViewQuery,
    context: AgentViewVisibleContext
): AgentViewQuery {
    const collectionIds = new Set(
        context.availableCollections.map((collection) => collection.id)
    );
    const domainsByLowerCase = new Map(
        context.availableDomains.map((entry) => [
            entry.domain.toLowerCase(),
            entry.domain,
        ])
    );

    const normalizedCollectionIds = normalizeCollectionIdsForContext(
        query.collectionIds,
        collectionIds
    );
    const normalizedDomainFilters =
        query.domainFilters === undefined
            ? undefined
            : query.domainFilters
                  .map((domain) => domainsByLowerCase.get(domain.toLowerCase()))
                  .filter((domain): domain is string => domain !== undefined);
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

export function compileAgentViewQueryToWhere(
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
                ASK_CACHE_SEARCH_TERM_MAX_LENGTH
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

export function resolveAgentViewItems(
    items: LibraryItemWithCollections[],
    itemIds: string[]
): LibraryItemWithCollections[] {
    const byId = new Map(items.map((item) => [item.id, item] as const));
    const resolved: LibraryItemWithCollections[] = [];
    for (const id of itemIds) {
        const item = byId.get(id);
        if (item) {
            resolved.push(item);
        }
    }
    return resolved;
}

export function appendAgentViewPageIds(
    existingIds: string[],
    pageIds: string[]
): string[] {
    if (pageIds.length === 0) {
        return existingIds;
    }
    const seen = new Set(existingIds);
    const next = [...existingIds];
    for (const id of pageIds) {
        if (!seen.has(id)) {
            seen.add(id);
            next.push(id);
        }
    }
    return next.length === existingIds.length ? existingIds : next;
}

export function filterItemsToAgentView(
    items: LibraryItemWithCollections[],
    agentView: AgentViewPage | null
): LibraryItemWithCollections[] {
    if (!agentView) {
        return items;
    }
    const ids = new Set(agentView.itemIds);
    return items.filter((item) => ids.has(item.id));
}
