import { T } from "gt-next";
import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import * as React from "react";
import { buildPageMetadata } from "@/app/metadata";
import { RecentlyDeletedList } from "@/components/recently-deleted/list";
import { ApplicationSidebar } from "@/components/sidebar/application-sidebar";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "@/lib/auth/session";
import { listRecentlyDeletedItems } from "@/lib/collections/service";

const RECENTLY_DELETED_SKELETON_KEYS = [
    "rd0",
    "rd1",
    "rd2",
    "rd3",
    "rd4",
] as const;

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
                "Items you remove from your library live here for 30 days before being deleted forever."
            ),
            locale,
            path: "/recently-deleted",
            title: gt("Recently deleted"),
        }),
        robots: {
            follow: false,
            index: false,
        },
    };
}

export default function RecentlyDeletedPage() {
    return (
        <>
            <ApplicationSidebar />
            <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col gap-6 p-8">
                <React.Suspense fallback={<RecentlyDeletedPageSkeleton />}>
                    <RecentlyDeletedPageBody />
                </React.Suspense>
            </div>
        </>
    );
}

function RecentlyDeletedPageHeader() {
    return (
        <header className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1.5">
                <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                    <T>Recently deleted</T>
                </h1>
                <p className="text-muted-foreground text-sm">
                    <T>
                        Restored items go back to your library with their
                        collections and previews intact. Items left here are
                        deleted forever after 30 days.
                    </T>
                </p>
            </div>
        </header>
    );
}

async function RecentlyDeletedPageBody() {
    await connection();

    const session = await getServerSession();
    const userId = session?.user?.id;

    if (!userId) {
        return redirect("/");
    }

    const items = await listRecentlyDeletedItems({ userId });

    return (
        <FadeIn>
            <div className="flex flex-col gap-8">
                <RecentlyDeletedPageHeader />
                <RecentlyDeletedList
                    itemDaysRemainingById={Object.fromEntries(
                        items.map((entry) => [
                            entry.item.id,
                            entry.daysRemaining,
                        ])
                    )}
                    items={items.map((entry) => entry.item)}
                />
            </div>
        </FadeIn>
    );
}

function RecentlyDeletedPageSkeleton() {
    return (
        <>
            <RecentlyDeletedPageHeader />
            <div
                aria-busy="true"
                aria-label="Loading recently deleted items"
                className="flex flex-col gap-3"
                role="status"
            >
                {RECENTLY_DELETED_SKELETON_KEYS.map((key) => (
                    <div
                        className="flex items-center gap-4 rounded-2xl bg-muted/60 p-4"
                        key={key}
                    >
                        <Skeleton className="size-12 shrink-0 rounded-lg" />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-3 w-1/3" />
                        </div>
                        <Skeleton className="h-8 w-20 shrink-0 rounded-xl" />
                    </div>
                ))}
            </div>
        </>
    );
}
