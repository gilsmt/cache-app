import "server-only";

import * as z from "zod";
import {
    extensionSavedItemBaseSchema,
    importExtensionSavedItems,
} from "@/lib/integrations/extension-ingest/service";
import { LibraryItemSource } from "@/prisma/client/enums";

export const tiktokSavedItemSchema = extensionSavedItemBaseSchema
    .extend({
        id: z.string().optional(),
    })
    .refine((row) => !!row.id, {
        message: "Each item needs an id",
    });

export const tiktokSavedBodySchema = z.object({
    items: z.array(tiktokSavedItemSchema),
    syncedAt: z.string().optional(),
});

export function importTiktokSaved(args: {
    items: z.infer<typeof tiktokSavedItemSchema>[];
    userId: string;
}) {
    return importExtensionSavedItems({
        externalId: (item) => item.id,
        items: args.items,
        source: LibraryItemSource.tiktok,
        userId: args.userId,
    });
}
