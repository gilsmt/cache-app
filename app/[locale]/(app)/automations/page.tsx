import { T } from "gt-next";
import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import * as React from "react";
import { buildPageMetadata } from "@/app/metadata";
import { AutomationChats } from "@/components/automations/chats";
import { AutomationComposerDialog } from "@/components/automations/composer";
import { AutomationsList } from "@/components/automations/list";
import { SidebarNavigation } from "@/components/sidebar/navigation";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "@/lib/auth/session";
import { listCollections } from "@/lib/collections/service";
import { listAutomations } from "@/lib/intelligence/automations/service";

const AUTOMATION_SKELETON_KEYS = ["a0", "a1", "a2"] as const;

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
                "Manage lightweight automations that organize and summarize your saved content."
            ),
            locale,
            path: "/automations",
            title: gt("Automations"),
        }),
        robots: {
            follow: false,
            index: false,
        },
    };
}

export default function AutomationsPage() {
    return (
        <React.Suspense fallback={<AutomationsPageSkeleton />}>
            <AutomationsPageBody />
        </React.Suspense>
    );
}

function AutomationsPageHeader({ children }: { children: React.ReactNode }) {
    return (
        <header className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1.5">
                <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                    <T>Automations</T>
                </h1>
                <p className="text-muted-foreground text-sm">
                    <T>
                        Schedule tasks that organize your library, research
                        topics, summarize and much more — all on autopilot
                    </T>
                </p>
            </div>
            {children}
        </header>
    );
}

async function AutomationsPageBody() {
    await connection();

    const session = await getServerSession();
    const userId = session?.user?.id;

    if (!userId) {
        return redirect("/");
    }

    const [automations, collections] = await Promise.all([
        listAutomations({ userId }),
        listCollections({ userId }),
    ]);

    const collectionOptions = collections.map((collection) => ({
        id: collection.id,
        name: collection.name,
    }));

    return (
        <>
            <SidebarNavigation>
                <AutomationChats automations={automations} />
            </SidebarNavigation>
            <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col gap-6 p-8">
                <FadeIn>
                    <div className="flex flex-col gap-8">
                        <AutomationsPageHeader>
                            <AutomationComposerDialog
                                collections={collectionOptions}
                            />
                        </AutomationsPageHeader>
                        <AutomationsList
                            automations={automations}
                            collections={collectionOptions}
                        />
                    </div>
                </FadeIn>
            </div>
        </>
    );
}

function AutomationsPageSkeleton() {
    return (
        <>
            <SidebarNavigation>
                <div
                    className="relative flex flex-col gap-0.5"
                    data-sidebar-collapsible=""
                >
                    <Skeleton className="h-8 w-full rounded-lg" />
                    <div className="flex flex-col gap-px">
                        {AUTOMATION_SKELETON_KEYS.map((key) => (
                            <Skeleton
                                className="h-8 w-full rounded-lg"
                                key={key}
                            />
                        ))}
                    </div>
                </div>
            </SidebarNavigation>
            <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col gap-6 p-8">
                <AutomationsPageHeader>
                    <Skeleton className="h-8 w-36 rounded-xl" />
                </AutomationsPageHeader>
                <div
                    aria-busy="true"
                    aria-label="Loading automations"
                    className="flex flex-col gap-8"
                    role="status"
                >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {AUTOMATION_SKELETON_KEYS.map((key) => (
                            <div
                                className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4"
                                key={key}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <Skeleton className="size-9 rounded-xl" />
                                    <Skeleton className="size-7 rounded-full" />
                                </div>
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-full" />
                                <Skeleton className="h-3 w-2/3" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
