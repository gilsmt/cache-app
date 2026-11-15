import "server-only";

import { escapeLikePattern, truncateText } from "@/lib/common/string";
import { prisma } from "@/prisma";
import { AutomationPayloadScope } from "@/prisma/client/enums";
import {
    AUTOMATION_ITEM_PAGE_LIMIT_DEFAULT,
    AUTOMATION_ITEM_PAGE_LIMIT_MAX,
    AUTOMATION_TEXT_PREVIEW_LENGTH_MAX,
} from "./constants";

interface AutomationRunPayloadScope {
    collectionIdSnapshot: string | null;
    payloadScopeSnapshot: AutomationPayloadScope;
    userId: string;
}

export async function getAutomationPayloadSummary(args: { runId: string }) {
    "use step";

    const run = await getAutomationRunPayloadScope(args.runId);
    if (!run) {
        return {
            itemCount: 0,
            scope: "missing",
        };
    }

    const itemCount = await prisma.libraryItem.count({
        where: getPayloadWhere(run),
    });

    return {
        itemCount,
        scope:
            run.payloadScopeSnapshot === AutomationPayloadScope.collection
                ? "collection"
                : "all_library_items",
        truncated: false,
    };
}

export async function listAutomationPayloadItems(args: {
    cursor?: string;
    limit?: number;
    runId: string;
    search?: string;
}) {
    "use step";

    const run = await getAutomationRunPayloadScope(args.runId);
    if (!run) {
        return {
            items: [],
            nextCursor: null,
            truncated: false,
        };
    }

    const limit = Math.min(
        args.limit ?? AUTOMATION_ITEM_PAGE_LIMIT_DEFAULT,
        AUTOMATION_ITEM_PAGE_LIMIT_MAX
    );
    const items = await prisma.libraryItem.findMany({
        cursor: args.cursor ? { id: args.cursor } : undefined,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
            caption: true,
            collections: {
                orderBy: {
                    name: "asc",
                },
                select: {
                    id: true,
                    name: true,
                },
            },
            createdAt: true,
            id: true,
            kind: true,
            noteContentText: true,
            postedAt: true,
            source: true,
            updatedAt: true,
            url: true,
        },
        skip: args.cursor ? 1 : 0,
        take: limit + 1,
        where: {
            ...getPayloadWhere(run),
            ...(args.search
                ? {
                      OR: [
                          {
                              caption: {
                                  contains: escapeLikePattern(args.search),
                                  mode: "insensitive",
                              },
                          },
                          {
                              noteContentText: {
                                  contains: escapeLikePattern(args.search),
                                  mode: "insensitive",
                              },
                          },
                          {
                              url: {
                                  contains: escapeLikePattern(args.search),
                                  mode: "insensitive",
                              },
                          },
                      ],
                  }
                : {}),
        },
    });

    const visibleItems = items.slice(0, limit);
    const nextCursor =
        items.length > limit ? (visibleItems.at(-1)?.id ?? null) : null;

    return {
        items: visibleItems.map((item) => ({
            caption: item.caption,
            collectionNames: item.collections.map(
                (collection) => collection.name
            ),
            createdAt: item.createdAt.toISOString(),
            id: item.id,
            kind: item.kind,
            postedAt: item.postedAt?.toISOString() ?? null,
            source: item.source,
            textPreview: item.noteContentText
                ? truncateText(
                      item.noteContentText,
                      AUTOMATION_TEXT_PREVIEW_LENGTH_MAX
                  )
                : null,
            updatedAt: item.updatedAt.toISOString(),
            url: item.url,
        })),
        nextCursor,
        truncated: !!nextCursor,
    };
}

function getPayloadWhere(run: AutomationRunPayloadScope) {
    return {
        ...(run.payloadScopeSnapshot === AutomationPayloadScope.collection
            ? {
                  collections: {
                      some: {
                          id: run.collectionIdSnapshot ?? "",
                      },
                  },
              }
            : {}),
        deletedAt: null,
        userId: run.userId,
    };
}

function getAutomationRunPayloadScope(
    runId: string
): Promise<AutomationRunPayloadScope | null> {
    return prisma.automationRun.findUnique({
        select: {
            collectionIdSnapshot: true,
            payloadScopeSnapshot: true,
            userId: true,
        },
        where: {
            id: runId,
        },
    });
}
