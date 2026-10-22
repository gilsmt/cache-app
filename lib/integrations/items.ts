import "server-only";

import * as z from "zod";
import { ITEM_KIND_BOOKMARK, ITEM_KIND_FOLDER } from "@/lib/common/constants";
import { parseDate } from "@/lib/common/date";
import {
    type LibraryItemImportInput,
    upsertLibraryItemImports,
} from "@/lib/integrations/import";
import type { Prisma } from "@/prisma/client/client";
import type { LibraryItemSource } from "@/prisma/client/enums";

/**
 * Base Zod schema for an item saved in an external source and posted to
 * Cache (TikTok favorites, Instagram saves, etc.).
 *
 * Every provider shares this shape and composes it (or extends it) into
 * the body schema it validates, adding provider-specific refinements.
 */
export const savedItemBaseSchema = z.object({
    browserProfileId: z.string().optional(),
    caption: z.string().optional(),
    kind: z.enum([ITEM_KIND_BOOKMARK, ITEM_KIND_FOLDER]).optional(),
    parentExternalId: z.string().optional(),
    postedAt: z.string().optional(),
    scrapedAt: z.string().optional(),
    sourceDeviceId: z.string().optional(),
    sourceDeviceName: z.string().optional(),
    sourceMetadata: z.record(z.string(), z.json()).nullable().optional(),
    url: z.string(),
});

/**
 * The shape every provider item shares.
 *
 * It follows {@link savedItemBaseSchema} so the two cannot drift apart. Only
 * the metadata field differs: Prisma takes its own JSON input type.
 */
export type SavedItemInput = Omit<
    z.infer<typeof savedItemBaseSchema>,
    "sourceMetadata"
> & {
    sourceMetadata?: Prisma.InputJsonObject | null;
};

/**
 * Imports one provider batch of saved items.
 *
 * Provider services pass validated items that satisfy {@link SavedItemInput}
 * and supply the provider-specific `externalId`. This funnels the batch
 * through `upsertLibraryItemImports`.
 */
export async function importSavedItems<TItem extends SavedItemInput>(args: {
    externalId: (item: TItem) => string | undefined;
    items: TItem[];
    source: LibraryItemSource;
    userId: string;
}): Promise<{
    received: number;
    smartCollectionItemIds: string[];
    upserted: number;
}> {
    const result = await upsertLibraryItemImports({
        items: args.items.map(
            (item): LibraryItemImportInput => ({
                browserProfileId: item.browserProfileId,
                caption: item.caption,
                externalId: args.externalId(item),
                kind: item.kind,
                parentExternalId: item.parentExternalId,
                postedAt: parseDate(item.postedAt),
                scrapedAt: parseDate(item.scrapedAt),
                sourceDeviceId: item.sourceDeviceId,
                sourceDeviceName: item.sourceDeviceName,
                sourceMetadata: item.sourceMetadata,
                url: item.url,
            })
        ),
        source: args.source,
        userId: args.userId,
    });

    return {
        received: args.items.length,
        smartCollectionItemIds: result.smartCollectionItemIds,
        upserted: result.upsertedCount,
    };
}
