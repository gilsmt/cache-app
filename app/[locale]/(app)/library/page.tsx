import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { buildPageMetadata } from "@/app/metadata";
import { Integrations } from "@/components/integrations/list";
import {
    Collections,
    CollectionsProvider,
} from "@/components/session/collections";
import { DimensionCacheProvider } from "@/components/session/dimension-cache";
import { ItemsStateProvider } from "@/components/session/items";
import { BrowserContent } from "@/components/session/list";
import { SidebarNavigation } from "@/components/sidebar/navigation";
import { getServerSession } from "@/lib/auth/session";
import { userHasActiveSubscription } from "@/lib/billing/service";
import { getLibrary, listCollections } from "@/lib/collections/service";
import { listLinkedIntegrationAccounts } from "@/lib/integrations/account";
import {
    type IntegrationId,
    listConnectedIntegrationIds,
} from "@/lib/integrations/support";

export const instant = false;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const gt = await getGT();

    return {
        ...buildPageMetadata({
            description: gt(
                "Saved items from your connected accounts and extension imports appear below by source."
            ),
            locale,
            path: "/library",
            title: gt("Library"),
        }),
        robots: {
            follow: false,
            index: false,
        },
    };
}

export default async function LibraryPage() {
    await connection();

    const session = await getServerSession();
    const userId = session?.user?.id;

    if (!userId) {
        return redirect("/");
    }

    const [
        { itemSources, items, lockedItemCount, totalItemCount },
        collections,
        linkedAccounts,
    ] = await Promise.all([
        userHasActiveSubscription(userId).then((hasAccess) =>
            getLibrary({ hasAccess, userId })
        ),
        listCollections({ userId }),
        listLinkedIntegrationAccounts({ userId }),
    ]);

    const integrationConnectionContext = {
        libraryItemSources: itemSources.map((item) => item.source),
        linkedProviderIds: linkedAccounts.map((account) => account.providerId),
    };

    const connectedIntegrations: Set<IntegrationId> = new Set([
        ...listConnectedIntegrationIds("source", integrationConnectionContext),
        ...listConnectedIntegrationIds(
            "destination",
            integrationConnectionContext
        ),
    ]);

    return (
        <DimensionCacheProvider>
            <ItemsStateProvider initialItems={items} key={userId}>
                <CollectionsProvider initialCollections={collections}>
                    <BrowserContent
                        connectedIntegrationCount={connectedIntegrations.size}
                        lockedItemCount={lockedItemCount}
                        totalItemCount={totalItemCount}
                    >
                        <SidebarNavigation>
                            <Integrations
                                connectedIntegrations={connectedIntegrations}
                            />
                            <Collections />
                        </SidebarNavigation>
                    </BrowserContent>
                </CollectionsProvider>
            </ItemsStateProvider>
        </DimensionCacheProvider>
    );
}
