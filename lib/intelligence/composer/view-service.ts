import "server-only";

import { userHasActiveSubscription } from "@/lib/billing/service";
import { SORT_DESC } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { prisma } from "@/prisma";
import {
    AGENT_VIEW_OFFSET_MAX,
    AGENT_VIEW_PAGE_ITEM_LIMIT,
    type AgentViewPageResult,
    type AgentViewQuery,
    compileAgentViewQueryToWhere,
} from "./view";

const log = createLogger("intelligence:agent-view");

interface ResolveAgentViewPageInput {
    offset?: number;
    query: AgentViewQuery;
    userId: string;
}

interface ResolveAgentViewPageResult extends AgentViewPageResult {
    previewLimited: boolean;
}

/**
 * Resolves one page of an agent view query in stable recency order with an
 * id tiebreak so offset cursors do not skip or repeat rows. Free preview
 * shares the same cap; cards render only from page-loaded items, so locked
 * ids resolve to nothing client-side.
 */
export async function resolveAgentViewPage(
    input: ResolveAgentViewPageInput
): Promise<ResolveAgentViewPageResult> {
    const offset = Math.min(
        Math.max(input.offset ?? 0, 0),
        AGENT_VIEW_OFFSET_MAX
    );
    const [hasAccess, rows] = await Promise.all([
        userHasActiveSubscription(input.userId),
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
