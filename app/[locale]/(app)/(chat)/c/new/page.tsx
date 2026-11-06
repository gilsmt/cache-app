import { T } from "gt-next";
import { getGT } from "gt-next/server";
import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import * as React from "react";
import { buildPageMetadata } from "@/app/metadata";
import { Thread } from "@/components/session/thread";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUserId } from "@/lib/auth/session";
import { THREAD_NEW_ROUTE_ID } from "@/lib/threads/constants";

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
            description: gt("Chat with Cache about your saved content."),
            locale,
            path: "/c/new",
            title: gt("New thread"),
        }),
        robots: {
            follow: false,
            index: false,
        },
    };
}

export default function NewThreadPage() {
    return (
        <React.Suspense fallback={<NewThreadPageSkeleton />}>
            <NewThreadPageBody />
        </React.Suspense>
    );
}

async function NewThreadPageBody() {
    await connection();

    const userId = await getSessionUserId();
    if (!userId) {
        return redirect("/");
    }

    return (
        <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col p-4">
            <div className="flex h-[calc(100dvh-1rem)] min-h-0 flex-col">
                <header className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-6 pt-2 pb-4">
                    <h1 className="text-foreground flex min-w-0 items-center gap-3 text-sm font-semibold tracking-tight">
                        <span className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg">
                            <MessageCircle
                                aria-hidden
                                className="size-4"
                                focusable="false"
                            />
                        </span>
                        <span>
                            <T>New thread</T>
                        </span>
                    </h1>
                </header>
                <Thread
                    initialMessages={[]}
                    sources={[]}
                    threadId={THREAD_NEW_ROUTE_ID}
                />
            </div>
        </div>
    );
}

function NewThreadPageSkeleton() {
    return (
        <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col p-4">
            <div className="flex h-[calc(100dvh-1rem)] min-h-0 flex-col">
                <div
                    aria-hidden
                    className="mx-auto flex w-full max-w-3xl items-center gap-3 px-6 pt-2 pb-4"
                >
                    <Skeleton className="size-7 shrink-0 rounded-lg" />
                    <Skeleton className="h-4 w-24" />
                </div>
                <div className="flex min-h-0 w-full flex-1 flex-col">
                    <div className="min-h-0 flex-1" />
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-6">
                        <div className="squircle rounded-3xl px-3 py-3 ring-1 ring-black/10 ring-inset dark:ring-white/10">
                            <Skeleton className="h-4 w-1/3" />
                            <div className="mt-3 flex justify-end">
                                <Skeleton className="size-9 rounded-full" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
