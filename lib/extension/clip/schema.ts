import { createHash } from "node:crypto";
import * as z from "zod";
import { collectionNameSchema } from "@/lib/collections/utils";
import { DESCRIPTION_MAX_LENGTH } from "@/lib/common/constants";

export const extensionClipBodySchema = z.object({
    caption: z.string().trim().max(2000).optional(),
    collectionIds: z.array(z.string().trim().min(1)).max(100).default([]),
    url: z.string().trim().min(1),
});

export type ExtensionClipBody = z.infer<typeof extensionClipBodySchema>;

export const extensionCreateCollectionBodySchema = z.object({
    description: z.string().trim().max(DESCRIPTION_MAX_LENGTH).optional(),
    name: collectionNameSchema,
});

export type ExtensionCreateCollectionBody = z.infer<
    typeof extensionCreateCollectionBodySchema
>;

export function extensionClipExternalId(canonicalUrl: string): string {
    return createHash("sha256").update(canonicalUrl).digest("hex");
}
