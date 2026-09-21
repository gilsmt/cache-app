import "server-only";

import type { LibraryItemWithCollections } from "@/lib/collections/utils";
import {
    LIBRARY_ITEM_COLLECTIONS_INCLUDE,
    toLibraryItemWithCollections,
} from "@/lib/collections/utils";
import { ITEM_KIND_NOTE, SORT_DESC } from "@/lib/common/constants";
import { prisma } from "@/prisma";
import { CommentError } from "./error";
import { COMMENT_TEXT_MAX_LENGTH, normalizeCommentText } from "./utils";

const COMMENTS_LIST_LIMIT_MAX = 200;

export interface ItemCommentWithItem {
    contentText: string;
    createdAt: Date;
    id: string;
    item: LibraryItemWithCollections;
    updatedAt: Date;
}

/**
 * Read the single comment attached to an item. Returns null when the item has
 * no comment or the row does not belong to the user.
 */
export async function getCommentForItem({
    itemId,
    userId,
}: {
    itemId: string;
    userId: string;
}): Promise<{ contentText: string } | null> {
    const comment = await prisma.comment.findUnique({
        where: { libraryItemId: itemId },
    });

    if (!comment || comment.userId !== userId) {
        return null;
    }

    return { contentText: comment.contentText };
}

/**
 * List the calling user's item comments with their owning items, newest
 * first. Only comments on active (non-deleted) items are returned.
 */
export async function listCommentsForUser({
    limit,
    userId,
}: {
    limit?: number;
    userId: string;
}): Promise<ItemCommentWithItem[]> {
    const take = Math.max(
        1,
        Math.min(limit ?? COMMENTS_LIST_LIMIT_MAX, COMMENTS_LIST_LIMIT_MAX)
    );

    const rows = await prisma.comment.findMany({
        include: {
            libraryItem: {
                include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
            },
        },
        orderBy: [{ updatedAt: SORT_DESC }, { id: SORT_DESC }],
        take,
        where: {
            libraryItem: { deletedAt: null, userId },
            userId,
        },
    });

    return rows.map((row) => ({
        contentText: row.contentText,
        createdAt: row.createdAt,
        id: row.id,
        item: toLibraryItemWithCollections(row.libraryItem),
        updatedAt: row.updatedAt,
    }));
}

/**
 * Create, update, or delete the single comment on an item. Empty (or
 * whitespace-only) drafts delete the row so "no comment" has one legal state.
 * Notes cannot carry comments.
 */
export async function saveCommentForItem({
    contentText,
    itemId,
    userId,
}: {
    contentText: string;
    itemId: string;
    userId: string;
}): Promise<void> {
    const normalized = normalizeCommentText(contentText);

    if (normalized !== null && normalized.length > COMMENT_TEXT_MAX_LENGTH) {
        throw new CommentError({
            code: "too_long",
            message: `Comments must be ${COMMENT_TEXT_MAX_LENGTH} characters or fewer.`,
            operation: "saveCommentForItem",
        });
    }

    await prisma.$transaction(async (tx) => {
        const item = await tx.libraryItem.findFirst({
            select: { kind: true },
            where: { deletedAt: null, id: itemId, userId },
        });

        if (!item) {
            throw new CommentError({
                code: "not_found",
                message: "We couldn't find that saved item.",
                operation: "saveCommentForItem",
            });
        }

        if (item.kind === ITEM_KIND_NOTE) {
            throw new CommentError({
                code: "invalid_kind",
                message: "Comments are not available for notes.",
                operation: "saveCommentForItem",
            });
        }

        if (normalized === null) {
            await tx.comment.deleteMany({
                where: { libraryItemId: itemId, userId },
            });
            return;
        }

        await tx.comment.upsert({
            create: {
                contentText: normalized,
                libraryItemId: itemId,
                userId,
            },
            update: { contentText: normalized },
            where: { libraryItemId: itemId },
        });
    });
}
