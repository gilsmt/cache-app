export const SMART_COLLECTIONS_APPLY_COLLECTION_COUNT_MAX = 4;
export const SMART_COLLECTIONS_NEW_COLLECTION_COUNT_MAX = 1;
export const SMART_COLLECTIONS_NEW_COLLECTION_WORD_COUNT_MAX = 3;

export const SMART_COLLECTIONS_SYSTEM_INSTRUCTION =
    "You organize a user's saved media into focused collections. Be conservative, prefer existing collections, and create new collections only when there is a strong reusable theme. When a collection has a description, use that description as the membership criteria for what belongs in it.";

interface SmartCollectionPromptCatalogEntry {
    description?: string | null;
    name: string;
}

export function buildSmartCollectionPrompt(args: {
    caption: string | null;
    collectionCatalog: SmartCollectionPromptCatalogEntry[];
    currentCollectionNames: string[];
    sourceLabel: string;
    sourceMetadata: unknown;
    url: string;
}): string {
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
        `Item source: ${args.sourceLabel}`,
        `Item URL: ${args.url}`,
        `Item caption: ${args.caption ?? "None"}`,
        `Already assigned collections: ${args.currentCollectionNames.length > 0 ? args.currentCollectionNames.join(", ") : "None"}`,
        args.sourceMetadata && `Item source metadata: ${args.sourceMetadata}`,
        "",
        "AVAILABLE_COLLECTIONS:",
        JSON.stringify(args.collectionCatalog),
    ]
        .filter(Boolean)
        .join("\n");
}
