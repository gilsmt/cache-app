import "server-only";

import type { ArcjetNextRequest } from "@arcjet/next";
import { cacheLife } from "next/cache";
import * as z from "zod";
import {
    type CollectionTemplateOption,
    TEMPLATES,
} from "@/lib/collections/templates";
import { createLogger } from "@/lib/common/logs/console/logger";
import { normalizeCollectionName } from "@/lib/common/string";
import { prisma } from "@/prisma";
import { suggestCollectionTemplates } from "./collections/suggestions";
import { generateStructured } from "./generation";
import {
    buildCollectionDescriptionPrompt,
    buildExpandedSummaryPrompt,
    buildOverviewPrompt,
    COLLECTION_DESCRIPTION_TITLE_MAX_LENGTH,
    type DescriptionRequest,
    normalizeExpandedSummary,
    normalizeSummary,
    SECTION_DESCRIPTION_EXPANDED_OUTPUT_TOKEN_LIMIT,
    SECTION_DESCRIPTION_FALLBACK_TEXT,
    truncateContextItems,
} from "./overview";
import { protectGenAiRequest } from "./protection";
import { truncateChars } from "./truncate";
import { estimateTokens } from "./usage";

const log = createLogger("intelligence:service");

const SECTION_OUTPUT_TOKEN_LIMIT = 96;
const SECTION_TIMEOUT_MS = 30_000;
const EXPANDED_SECTION_TIMEOUT_MS = 45_000;

const SectionSummaryOutputSchema = z.object({
    summary: z.string(),
});
const CollectionDescriptionOutputSchema = z.object({
    description: z.string(),
});

export interface GenerateCollectionSummaryInput {
    expanded?: boolean;
    items: DescriptionRequest["items"];
    request: ArcjetNextRequest;
    sectionTitle: string;
    userId: string;
}

export interface GenerateCollectionSummaryResult {
    summary: string;
}

export interface GenerateCollectionDescriptionInput {
    collectionTitle: string;
    request: ArcjetNextRequest;
    userId: string;
}

export interface GenerateCollectionDescriptionResult {
    description: string;
}

/**
 * Generates a short overview for a collection section, or an expanded
 * markdown overview. Normalization failure degrades to the fallback text;
 * provider and protection failures propagate as named errors.
 */
export async function generateCollectionSummary(
    input: GenerateCollectionSummaryInput
): Promise<GenerateCollectionSummaryResult> {
    const { expanded, items, sectionTitle, userId } = input;

    const truncatedRequest = truncateContextItems({
        items,
        sectionTitle,
    });
    if (truncatedRequest.items.length === 0) {
        return { summary: SECTION_DESCRIPTION_FALLBACK_TEXT };
    }

    const logContext = {
        itemCount: items.length,
        sectionTitle,
        truncatedItemCount: truncatedRequest.items.length,
        userId,
    };
    const span = log.time(
        expanded
            ? "generate-expanded-section-description"
            : "generate-section-description",
        logContext
    );

    try {
        const prompt = expanded
            ? buildExpandedSummaryPrompt(truncatedRequest)
            : buildOverviewPrompt(truncatedRequest);

        await protectGenAiRequest({
            feature: expanded
                ? "section_description_expanded"
                : "section_description",
            request: input.request,
            requestedTokens: estimateTokens(
                prompt,
                expanded
                    ? SECTION_DESCRIPTION_EXPANDED_OUTPUT_TOKEN_LIMIT
                    : SECTION_OUTPUT_TOKEN_LIMIT
            ),
            userId,
        });

        const normalized = expanded
            ? normalizeExpandedSummary(
                  await generateCachedExpandedSummary({ prompt, userId })
              )
            : normalizeSummary(await generateCachedSummary({ prompt, userId }));
        if (!normalized) {
            log.warn("Section summary normalization rejected model output", {
                ...logContext,
                feature: expanded ? "expanded" : "standard",
            });
        }

        return {
            summary: normalized ?? SECTION_DESCRIPTION_FALLBACK_TEXT,
        };
    } finally {
        span.stop();
    }
}

/**
 * Generates a one-sentence description for a collection title. Returns an
 * empty description when the title is empty or the output normalizes to null.
 */
export async function generateCollectionDescription(
    input: GenerateCollectionDescriptionInput
): Promise<GenerateCollectionDescriptionResult> {
    const collectionTitle = truncateChars(
        input.collectionTitle.trim(),
        COLLECTION_DESCRIPTION_TITLE_MAX_LENGTH
    );
    if (collectionTitle.length === 0) {
        return { description: "" };
    }

    const logContext = {
        collectionTitle,
        userId: input.userId,
    };
    const span = log.time("generate-collection-description", logContext);

    try {
        const prompt = buildCollectionDescriptionPrompt({
            title: collectionTitle,
        });

        await protectGenAiRequest({
            feature: "collection_description",
            request: input.request,
            requestedTokens: estimateTokens(prompt, SECTION_OUTPUT_TOKEN_LIMIT),
            userId: input.userId,
        });

        const normalized = normalizeSummary(
            await generateCachedDescription({ prompt, userId: input.userId })
        );

        if (!normalized) {
            log.warn(
                "Collection description normalization rejected model output",
                logContext
            );
        }

        return { description: normalized ?? "" };
    } finally {
        span.stop();
    }
}

export async function getCollectionSuggestions(args: {
    userId: string;
}): Promise<CollectionTemplateOption[]> {
    const templateNameKeys = TEMPLATES.map(
        (template) => normalizeCollectionName(template.name).nameKey
    );

    const existingCollections = await prisma.collection.findMany({
        select: {
            nameKey: true,
        },
        where: {
            nameKey: { in: templateNameKeys },
            userId: args.userId,
        },
    });

    const existingNameKeys = new Set(
        existingCollections.map((collection) => collection.nameKey)
    );

    return suggestCollectionTemplates({
        existingNameKeys,
    });
}

// ---------------------------------------------------------------------------
// Cached generation
// ---------------------------------------------------------------------------

async function generateCachedSummary(args: {
    prompt: string;
    userId: string;
}): Promise<string | undefined> {
    "use cache";
    cacheLife("minutes");
    const { prompt } = args;

    const result = await generateStructured({
        feature: "section_description",
        maxOutputTokens: SECTION_OUTPUT_TOKEN_LIMIT,
        operation: "generateSectionSummary",
        prompt,
        schema: SectionSummaryOutputSchema,
        system: "You write one-sentence UI summaries. Return plain text only, with no preamble. Never mention item counts or platform names, and avoid stock lead-ins.",
        timeoutMs: SECTION_TIMEOUT_MS,
    });
    return result.output.summary;
}

async function generateCachedExpandedSummary(args: {
    prompt: string;
    userId: string;
}): Promise<string | undefined> {
    "use cache";
    cacheLife("minutes");
    const { prompt } = args;

    const result = await generateStructured({
        feature: "section_description_expanded",
        maxOutputTokens: SECTION_DESCRIPTION_EXPANDED_OUTPUT_TOKEN_LIMIT,
        operation: "generateExpandedSectionSummary",
        prompt,
        schema: SectionSummaryOutputSchema,
        system: "You write reliable at-a-glance markdown overviews. Return a summary markdown string starting with one concise overview sentence, followed by 3-6 useful bullet takeaways when supported. No preamble, no commentary, no headings, no item counts, and no platform names.",
        timeoutMs: EXPANDED_SECTION_TIMEOUT_MS,
    });
    return result.output.summary;
}

async function generateCachedDescription(args: {
    prompt: string;
    userId: string;
}): Promise<string | undefined> {
    "use cache";
    cacheLife("minutes");
    const { prompt } = args;

    const result = await generateStructured({
        feature: "collection_description",
        maxOutputTokens: SECTION_OUTPUT_TOKEN_LIMIT,
        operation: "generateCollectionDescription",
        prompt,
        schema: CollectionDescriptionOutputSchema,
        system: "You write concise collection descriptions. Return plain text only, with no preamble. Never mention counts or platform names, and avoid stock lead-ins.",
        timeoutMs: SECTION_TIMEOUT_MS,
    });
    return result.output.description;
}
