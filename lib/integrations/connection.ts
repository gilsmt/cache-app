import "server-only";

import { prisma } from "@/prisma";
import { listIntegrationAccountProviderIds } from "./registry";

export interface IntegrationConnectionState {
    hasMarkdownImports: boolean;
    hasRssFeeds: boolean;
    linkedProviderIds: string[];
}

/**
 * Reads the records that own a connection.
 *
 * A linked provider account proves an OAuth grant, an `RssFeed` row proves
 * a subscription, and a `MarkdownImport` row proves an import namespace.
 * Imported items are not consulted: they are the result of a connection,
 * not the connection itself.
 */
export async function loadIntegrationConnectionState(args: {
    userId: string;
}): Promise<IntegrationConnectionState> {
    const [linkedAccounts, markdownImport, rssFeed] = await Promise.all([
        prisma.account.findMany({
            distinct: ["providerId"],
            orderBy: { providerId: "asc" },
            select: { providerId: true },
            where: {
                providerId: { in: listIntegrationAccountProviderIds() },
                userId: args.userId,
            },
        }),
        prisma.markdownImport.findFirst({
            select: { id: true },
            where: { userId: args.userId },
        }),
        prisma.rssFeed.findFirst({
            select: { id: true },
            where: { userId: args.userId },
        }),
    ]);

    return {
        hasMarkdownImports: markdownImport !== null,
        hasRssFeeds: rssFeed !== null,
        linkedProviderIds: linkedAccounts.map((account) => account.providerId),
    };
}
