import * as z from "zod";
import { LibraryItemSource } from "@/prisma/client/enums";
import type { AgentViewPage } from "./view";

export const ASSISTANT_PROMPT_MAX_LENGTH = 500;
export const ASSISTANT_SEARCH_TERM_MAX_LENGTH = 200;
export const ASSISTANT_VISIBLE_ITEM_LIMIT = 50;
export const ASSISTANT_VISIBLE_ITEM_LABEL_MAX_LENGTH = 120;
export const ASSISTANT_DOMAIN_FILTER_MAX_LENGTH = 120;
export const ASSISTANT_COLLECTION_NAME_MAX_LENGTH = 120;
export const ASSISTANT_CONTEXT_COLLECTION_LIMIT = 200;
export const ASSISTANT_CONTEXT_DOMAIN_LIMIT = 200;
export const ASSISTANT_DOMAIN_FILTER_COUNT_MAX = ASSISTANT_CONTEXT_DOMAIN_LIMIT;
/** Cap for search_library domainFilters — each domain expands into many URL predicates. */
export const ASSISTANT_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX = 40;
export const ASSISTANT_SEARCH_TERM_COUNT_MAX = 50;
export const ASSISTANT_OPERATION_LIMIT = 8;
export const ASSISTANT_LOCALE_MAX_LENGTH = 64;
export const ASSISTANT_TIME_ZONE_MAX_LENGTH = 64;

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

export const ASSISTANT_GROUP_BY_VALUES = [
    "none",
    "source",
    "domain",
    "collection",
    "month-added",
    "year-added",
    "month-created",
    "year-created",
] as const;

export const ASSISTANT_SORT_MODE_VALUES = [
    "added-newest",
    "added-oldest",
    "created-newest",
    "created-oldest",
    "count-desc",
    "source",
    "title",
    "domain",
] as const;

export const ASSISTANT_COLUMN_COUNT_VALUES = [
    "auto",
    "2",
    "3",
    "4",
    "5",
    "6",
] as const;

export const ASSISTANT_COLLECTION_MEMBERSHIP_FILTER_VALUES = [
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

export const AssistantComposerStateSchema = z.strictObject({
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

export const AssistantComposerPatchSchema = z
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

export const AssistantAvailableCollectionSchema = z.strictObject({
    id: AssistantCollectionIdSchema,
    itemCount: z.int().min(0).max(100_000),
    name: z.string().trim().min(1).max(ASSISTANT_COLLECTION_NAME_MAX_LENGTH),
});

export const AssistantAvailableDomainSchema = z.strictObject({
    domain: z.string().trim().min(1).max(ASSISTANT_DOMAIN_FILTER_MAX_LENGTH),
    itemCount: z.int().min(1).max(100_000),
});

export const AssistantVisibleItemSchema = z.strictObject({
    domain: z.string().trim().min(1).max(ASSISTANT_DOMAIN_FILTER_MAX_LENGTH),
    id: AssistantCollectionIdSchema,
    label: z
        .string()
        .trim()
        .min(1)
        .max(ASSISTANT_VISIBLE_ITEM_LABEL_MAX_LENGTH),
});

export const AssistantVisibleContextSchema = z.strictObject({
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

export const AssistantRuntimeContextSchema = z.strictObject({
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

export const AssistantToolUpdateInputSchema = z.strictObject({
    patch: AssistantComposerPatchSchema,
    summary: z.string().trim().min(1).max(200),
});

export type AssistantComposerPatch = z.infer<
    typeof AssistantComposerPatchSchema
>;
export type AssistantComposerState = z.infer<
    typeof AssistantComposerStateSchema
>;
export type AssistantRequest = z.infer<typeof AssistantRequestSchema>;
export type AssistantVisibleItem = z.infer<typeof AssistantVisibleItemSchema>;
export type AssistantRuntimeContext = z.infer<
    typeof AssistantRuntimeContextSchema
>;

export type AssistantResult =
    | {
          markdown: string;
          operations: AssistantComposerPatch[];
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
