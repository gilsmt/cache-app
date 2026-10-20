import * as z from "zod";
import { LibraryItemSource } from "@/prisma/client/enums";

export const SECTION_DESCRIPTION_CONTEXT_ITEMS_LIMIT = 20;
export const SECTION_DESCRIPTION_TEXT_MAX_LENGTH = 180;
export const SECTION_DESCRIPTION_URL_MAX_LENGTH = 240;
export const SECTION_DESCRIPTION_DOMAIN_MAX_LENGTH = 80;
export const SECTION_DESCRIPTION_TITLE_MAX_LENGTH = 140;
export const COLLECTION_DESCRIPTION_TITLE_MAX_LENGTH = 120;

const SectionDescriptionContextItemSchema = z.object({
    addedAt: z.iso.datetime().optional(),
    createdAt: z.iso.datetime().optional(),
    domain: z
        .string()
        .trim()
        .max(SECTION_DESCRIPTION_DOMAIN_MAX_LENGTH)
        .optional(),
    kind: z.enum(["bookmark", "note"]),
    noteExcerpt: z
        .string()
        .trim()
        .max(SECTION_DESCRIPTION_TEXT_MAX_LENGTH)
        .optional(),
    primaryText: z
        .string()
        .trim()
        .min(1)
        .max(SECTION_DESCRIPTION_TEXT_MAX_LENGTH),
    source: z.enum(LibraryItemSource),
    title: z.string().trim().min(1).max(SECTION_DESCRIPTION_TITLE_MAX_LENGTH),
    url: z.string().trim().max(SECTION_DESCRIPTION_URL_MAX_LENGTH).optional(),
});

export const SectionDescriptionRequestSchema = z.object({
    expanded: z.boolean().optional(),
    items: z
        .array(SectionDescriptionContextItemSchema)
        .min(1)
        .max(SECTION_DESCRIPTION_CONTEXT_ITEMS_LIMIT),
    sectionTitle: z.string().trim().min(1).max(120),
});

export const CollectionDescriptionRequestSchema = z.object({
    title: z
        .string()
        .trim()
        .min(1)
        .max(COLLECTION_DESCRIPTION_TITLE_MAX_LENGTH),
});

export type SectionDescriptionContextItem = z.infer<
    typeof SectionDescriptionContextItemSchema
>;

export type DescriptionRequest = z.infer<
    typeof SectionDescriptionRequestSchema
>;

export type CollectionDescriptionRequest = z.infer<
    typeof CollectionDescriptionRequestSchema
>;
