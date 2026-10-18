import { tool } from "ai";
import * as z from "zod";
import {
    buildLibraryDomainCondition,
    buildLibraryTextSearchConditions,
} from "@/lib/collections/search";
import { LIBRARY_ITEM_COLLECTIONS_INCLUDE } from "@/lib/collections/utils";
import { ITEM_KIND_FOLDER, SORT_DESC } from "@/lib/common/constants";
import { truncateText } from "@/lib/common/string";
import { parseDisplayUrl } from "@/lib/common/url";
import type { Prisma } from "@/prisma/client/client";
import {
    ASSISTANT_DOMAIN_FILTER_MAX_LENGTH,
    ASSISTANT_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX,
    ASSISTANT_SOURCE_FILTER_VALUES,
} from "./composer";

const ASSISTANT_LIBRARY_SEARCH_LIMIT_MAX = 50;
const ASSISTANT_LIBRARY_SEARCH_OFFSET_MAX = 10_000;
const ASSISTANT_LIBRARY_TEXT_PREVIEW_LENGTH_MAX = 1000;

const SEARCH_LIBRARY_DESCRIPTION =
    "Search the user's saved Cache library. Query words are AND-matched across caption, note text, and URL within each item. Prefer concrete names, brands, domains, domainFilters, sourceFilters, or collectionIds over broad category labels. When truncated is true, continue with nextOffset while it is not null; if it is null, explain that the offset limit was reached and the result is partial.";

const AssistantLibrarySearchInputSchema = z.strictObject({
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

/**
 * The library search tool shared by every agent surface that can inspect the
 * user's saved items. The database client loads lazily so workflow
 * definitions can import this module without server-only code.
 */
export function createLibrarySearchTool(args: { userId: string }) {
    return tool({
        description: SEARCH_LIBRARY_DESCRIPTION,
        execute: (toolInput) =>
            searchAssistantLibrary({
                input: toolInput,
                userId: args.userId,
            }),
        inputSchema: AssistantLibrarySearchInputSchema,
    });
}

async function searchAssistantLibrary(args: {
    input: z.infer<typeof AssistantLibrarySearchInputSchema>;
    userId: string;
}) {
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
                ? truncateText(
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
