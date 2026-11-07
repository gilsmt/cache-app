import { T } from "gt-next";
import { connection } from "next/server";
import * as React from "react";
import { SidebarPanel } from "@/components/session/sidebar";
import { Threads } from "@/components/session/threads";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUserId } from "@/lib/auth/session";
import { listThreads } from "@/lib/threads/service";

export default function ThreadsLayout({ children }: React.PropsWithChildren) {
    return (
        <>
            <SidebarPanel>
                <ErrorBoundary title={<T>Could not load conversations</T>}>
                    <React.Suspense fallback={<ThreadsSidebarSkeleton />}>
                        <ThreadsSidebar />
                    </React.Suspense>
                </ErrorBoundary>
            </SidebarPanel>
            {children}
        </>
    );
}

async function ThreadsSidebar() {
    await connection();

    const userId = await getSessionUserId();

    if (!userId) {
        return null;
    }

    const threads = await listThreads({ userId });

    return <Threads threads={threads} />;
}

function ThreadsSidebarSkeleton() {
    return (
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
    );
}
