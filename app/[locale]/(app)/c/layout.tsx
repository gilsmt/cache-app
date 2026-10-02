import { connection } from "next/server";
import * as React from "react";
import { SidebarPanel } from "@/components/session/sidebar";
import { Threads } from "@/components/session/threads";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUserId } from "@/lib/auth/session";
import { listThreads } from "@/lib/threads/service";

export default function ThreadsLayout({ children }: React.PropsWithChildren) {
    return (
        <>
            <React.Suspense fallback={<ThreadsSidebarSkeleton />}>
                <ThreadsSidebar />
            </React.Suspense>
            {children}
        </>
    );
}

async function ThreadsSidebar() {
    await connection();

    const userId = await getSessionUserId();

    if (!userId) {
        return <SidebarPanel />;
    }

    const threads = await listThreads({ userId });

    return (
        <SidebarPanel>
            <Threads threads={threads} />
        </SidebarPanel>
    );
}

function ThreadsSidebarSkeleton() {
    return (
        <SidebarPanel>
            <div
                className="relative flex flex-col gap-0.5"
                data-sidebar-collapsible=""
            >
                <Skeleton className="h-8 w-full rounded-lg" />
                <div className="flex flex-col gap-px">
                    <Skeleton className="h-8 w-full rounded-lg" />
                    <Skeleton className="h-8 w-full rounded-lg" />
                    <Skeleton className="h-8 w-full rounded-lg" />
                </div>
            </div>
        </SidebarPanel>
    );
}
