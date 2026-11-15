import * as z from "zod";
import { collectionNameSchema } from "@/lib/collections/utils";
import { DESCRIPTION_MAX_LENGTH } from "@/lib/common/constants";
import { sha256Hex } from "@/lib/common/security/hash";

export const ExtensionClipBodySchema = z.object({
    caption: z.string().trim().max(2000).optional(),
    collectionIds: z.array(z.string().trim().min(1)).max(100).default([]),
    url: z.string().trim().min(1),
});

export type ExtensionClipBodySchema = z.infer<typeof ExtensionClipBodySchema>;

export const extensionCreateCollectionBodySchema = z.object({
    description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
    name: collectionNameSchema,
});

export type ExtensionCreateCollectionBody = z.infer<
    typeof extensionCreateCollectionBodySchema
>;

export function extensionClipExternalId(url: string): string {
    return sha256Hex(url);
}
