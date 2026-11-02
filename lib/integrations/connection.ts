import "server-only";

import { prisma } from "@/prisma";
import { listIntegrationAccountProviderIds } from "./registry";

interface IntegrationConnectionState {
    hasRssFeeds: boolean;
    linkedProviderIds: string[];
}

/**
 * Reads the records that own a connection.
 *
 * A linked provider account proves an OAuth grant, and an `RssFeed` row proves
 * a subscription. Imported Markdown is represented by its library items.
 */
export async function loadIntegrationConnectionState(args: {
    userId: string;
}): Promise<IntegrationConnectionState> {
    const [linkedAccounts, rssFeed] = await Promise.all([
        prisma.account.findMany({
            distinct: ["providerId"],
            orderBy: { providerId: "asc" },
            select: { providerId: true },
            where: {
                providerId: { in: listIntegrationAccountProviderIds() },
                userId: args.userId,
            },
        }),
        prisma.rssFeed.findFirst({
            select: { id: true },
            where: { userId: args.userId },
        }),
    ]);

    return {
        hasRssFeeds: rssFeed !== null,
        linkedProviderIds: linkedAccounts.map((account) => account.providerId),
    };
}
