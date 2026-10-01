import * as z from "zod";
import { LibraryItemSource } from "@/prisma/client/enums";
import type { AgentViewPage } from "./view";

export const ASK_CACHE_PROMPT_MAX_LENGTH = 500;
export const ASK_CACHE_SEARCH_TERM_MAX_LENGTH = 200;
export const ASK_CACHE_VISIBLE_ITEM_LIMIT = 50;
export const ASK_CACHE_VISIBLE_ITEM_LABEL_MAX_LENGTH = 120;
export const ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH = 120;
export const ASK_CACHE_COLLECTION_NAME_MAX_LENGTH = 120;
export const ASK_CACHE_CONTEXT_COLLECTION_LIMIT = 200;
export const ASK_CACHE_CONTEXT_DOMAIN_LIMIT = 200;
export const ASK_CACHE_DOMAIN_FILTER_COUNT_MAX = ASK_CACHE_CONTEXT_DOMAIN_LIMIT;
/** Cap for search_library domainFilters — each domain expands into many URL predicates. */
export const ASK_CACHE_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX = 40;
export const ASK_CACHE_SEARCH_TERM_COUNT_MAX = 50;
export const ASK_CACHE_OPERATION_LIMIT = 8;
export const ASK_CACHE_LOCALE_MAX_LENGTH = 64;
export const ASK_CACHE_TIME_ZONE_MAX_LENGTH = 64;

export const ASK_CACHE_SOURCE_FILTER_VALUES = [
    LibraryItemSource.cache_note,
    LibraryItemSource.chrome_bookmarks,
    LibraryItemSource.extension_clip,
    LibraryItemSource.github_starred_repositories,
    LibraryItemSource.google_photos,
    LibraryItemSource.instagram,
    LibraryItemSource.markdown_import,
    LibraryItemSource.other,
    LibraryItemSource.pinterest,
    LibraryItemSource.rss_feed,
    LibraryItemSource.tiktok,
    LibraryItemSource.x_bookmarks,
    LibraryItemSource.youtube_watch_later,
] as const;

export const ASK_CACHE_GROUP_BY_VALUES = [
    "none",
    "source",
    "domain",
    "collection",
    "month-added",
    "year-added",
    "month-created",
    "year-created",
] as const;

export const ASK_CACHE_SORT_MODE_VALUES = [
    "added-newest",
    "added-oldest",
    "created-newest",
    "created-oldest",
    "count-desc",
    "source",
    "title",
    "domain",
] as const;

export const ASK_CACHE_COLUMN_COUNT_VALUES = [
    "auto",
    "2",
    "3",
    "4",
    "5",
    "6",
] as const;

export const ASK_CACHE_COLLECTION_MEMBERSHIP_FILTER_VALUES = [
    "all",
    "in-collections",
    "not-in-collections",
] as const;

const AskCacheTextSchema = z
    .string()
    .trim()
    .min(1)
    .max(ASK_CACHE_SEARCH_TERM_MAX_LENGTH);

const AskCacheCollectionIdSchema = z.string().trim().min(1).max(128);

export const AskCacheComposerStateSchema = z.strictObject({
    collectionMembershipFilter: z.enum(
        ASK_CACHE_COLLECTION_MEMBERSHIP_FILTER_VALUES
    ),
    columnCountMode: z.enum(ASK_CACHE_COLUMN_COUNT_VALUES),
    domainFilters: z
        .array(z.string().trim().min(1).max(ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH))
        .max(ASK_CACHE_DOMAIN_FILTER_COUNT_MAX),
    groupBy: z.enum(ASK_CACHE_GROUP_BY_VALUES),
    searchTerms: z
        .array(AskCacheTextSchema)
        .max(ASK_CACHE_SEARCH_TERM_COUNT_MAX),
    selectedCollectionIds: z.array(AskCacheCollectionIdSchema).max(50),
    sortMode: z.enum(ASK_CACHE_SORT_MODE_VALUES),
    sourceFilters: z
        .array(z.enum(ASK_CACHE_SOURCE_FILTER_VALUES))
        .max(ASK_CACHE_SOURCE_FILTER_VALUES.length),
});

export const AskCacheComposerPatchSchema = z
    .strictObject({
        collectionMembershipFilter: z
            .enum(ASK_CACHE_COLLECTION_MEMBERSHIP_FILTER_VALUES)
            .optional(),
        columnCountMode: z.enum(ASK_CACHE_COLUMN_COUNT_VALUES).optional(),
        domainFilters: z
            .array(
                z.string().trim().min(1).max(ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH)
            )
            .max(ASK_CACHE_DOMAIN_FILTER_COUNT_MAX)
            .optional(),
        groupBy: z.enum(ASK_CACHE_GROUP_BY_VALUES).optional(),
        reset: z.boolean().optional(),
        searchTerms: z
            .array(AskCacheTextSchema)
            .max(ASK_CACHE_SEARCH_TERM_COUNT_MAX)
            .optional(),
        selectedCollectionIds: z
            .array(AskCacheCollectionIdSchema)
            .max(50)
            .optional(),
        sortMode: z.enum(ASK_CACHE_SORT_MODE_VALUES).optional(),
        sourceFilters: z
            .array(z.enum(ASK_CACHE_SOURCE_FILTER_VALUES))
            .max(ASK_CACHE_SOURCE_FILTER_VALUES.length)
            .optional(),
    })
    .refine(
        (patch) => Object.values(patch).some((value) => value !== undefined),
        {
            message: "Enter at least one composer change.",
        }
    );

export const AskCacheAvailableCollectionSchema = z.strictObject({
    id: AskCacheCollectionIdSchema,
    itemCount: z.int().min(0).max(100_000),
    name: z.string().trim().min(1).max(ASK_CACHE_COLLECTION_NAME_MAX_LENGTH),
});

export const AskCacheAvailableDomainSchema = z.strictObject({
    domain: z.string().trim().min(1).max(ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH),
    itemCount: z.int().min(1).max(100_000),
});

export const AskCacheVisibleItemSchema = z.strictObject({
    domain: z.string().trim().min(1).max(ASK_CACHE_DOMAIN_FILTER_MAX_LENGTH),
    id: AskCacheCollectionIdSchema,
    label: z
        .string()
        .trim()
        .min(1)
        .max(ASK_CACHE_VISIBLE_ITEM_LABEL_MAX_LENGTH),
});

export const AskCacheVisibleContextSchema = z.strictObject({
    availableCollections: z
        .array(AskCacheAvailableCollectionSchema)
        .max(ASK_CACHE_CONTEXT_COLLECTION_LIMIT),
    availableDomains: z
        .array(AskCacheAvailableDomainSchema)
        .max(ASK_CACHE_CONTEXT_DOMAIN_LIMIT),
    filteredItemCount: z.int().min(0).max(1_000_000),
    totalItemCount: z.int().min(0).max(1_000_000),
    visibleItems: z
        .array(AskCacheVisibleItemSchema)
        .max(ASK_CACHE_VISIBLE_ITEM_LIMIT),
});

export const AskCacheRuntimeContextSchema = z.strictObject({
    clientLocale: z
        .string()
        .trim()
        .min(1)
        .max(ASK_CACHE_LOCALE_MAX_LENGTH)
        .optional(),
    clientTimeZone: z
        .string()
        .trim()
        .min(1)
        .max(ASK_CACHE_TIME_ZONE_MAX_LENGTH)
        .optional(),
    surface: z.literal("library_composer"),
});

export const AskCacheRequestSchema = z.strictObject({
    composerState: AskCacheComposerStateSchema,
    prompt: z.string().trim().min(1).max(ASK_CACHE_PROMPT_MAX_LENGTH),
    runtimeContext: AskCacheRuntimeContextSchema,
    visibleContext: AskCacheVisibleContextSchema,
});

export const AskCacheToolUpdateInputSchema = z.strictObject({
    patch: AskCacheComposerPatchSchema,
    summary: z.string().trim().min(1).max(200),
});

export type AskCacheComposerPatch = z.infer<typeof AskCacheComposerPatchSchema>;
export type AskCacheComposerState = z.infer<typeof AskCacheComposerStateSchema>;
export type AskCacheRequest = z.infer<typeof AskCacheRequestSchema>;
export type AskCacheVisibleItem = z.infer<typeof AskCacheVisibleItemSchema>;
export type AskCacheRuntimeContext = z.infer<
    typeof AskCacheRuntimeContextSchema
>;

export type AskCacheResult =
    | {
          markdown: string;
          operations: AskCacheComposerPatch[];
          status: "SUCCESS";
          view?: AgentViewPage | null;
      }
    | {
          markdown?: string;
          message: string;
          status:
              | "ERROR"
              | "FORBIDDEN"
              | "INVALID"
              | "QUOTA_EXCEEDED"
              | "UNAUTHORIZED";
      };
