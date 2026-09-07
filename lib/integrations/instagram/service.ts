import "server-only";

import * as z from "zod";
import {
    extensionSavedItemBaseSchema,
    importExtensionSavedItems,
} from "@/lib/integrations/extension-ingest/service";
import { LibraryItemSource } from "@/prisma/client/enums";

export const instagramSavedItemSchema = extensionSavedItemBaseSchema
    .extend({
        shortcode: z.string().optional(),
    })
    .refine((row) => !!row.shortcode, {
        message: "Each item needs a shortcode",
    });

export const instagramSavedBodySchema = z.object({
    items: z.array(instagramSavedItemSchema),
    syncedAt: z.string().optional(),
});

export function importInstagramSaved(args: {
    items: z.infer<typeof instagramSavedItemSchema>[];
    userId: string;
}) {
    return importExtensionSavedItems({
        externalId: (item) => item.shortcode,
        items: args.items,
        source: LibraryItemSource.instagram,
        userId: args.userId,
    });
}
