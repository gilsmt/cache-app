import { connection } from "next/server";
import * as React from "react";
import { ChatsList } from "@/components/chats/list";
import { SidebarPanel } from "@/components/session/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "@/lib/auth/session";
import { listChats } from "@/lib/chats/service";

export default function ChatsLayout({ children }: React.PropsWithChildren) {
    return (
        <>
            <React.Suspense fallback={<ChatsSidebarSkeleton />}>
                <ChatsSidebar />
            </React.Suspense>
            {children}
        </>
    );
}

async function ChatsSidebar() {
    await connection();

    const session = await getServerSession();
    const userId = session?.user?.id;

    if (!userId) {
        return <SidebarPanel />;
    }

    const chats = await listChats({ userId });
    const nowMs = Date.now();

    return (
        <SidebarPanel>
            <ChatsList chats={chats} nowMs={nowMs} />
        </SidebarPanel>
    );
}

function ChatsSidebarSkeleton() {
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
