import "server-only";

import { nanoid } from "nanoid";
import { prisma } from "@/prisma";

const EXTENSION_INGEST_TOKEN_LENGTH = 48;

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
