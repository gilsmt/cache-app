import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { buildPageMetadata } from "@/app/metadata";
import { BrowserProvider } from "@/components/library/browser";
import { Collections } from "@/components/library/collections";
import { Integrations } from "@/components/library/integrations";
import { ApplicationSidebar } from "@/components/sidebar/application-sidebar";
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

    return buildPageMetadata({
        description: gt(
            "Saved items from your connected accounts and extension imports appear below by source."
        ),
        locale,
        path: "/library",
        title: gt("Library"),
    });
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
        <BrowserProvider
            connectedIntegrationCount={connectedIntegrations.size}
            initialCollections={collections}
            initialItems={items}
            key={userId}
            lockedItemCount={lockedItemCount}
            totalItemCount={totalItemCount}
        >
            <ApplicationSidebar>
                <Integrations connectedIntegrations={connectedIntegrations} />
                <Collections />
            </ApplicationSidebar>
        </BrowserProvider>
    );
}
