import "server-only";

import { randomUUID } from "node:crypto";
import {
    LIBRARY_ITEM_COLLECTIONS_INCLUDE,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { FALLBACK_URL, ITEM_KIND_NOTE } from "@/lib/common/constants";
import { DEFAULT_BROWSER_PROFILE_ID } from "@/lib/integrations/browser-profiles";
import { IntegrationUserError } from "@/lib/integrations/error";
import {
    escapeNoteHtmlText,
    extractNoteText,
    isNoteSerializedEditorState,
    type NoteSerializedEditorState,
    sanitizeNoteHtml,
    serializeNoteEditorStateToHtml,
} from "@/lib/integrations/notes/utils";
import { prisma } from "@/prisma";
import { LibraryItemSource } from "@/prisma/client/enums";
import {
    DbNull,
    type InputJsonValue,
} from "@/prisma/client/internal/prismaNamespace";

export interface NormalizedNotePayload {
    contentHtml: string;
    contentState: NoteSerializedEditorState | null;
    contentText: string;
}

export function normalizeNotePayload(input: {
    contentHtml?: string;
    contentState?: unknown;
}): NormalizedNotePayload {
    const contentState = isNoteSerializedEditorState(input.contentState)
        ? structuredClone(input.contentState)
        : null;
    const contentHtml = contentState
        ? serializeNoteEditorStateToHtml(contentState)
        : sanitizeNoteHtml(input.contentHtml ?? "");
    const contentText = extractNoteText(contentHtml);

    return {
        contentHtml,
        contentState,
        contentText,
    };
}

// Lexical's persistence path is toJSON → JSON.stringify. Round-trip here so
// the Prisma Json column only ever sees pure JSON (client input is only
// shallow-guarded). The cast is Prisma's index-signature gap, not a trust claim.
function noteContentStateForPrisma(
    contentState: NoteSerializedEditorState | null
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

export function createNoteFromPlainText(
    userId: string,
    plainText: string
): Promise<LibraryItemWithCollections> {
    return createNote(
        userId,
        normalizeNotePayload({
            contentHtml: `<p>${escapeNoteHtmlText(plainText)}</p>`,
        })
    );
}

export async function createNote(
    userId: string,
    note: NormalizedNotePayload
): Promise<LibraryItemWithCollections> {
    const created = await prisma.libraryItem.create({
        data: {
            browserProfileId: DEFAULT_BROWSER_PROFILE_ID,
            caption: null,
            externalId: `note_${randomUUID()}`,
            kind: ITEM_KIND_NOTE,
            noteContentHtml: note.contentHtml,
            noteContentState: noteContentStateForPrisma(note.contentState),
            noteContentText: note.contentText,
            source: LibraryItemSource.cache_note,
            url: FALLBACK_URL,
            userId,
        },
    });

    const item = await getNoteItemForUser(userId, created.id);
    if (!item) {
        throw new IntegrationUserError({
            message: "We created the note but couldn't load it back.",
            operation: "createNote",
            resource: "note",
        });
    }

    return item;
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
