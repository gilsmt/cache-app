import "server-only";

import * as z from "zod";
import type {
    ITEM_KIND_BOOKMARK,
    ITEM_KIND_FOLDER,
} from "@/lib/common/constants";
import { parseDate } from "@/lib/common/date";
import {
    isExtensionIngestTokenRevoked,
    mintExtensionIngestToken,
    verifyExtensionIngestToken,
} from "@/lib/integrations/extension-ingest/auth";
import { upsertLibraryItemImports } from "@/lib/integrations/import";
import { prisma } from "@/prisma";
import type { Prisma } from "@/prisma/client/client";
import type { LibraryItemSource } from "@/prisma/client/enums";

/**
 * Base Zod schema for an item posted by a browser extension ingest payload
 * (TikTok favorites, Instagram saves, YouTube Watch Later, etc.).
 *
 * Lives in the service layer because every per-provider ingest reuses the
 * same shape and refinement rules. Route adapters compose it (or extend
 * it) into the body schema they validate against.
 */
export const extensionSavedItemBaseSchema = z.object({
    browserProfileId: z.string().optional(),
    caption: z.string().optional(),
    kind: z.enum(["bookmark", "folder"]).optional(),
    parentExternalId: z.string().optional(),
    postedAt: z.string().optional(),
    scrapedAt: z.string().optional(),
    sourceDeviceId: z.string().optional(),
    sourceDeviceName: z.string().optional(),
    sourceMetadata: z.record(z.string(), z.json()).nullable().optional(),
    url: z.string(),
});

export interface IngestItemInput {
    browserProfileId?: string;
    caption?: string;
    externalId?: string;
    kind?: typeof ITEM_KIND_BOOKMARK | typeof ITEM_KIND_FOLDER;
    parentExternalId?: string;
    postedAt?: string;
    scrapedAt?: string;
    sourceDeviceId?: string;
    sourceDeviceName?: string;
    sourceMetadata?: Prisma.InputJsonObject | null;
    url: string;
}

/**
 * Upserts library rows for one ingest payload (chunk or complete).
 */
export async function upsertLibraryItemsFromIngest(
    userId: string,
    source: LibraryItemSource,
    items: IngestItemInput[]
): Promise<{
    smartCollectionItemIds: string[];
    upsertedCount: number;
}> {
    const result = await upsertLibraryItemImports({
        items: items.map((item) => ({
            browserProfileId: item.browserProfileId,
            caption: item.caption,
            externalId: item.externalId,
            kind: item.kind,
            parentExternalId: item.parentExternalId,
            postedAt: parseDate(item.postedAt),
            scrapedAt: parseDate(item.scrapedAt),
            sourceDeviceId: item.sourceDeviceId,
            sourceDeviceName: item.sourceDeviceName,
            sourceMetadata: item.sourceMetadata,
            url: item.url,
        })),
        source,
        userId,
    });

    return {
        smartCollectionItemIds: result.smartCollectionItemIds,
        upsertedCount: result.upsertedCount,
    };
}

/**
 * Generic ingest pipeline shared by the per-provider extension services.
 * Each provider maps its item shape to {@link IngestItemInput} (typically
 * via the provider-specific `externalId`), then funnels the batch through
 * {@link upsertLibraryItemsFromIngest}.
 */
export async function importExtensionSavedItems<
    TItem extends IngestItemInput,
>(args: {
    externalId: (item: TItem) => string | undefined;
    items: TItem[];
    source: LibraryItemSource;
    userId: string;
}): Promise<{
    received: number;
    smartCollectionItemIds: string[];
    upserted: number;
}> {
    const result = await upsertLibraryItemsFromIngest(
        args.userId,
        args.source,
        args.items.map((item) => ({
            ...item,
            externalId: args.externalId(item),
        }))
    );

    return {
        received: args.items.length,
        smartCollectionItemIds: result.smartCollectionItemIds,
        upserted: result.upsertedCount,
    };
}

/**
 * Resolves the Cache user id for a given extension ingest Bearer token.
 *
 * The token carries its own claims, so resolution verifies the signature and
 * then applies the user's revocation cut-off. No stored value takes part, so a
 * read of the user table yields no working credential.
 *
 * Returns `null` when the token is invalid or no fallback is configured.
 */
export async function resolveExtensionIngestUserId(
    bearerToken: string
): Promise<string | null> {
    const verified = verifyExtensionIngestToken(bearerToken);
    if (verified) {
        const user = await prisma.user.findUnique({
            select: { ingestTokenMinIssuedAt: true },
            where: { id: verified.userId },
        });
        if (
            user &&
            !isExtensionIngestTokenRevoked(
                verified.issuedAt,
                user.ingestTokenMinIssuedAt
            )
        ) {
            return verified.userId;
        }
    }

    return resolveFallbackExtensionIngestUserId(bearerToken);
}

async function resolveFallbackExtensionIngestUserId(
    bearerToken: string
): Promise<string | null> {
    const envToken = process.env.INSTAGRAM_SAVED_INGEST_TOKEN?.trim();
    if (!envToken || bearerToken !== envToken) {
        return null;
    }

    const fallbackUserId = process.env.EXTENSION_FALLBACK_USER_ID;
    if (!fallbackUserId) {
        return null;
    }

    const user = await prisma.user.findUnique({
        select: { id: true },
        where: { id: fallbackUserId },
    });
    return user?.id ?? null;
}

/**
 * Revokes every extension ingest token minted for the user so far by moving
 * their cut-off to now, then mints the replacement. Tokens minted after the
 * cut-off stay valid, so the caller can hand the replacement to the client it
 * re-links.
 */
export async function rotateExtensionIngestToken(args: {
    userId: string;
}): Promise<string> {
    await prisma.user.update({
        data: { ingestTokenMinIssuedAt: new Date() },
        where: { id: args.userId },
    });

    // Mint after the cut-off, or the replacement would revoke itself.
    return mintExtensionIngestToken(args.userId);
}
