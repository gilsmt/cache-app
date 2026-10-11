import "server-only";

import { nanoid } from "nanoid";
import * as z from "zod";
import type {
    ITEM_KIND_BOOKMARK,
    ITEM_KIND_FOLDER,
} from "@/lib/common/constants";
import { parseDate } from "@/lib/common/date";
import { upsertLibraryItemImports } from "@/lib/integrations/import";
import { prisma } from "@/prisma";
import type { Prisma } from "@/prisma/client/client";
import type { LibraryItemSource } from "@/prisma/client/enums";

const EXTENSION_INGEST_TOKEN_LENGTH = 48;

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
 * The token is opaque to the route layer — the route only knows that the
 * Authorization header is well-formed. Mapping the token onto a user (and
 * handling the dev/CI fallback) is a domain operation against the
 * database, so it lives in the service.
 *
 * Returns `null` when the token is invalid or no fallback is configured.
 */
export async function resolveExtensionIngestUserId(
    bearerToken: string
): Promise<string | null> {
    const byToken = await prisma.user.findFirst({
        select: { id: true },
        where: { extensionIngestToken: bearerToken },
    });
    if (byToken) {
        return byToken.id;
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
 * Returns the user's existing extension ingest token, generating and
 * persisting a new one when none exists.
 */
export async function getOrCreateExtensionIngestToken(args: {
    userId: string;
}): Promise<string> {
    const existing = await prisma.user.findUnique({
        select: { extensionIngestToken: true },
        where: { id: args.userId },
    });

    if (existing?.extensionIngestToken) {
        return existing.extensionIngestToken;
    }

    const token = createExtensionIngestToken();
    const { count } = await prisma.user.updateMany({
        data: { extensionIngestToken: token },
        where: {
            extensionIngestToken: null,
            id: args.userId,
        },
    });

    if (count > 0) {
        return token;
    }

    const user = await prisma.user.findUniqueOrThrow({
        select: { extensionIngestToken: true },
        where: { id: args.userId },
    });

    if (!user.extensionIngestToken) {
        throw new Error("Failed to persist extension ingest token");
    }

    return user.extensionIngestToken;
}

/**
 * Generates a fresh extension ingest token and overwrites the existing one.
 */
export async function rotateExtensionIngestToken(args: {
    userId: string;
}): Promise<string> {
    const token = createExtensionIngestToken();
    await prisma.user.update({
        data: { extensionIngestToken: token },
        where: { id: args.userId },
    });

    return token;
}

function createExtensionIngestToken(): string {
    return nanoid(EXTENSION_INGEST_TOKEN_LENGTH);
}
