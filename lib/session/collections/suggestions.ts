import "server-only";

import {
    type CollectionTemplateOption,
    TEMPLATES,
} from "@/lib/collections/templates";
import { normalizeCollectionName } from "@/lib/common/string";
import { prisma } from "@/prisma";

const MAX_SUGGESTIONS = 1;

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

    return TEMPLATES.filter(
        (template) =>
            !existingNameKeys.has(
                normalizeCollectionName(template.name).nameKey
            )
    ).slice(0, MAX_SUGGESTIONS);
}
