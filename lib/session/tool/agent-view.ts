import "server-only";

import {
    buildLibraryDomainCondition,
    buildLibraryTextSearchConditions,
} from "@/lib/collections/search";
import { ITEM_KIND_FOLDER, SORT_DESC } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import type { Prisma } from "@/prisma/client/client";
import {
    AGENT_VIEW_OFFSET_MAX,
    AGENT_VIEW_PAGE_ITEM_LIMIT,
    AGENT_VIEW_TEXT_MAX_LENGTH,
    type AgentViewQuery,
} from "./composer";

const log = createLogger("intelligence:composer");

interface AgentViewPageResult {
    itemIds: string[];
    nextOffset: number | null;
    truncated: boolean;
}

interface ResolveAgentViewPageInput {
    offset?: number;
    query: AgentViewQuery;
    userId: string;
}

/**
 * Resolves one page in stable recency order with an id tiebreak so offset
 * cursors do not skip or repeat rows. Free preview shares the same cap; cards
 * render only from page-loaded items, so locked ids resolve to nothing client-side.
 * Billing and database modules load only when a page is requested.
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
                AGENT_VIEW_TEXT_MAX_LENGTH
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
