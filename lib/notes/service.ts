import "server-only";

import { randomUUID } from "node:crypto";
import type { SerializedEditorState } from "lexical";
import {
    connectNewItemCollections,
    findCollectionSummariesOwnedByIds,
} from "@/lib/collections/service";
import {
    LIBRARY_ITEM_COLLECTIONS_INCLUDE,
    type LibraryCollectionSummary,
    type LibraryItemWithCollections,
    toIdConnections,
} from "@/lib/collections/utils";
import {
    DEFAULT_BROWSER_PROFILE_ID,
    FALLBACK_URL,
    ITEM_KIND_NOTE,
} from "@/lib/common/constants";
import { IntegrationUserError } from "@/lib/integrations/error";
import { prisma } from "@/prisma";
import { LibraryItemSource } from "@/prisma/client/enums";
import {
    DbNull,
    type InputJsonValue,
} from "@/prisma/client/internal/prismaNamespace";
import {
    escapeNoteHtmlText,
    extractNoteText,
    isSerializedEditorState,
    sanitizeNoteHtml,
    serializeEditorStateToHtml,
} from "./utils";

export interface NormalizedNotePayload {
    contentHtml: string;
    contentState: SerializedEditorState | null;
    contentText: string;
}

export function normalizeNotePayload(input: {
    contentHtml?: string;
    contentState?: unknown;
}): NormalizedNotePayload {
    const contentState = isSerializedEditorState(input.contentState)
        ? structuredClone(input.contentState)
        : null;
    const contentHtml = contentState
        ? serializeEditorStateToHtml(contentState)
        : sanitizeNoteHtml(input.contentHtml ?? "");
    const contentText = extractNoteText(contentHtml);

    return {
        contentHtml,
        contentState,
        contentText,
    };
}

function noteContentStateForPrisma(
    contentState: SerializedEditorState | null
): InputJsonValue | typeof DbNull {
    return contentState === null
        ? DbNull
        : (JSON.parse(JSON.stringify(contentState)) as InputJsonValue);
}

export function getNoteItemForUser(
    userId: string,
    itemId: string
): Promise<LibraryItemWithCollections | null> {
    return prisma.libraryItem.findFirst({
        include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
        where: {
            deletedAt: null,
            id: itemId,
            kind: ITEM_KIND_NOTE,
            userId,
        },
    });
}

export function normalizePlainTextNote(value: string): NormalizedNotePayload {
    return normalizeNotePayload({
        contentHtml: `<p>${escapeNoteHtmlText(value)}</p>`,
    });
}

export async function createNoteFromPlainText(
    userId: string,
    value: string,
    externalId?: string
): Promise<LibraryItemWithCollections> {
    const result = await createNote(
        userId,
        normalizePlainTextNote(value),
        [],
        externalId
    );
    return result.item;
}

export async function createNote(
    userId: string,
    note: NormalizedNotePayload,
    collectionIds: readonly string[] = [],
    externalId?: string
): Promise<{
    collectionSummaries: LibraryCollectionSummary[];
    item: LibraryItemWithCollections;
}> {
    // Creation and collection membership commit together, so the note and
    // its collections always agree.
    const { collectionSummaries, itemId } = await prisma.$transaction(
        async (tx) => {
            const membership = await connectNewItemCollections(tx, {
                collectionIds,
                userId,
            });

            const noteExternalId = externalId ?? `note_${randomUUID()}`;
            const createData = {
                browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
                caption: null,
                collections:
                    membership.collectionIds.length > 0
                        ? {
                              connect: toIdConnections(
                                  membership.collectionIds
                              ),
                          }
                        : undefined,
                externalId: noteExternalId,
                kind: ITEM_KIND_NOTE,
                noteContentHtml: note.contentHtml,
                noteContentState: noteContentStateForPrisma(note.contentState),
                noteContentText: note.contentText,
                source: LibraryItemSource.cache_note,
                url: FALLBACK_URL,
                userId,
            };
            // An empty update returns the first row unchanged when an MCP retry
            // reuses its external identity.
            const created =
                externalId === undefined
                    ? await tx.libraryItem.create({
                          data: createData,
                          select: { id: true },
                      })
                    : await tx.libraryItem.upsert({
                          create: createData,
                          select: { id: true },
                          update: {},
                          where: {
                              userId_source_browserProfileId_externalId: {
                                  browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
                                  externalId: noteExternalId,
                                  source: LibraryItemSource.cache_note,
                                  userId,
                              },
                          },
                      });

            // A summary counts the items in its collection, so it is read
            // after the note joined them.
            return {
                collectionSummaries: await findCollectionSummariesOwnedByIds(
                    tx,
                    {
                        collectionIds: membership.collectionIds,
                        userId,
                    }
                ),
                itemId: created.id,
            };
        }
    );

    const item = await getNoteItemForUser(userId, itemId);
    if (!item) {
        throw new IntegrationUserError({
            message: "We created the note but couldn't load it back.",
            operation: "createNote",
            resource: "note",
        });
    }

    return { collectionSummaries, item };
}

export async function updateNote(
    userId: string,
    itemId: string,
    note: NormalizedNotePayload
): Promise<LibraryItemWithCollections> {
    const updated = await prisma.libraryItem.updateMany({
        data: {
            caption: null,
            noteContentHtml: note.contentHtml,
            noteContentState: noteContentStateForPrisma(note.contentState),
            noteContentText: note.contentText,
        },
        where: {
            deletedAt: null,
            id: itemId,
            kind: ITEM_KIND_NOTE,
            userId,
        },
    });

    if (updated.count === 0) {
        throw new IntegrationUserError({
            message: "This note no longer exists.",
            operation: "updateNote",
            resource: "note",
        });
    }

    const item = await getNoteItemForUser(userId, itemId);
    if (!item) {
        throw new IntegrationUserError({
            message: "We couldn't reload this note after saving it.",
            operation: "updateNote",
            resource: "note",
        });
    }

    return item;
}
