import "server-only";

import * as z from "zod";
import { templateDescriptionForNameKey } from "@/lib/collections/templates";
import { COLLECTION_NAME_LENGTH_MAX } from "@/lib/collections/utils";
import { unique } from "@/lib/common/array";
import { ITEM_KIND_BOOKMARK, SORT_ASC } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { normalizeCollectionName, truncateText } from "@/lib/common/string";
import { GenAiProtectionError } from "@/lib/intelligence/error";
import { generateStructured } from "@/lib/intelligence/generation";
import { protectGenAiRequest } from "@/lib/intelligence/protection";
import { isIntelligenceConfigured } from "@/lib/intelligence/providers/model-resolver";
import { prisma } from "@/prisma";
import { LibraryItemSource } from "@/prisma/client/enums";
import { estimateTokens } from "../usage";
import {
    createAttachmentForItem,
    type SmartCollectionAttachment,
    type SmartCollectionItem,
    sourceLabel,
} from "./attachments";

const log = createLogger("intelligence:smart-collections");

const SMART_COLLECTIONS_APPLY_COLLECTION_COUNT_MAX = 4;
const SMART_COLLECTIONS_NEW_COLLECTION_COUNT_MAX = 1;
const SMART_COLLECTIONS_NEW_COLLECTION_WORD_COUNT_MAX = 3;
const SMART_COLLECTIONS_OUTPUT_TOKEN_LIMIT = 256;
const SMART_COLLECTIONS_MODEL_TIMEOUT_MS = 45_000;
const DEFAULT_SUMMARIZE_JSON_MAX_LENGTH = 1500;

const COLLECTION_NAME_TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;
const COLLECTION_NAME_LETTER_PATTERN = /\p{L}/u;
const COLLECTION_NAME_PUNCTUATION_NOISE_PATTERN =
    /[()[\]{}"'`.,:;!?@#]|https?:|www\./i;

const SmartCollectionDecisionSchema = z.object({
    applyCollectionNames: z
        .array(z.string().trim().min(1))
        .max(SMART_COLLECTIONS_APPLY_COLLECTION_COUNT_MAX),
    createCollectionNames: z
        .array(z.string().trim().min(1).max(COLLECTION_NAME_LENGTH_MAX))
        .max(SMART_COLLECTIONS_NEW_COLLECTION_COUNT_MAX),
});

type SmartCollectionDecision = z.infer<typeof SmartCollectionDecisionSchema>;

interface SmartCollectionCatalogEntry {
    description: string | null;
    id: string;
    name: string;
    nameKey: string;
}

function summarizeJson(
    value: unknown,
    maxLength = DEFAULT_SUMMARIZE_JSON_MAX_LENGTH
): string {
    if (!value) {
        return "";
    }

    try {
        const serialized = JSON.stringify(value);
        if (!serialized) {
            return "";
        }
        return truncateText(serialized, maxLength);
    } catch {
        return "";
    }
}

function resolveCollectionDescription(
    collection: Pick<SmartCollectionCatalogEntry, "description" | "nameKey">
): string | null {
    return (
        collection.description ??
        templateDescriptionForNameKey(collection.nameKey) ??
        null
    );
}

function buildPrompt(
    item: SmartCollectionItem,
    collections: SmartCollectionCatalogEntry[]
): string {
    const currentCollectionNames = item.collections.map(
        (collection) => collection.name
    );
    const collectionCatalog = collections.map((collection) => {
        const description = resolveCollectionDescription(collection);
        if (description) {
            return {
                description,
                name: collection.name,
            };
        }
        return { name: collection.name };
    });
    const sourceMetadata = summarizeJson(item.sourceMetadata);

    return [
        "Classify this single saved library item into user collections.",
        "Return strict JSON only.",
        "Always return both arrays, even when they are empty.",
        "Use applyCollectionNames only for exact collection names from AVAILABLE_COLLECTIONS.",
        "When a collection includes a description, treat that description as the primary membership criteria — apply the collection only when the item clearly fits the described purpose, not merely because the name shares a keyword.",
        "Prefer existing collections that have descriptions over creating new collections for the same theme.",
        `Choose at most ${SMART_COLLECTIONS_APPLY_COLLECTION_COUNT_MAX} existing collections and at most ${SMART_COLLECTIONS_NEW_COLLECTION_COUNT_MAX} new collections.`,
        "Create a new collection only when the item has a broad, reusable topic that will likely group many future saved items.",
        `New collection names must be concise taxonomy labels of at most ${SMART_COLLECTIONS_NEW_COLLECTION_WORD_COUNT_MAX} words, such as Design Systems or Personal Finance.`,
        "Do not create collections for a single title, author, person, brand, source platform, website, format, product version, or passing mention.",
        "Apply a collection only when the item is centrally about that collection, not because of a loose keyword, brand, person, location, format, or passing mention.",
        "When uncertain, return empty arrays.",
        "Avoid vague names like Misc, Random, or Interesting.",
        "",
        `Item source: ${sourceLabel(item.source)}`,
        `Item URL: ${item.url}`,
        `Item caption: ${item.caption ?? "None"}`,
        `Already assigned collections: ${currentCollectionNames.length > 0 ? currentCollectionNames.join(", ") : "None"}`,
        sourceMetadata && `Item source metadata: ${sourceMetadata}`,
        "",
        "AVAILABLE_COLLECTIONS:",
        JSON.stringify(collectionCatalog),
    ]
        .filter(Boolean)
        .join("\n");
}

const SMART_COLLECTIONS_SYSTEM_INSTRUCTION =
    "You organize a user's saved media into focused collections. Be conservative, prefer existing collections, and create new collections only when there is a strong reusable theme. When a collection has a description, use that description as the membership criteria for what belongs in it.";

/**
 * Classifies one item against the catalog, with attachment cleanup guaranteed
 * on every path.
 */
async function decideCollectionsForItem(args: {
    attachment: SmartCollectionAttachment | null;
    item: SmartCollectionItem;
    collections: SmartCollectionCatalogEntry[];
    userId: string;
}): Promise<SmartCollectionDecision | null> {
    const { attachment, item, collections } = args;
    const promptText = buildPrompt(item, collections);
    const protectionPrompt = [promptText, attachment?.protectionText]
        .filter((segment) => segment && segment.length > 0)
        .join("\n\n");

    await protectGenAiRequest({
        feature: "smart_collections",
        request: new Request("https://cache.local/internal/smart-collections"),
        requestedTokens: estimateTokens(
            protectionPrompt,
            SMART_COLLECTIONS_OUTPUT_TOKEN_LIMIT
        ),
        userId: args.userId,
    });

    // With an attachment, try the richer variant first; metadata-only stays
    // available when provider limits reject the attachment.
    const variants: Array<{
        label: string;
        parts?: SmartCollectionAttachment["content"];
    }> = [];

    if (attachment) {
        variants.push({
            label: "with_attachment",
            parts: attachment.content,
        });
    }
    variants.push({
        label: "metadata_only",
    });

    for (const variant of variants) {
        try {
            const result = await generateStructured({
                feature: "smart_collections",
                logContext: {
                    itemId: item.id,
                    source: item.source,
                    variant: variant.label,
                },
                maxOutputTokens: SMART_COLLECTIONS_OUTPUT_TOKEN_LIMIT,
                operation: "smartCollectionsDecision",
                parts: variant.parts,
                prompt: promptText,
                schema: SmartCollectionDecisionSchema,
                system: SMART_COLLECTIONS_SYSTEM_INSTRUCTION,
                timeoutMs: SMART_COLLECTIONS_MODEL_TIMEOUT_MS,
            });
            return result.output;
        } catch {
            // Provider failures are logged per attempt by the generation
            // pipeline; protection denials propagate before this loop.
        }
    }

    return null;
}

function mergeCollections(
    current: SmartCollectionCatalogEntry[],
    nextEntries: SmartCollectionCatalogEntry[]
): SmartCollectionCatalogEntry[] {
    const byNameKey = new Map(
        current.map((collection) => [collection.nameKey, collection])
    );

    for (const collection of nextEntries) {
        byNameKey.set(collection.nameKey, collection);
    }

    return [...byNameKey.values()].toSorted((left, right) =>
        left.name.localeCompare(right.name)
    );
}

/**
 * Prompt-only enrichment: fills missing template descriptions in memory so the
 * model sees membership criteria. Does not write user collections.
 */
function withTemplateDescriptionsOnCatalog(
    collections: SmartCollectionCatalogEntry[]
): SmartCollectionCatalogEntry[] {
    return collections.map((collection) => {
        if (collection.description) {
            return collection;
        }
        const description = templateDescriptionForNameKey(collection.nameKey);
        if (!description) {
            return collection;
        }
        return { ...collection, description };
    });
}

function tokenizeCollectionName(name: string): string[] {
    return [
        ...name.toLocaleLowerCase().matchAll(COLLECTION_NAME_TOKEN_PATTERN),
    ].map((match) => match[0]);
}

function shouldCreateSmartCollection(args: {
    collectionsByNameKey: Map<string, SmartCollectionCatalogEntry>;
    name: string;
    nameKey: string;
}): boolean {
    if (args.collectionsByNameKey.has(args.nameKey)) {
        return true;
    }

    if (COLLECTION_NAME_PUNCTUATION_NOISE_PATTERN.test(args.name)) {
        return false;
    }

    const tokens = tokenizeCollectionName(args.name);
    if (
        tokens.length === 0 ||
        tokens.length > SMART_COLLECTIONS_NEW_COLLECTION_WORD_COUNT_MAX
    ) {
        return false;
    }

    if (!tokens.some((token) => COLLECTION_NAME_LETTER_PATTERN.test(token))) {
        return false;
    }

    for (const collection of args.collectionsByNameKey.values()) {
        const existingTokens = new Set(tokenizeCollectionName(collection.name));
        if (
            tokens.every((token) => existingTokens.has(token)) ||
            [...existingTokens].every((token) => tokens.includes(token))
        ) {
            return false;
        }
    }

    return true;
}

async function applyDecisionToItem(args: {
    collections: SmartCollectionCatalogEntry[];
    decision: SmartCollectionDecision;
    itemId: string;
    userId: string;
}): Promise<SmartCollectionCatalogEntry[]> {
    const collectionsByNameKey = new Map(
        args.collections.map((collection) => [collection.nameKey, collection])
    );
    const desiredCollectionIds = new Set<string>();

    const dedupMap = new Map<
        string,
        ReturnType<typeof normalizeCollectionName>
    >();
    for (const name of args.decision.createCollectionNames) {
        const normalized = normalizeCollectionName(
            name.slice(0, COLLECTION_NAME_LENGTH_MAX)
        );
        if (normalized.name.length === 0) {
            continue;
        }
        if (
            !shouldCreateSmartCollection({
                collectionsByNameKey,
                name: normalized.name,
                nameKey: normalized.nameKey,
            })
        ) {
            continue;
        }
        dedupMap.set(normalized.nameKey, normalized);
    }
    const normalizedNewCollectionNames = [...dedupMap.values()];

    for (const name of args.decision.applyCollectionNames) {
        const normalized = normalizeCollectionName(name);
        const match = collectionsByNameKey.get(normalized.nameKey);
        if (match) {
            desiredCollectionIds.add(match.id);
        }
    }

    const createdCollections = await prisma.$transaction(async (tx) => {
        const upsertedCollections: SmartCollectionCatalogEntry[] = [];

        for (const newCollection of normalizedNewCollectionNames) {
            const templateDescription = templateDescriptionForNameKey(
                newCollection.nameKey
            );
            const collection = await tx.collection.upsert({
                create: {
                    description: templateDescription,
                    name: newCollection.name,
                    nameKey: newCollection.nameKey,
                    userId: args.userId,
                },
                select: {
                    description: true,
                    id: true,
                    name: true,
                    nameKey: true,
                },
                update: {},
                where: {
                    userId_nameKey: {
                        nameKey: newCollection.nameKey,
                        userId: args.userId,
                    },
                },
            });

            desiredCollectionIds.add(collection.id);
            upsertedCollections.push(collection);
        }

        const item = await tx.libraryItem.findFirst({
            select: {
                collections: {
                    select: {
                        id: true,
                    },
                },
                id: true,
            },
            where: {
                deletedAt: null,
                id: args.itemId,
                userId: args.userId,
            },
        });

        if (!item) {
            return upsertedCollections;
        }

        const currentCollectionIds = new Set(
            item.collections.map((collection) => collection.id)
        );
        const newlyAssignedCollectionIds = [...desiredCollectionIds].filter(
            (id) => !currentCollectionIds.has(id)
        );

        if (newlyAssignedCollectionIds.length > 0) {
            const now = new Date();
            await tx.libraryItem.update({
                data: {
                    collections: {
                        set: [
                            ...currentCollectionIds,
                            ...desiredCollectionIds,
                        ].map((id) => ({ id })),
                    },
                    smartCollectedAt: now,
                },
                where: { id: item.id },
            });
            await tx.collection.updateMany({
                data: { updatedAt: now },
                where: {
                    id: { in: newlyAssignedCollectionIds },
                    userId: args.userId,
                },
            });
        }

        return upsertedCollections;
    });

    return mergeCollections(args.collections, createdCollections);
}

function isTaggableItem(item: SmartCollectionItem): boolean {
    return (
        item.kind === ITEM_KIND_BOOKMARK &&
        item.source !== LibraryItemSource.cache_note
    );
}

/**
 * Classifies the given items into the user's collections. Runs sequentially:
 * each decision can create collections that inform the next classification.
 */
export async function autoTagLibraryItemsByIds(args: {
    itemIds: string[];
    userId: string;
}): Promise<void> {
    if (!isIntelligenceConfigured()) {
        return;
    }

    const validItemIds = unique(
        args.itemIds.filter((itemId) => itemId.trim().length > 0)
    );
    if (validItemIds.length === 0) {
        return;
    }

    const [items, initialCollections, user] = await Promise.all([
        prisma.libraryItem.findMany({
            orderBy: {
                createdAt: SORT_ASC,
            },
            select: {
                caption: true,
                collections: {
                    orderBy: {
                        name: SORT_ASC,
                    },
                    select: {
                        id: true,
                        name: true,
                    },
                },
                id: true,
                kind: true,
                source: true,
                sourceMetadata: true,
                url: true,
            },
            where: {
                deletedAt: null,
                id: {
                    in: validItemIds,
                },
                userId: args.userId,
            },
        }),
        prisma.collection.findMany({
            orderBy: {
                name: SORT_ASC,
            },
            select: {
                description: true,
                id: true,
                name: true,
                nameKey: true,
            },
            where: {
                userId: args.userId,
            },
        }),
        prisma.user.findUnique({
            select: { smartCollectionsEnabled: true },
            where: { id: args.userId },
        }),
    ]);

    if (!user?.smartCollectionsEnabled) {
        log.debug("Smart collections skipped: preference is off", {
            itemCount: validItemIds.length,
            userId: args.userId,
        });
        return;
    }

    if (items.length === 0) {
        return;
    }

    let collections = withTemplateDescriptionsOnCatalog(initialCollections);
    const itemsById = new Map(items.map((item) => [item.id, item]));

    for (const itemId of validItemIds) {
        const item = itemsById.get(itemId);
        if (!(item && isTaggableItem(item))) {
            continue;
        }

        let decision: SmartCollectionDecision | null;
        const attachment = await createAttachmentForItem(item);
        try {
            decision = await decideCollectionsForItem({
                attachment,
                collections,
                item,
                userId: args.userId,
            });
        } catch (error) {
            if (GenAiProtectionError.isInstance(error)) {
                log.warn("Smart collections request denied", {
                    itemId: item.id,
                    reason: error.data.reason,
                    userId: args.userId,
                });
                break;
            }
            throw error;
        } finally {
            await attachment?.cleanup?.();
        }

        if (!decision) {
            continue;
        }

        collections = await applyDecisionToItem({
            collections,
            decision,
            itemId: item.id,
            userId: args.userId,
        });
    }
}
