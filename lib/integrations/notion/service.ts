import "server-only";

import {
    LIBRARY_ITEM_COLLECTIONS_INCLUDE,
    toLibraryItemWithCollections,
} from "@/lib/collections/utils";
import { createLogger } from "@/lib/common/logs/console/logger";
import { IntegrationUserError } from "@/lib/integrations/error";
import { createNotionMarkdownPage } from "@/lib/integrations/notion/api";
import {
    buildNotionCollectionMarkdown,
    buildNotionNoteMarkdown,
} from "@/lib/integrations/notion/markdown";
import { convertNoteHtmlToMarkdown, extractNoteText } from "@/lib/notes/utils";
import { prisma } from "@/prisma";

const log = createLogger("integrations:notion");

export interface NotionSendResult {
    pageUrl: string;
}

export async function sendNoteToNotion(args: {
    accessToken: string;
    contentHtml: string;
    title: string;
    userId: string;
}): Promise<NotionSendResult> {
    const text = extractNoteText(args.contentHtml);
    if (text.length === 0) {
        throw new IntegrationUserError({
            integrationId: "notion",
            message: "Write something before sending this note to Notion.",
            operation: "sendNoteToNotion",
            resource: "note",
        });
    }

    const document = buildNotionNoteMarkdown({
        contentMarkdown: convertNoteHtmlToMarkdown(args.contentHtml),
        title: args.title,
    });
    const span = log.time("send-note", { userId: args.userId });

    try {
        return await createNotionMarkdownPage({
            accessToken: args.accessToken,
            markdown: document.markdown,
            title: document.title,
        });
    } finally {
        span.stop();
    }
}

export async function sendCollectionToNotion(args: {
    accessToken: string;
    collectionId: string;
    userId: string;
}): Promise<NotionSendResult> {
    const collection = await prisma.collection.findFirst({
        select: {
            description: true,
            items: {
                include: LIBRARY_ITEM_COLLECTIONS_INCLUDE,
                orderBy: {
                    createdAt: "desc",
                },
            },
            name: true,
        },
        where: {
            id: args.collectionId,
            userId: args.userId,
        },
    });

    if (!collection) {
        throw new IntegrationUserError({
            integrationId: "notion",
            message: "This collection no longer exists.",
            operation: "sendCollectionToNotion",
            resource: "collection",
        });
    }

    const document = buildNotionCollectionMarkdown({
        description: collection.description,
        items: collection.items.map(toLibraryItemWithCollections),
        name: collection.name,
    });

    if (!document) {
        throw new IntegrationUserError({
            integrationId: "notion",
            message: "There are no sendable items in this collection yet.",
            operation: "sendCollectionToNotion",
            resource: "collection_items",
        });
    }

    const span = log.time("send-collection", {
        collectionId: args.collectionId,
        userId: args.userId,
    });

    try {
        return await createNotionMarkdownPage({
            accessToken: args.accessToken,
            markdown: document.markdown,
            title: document.title,
        });
    } finally {
        span.stop();
    }
}
