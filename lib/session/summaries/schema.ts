import * as z from "zod";
import { LibraryItemSource } from "@/prisma/client/enums";

export const OVERVIEW_CONTEXT_ITEMS_LIMIT = 20;
export const OVERVIEW_TEXT_MAX_LENGTH = 180;
export const OVERVIEW_URL_MAX_LENGTH = 240;
export const OVERVIEW_DOMAIN_MAX_LENGTH = 80;
export const OVERVIEW_TITLE_MAX_LENGTH = 140;
export const COLLECTION_DESCRIPTION_TITLE_MAX_LENGTH = 120;

const OverviewContextItemSchema = z.object({
    addedAt: z.iso.datetime().optional(),
    createdAt: z.iso.datetime().optional(),
    domain: z.string().trim().max(OVERVIEW_DOMAIN_MAX_LENGTH).optional(),
    kind: z.enum(["bookmark", "note"]),
    noteExcerpt: z.string().trim().max(OVERVIEW_TEXT_MAX_LENGTH).optional(),
    primaryText: z.string().trim().min(1).max(OVERVIEW_TEXT_MAX_LENGTH),
    source: z.enum(LibraryItemSource),
    title: z.string().trim().min(1).max(OVERVIEW_TITLE_MAX_LENGTH),
    url: z.string().trim().max(OVERVIEW_URL_MAX_LENGTH).optional(),
});

export const OverviewRequestSchema = z.object({
    expanded: z.boolean().optional(),
    items: z
        .array(OverviewContextItemSchema)
        .min(1)
        .max(OVERVIEW_CONTEXT_ITEMS_LIMIT),
    sectionTitle: z.string().trim().min(1).max(120),
});

export const CollectionDescriptionRequestSchema = z.object({
    title: z
        .string()
        .trim()
        .min(1)
        .max(COLLECTION_DESCRIPTION_TITLE_MAX_LENGTH),
});

export type OverviewContextItem = z.infer<typeof OverviewContextItemSchema>;

export type OverviewRequest = z.infer<typeof OverviewRequestSchema>;

export type CollectionDescriptionRequest = z.infer<
    typeof CollectionDescriptionRequestSchema
>;
