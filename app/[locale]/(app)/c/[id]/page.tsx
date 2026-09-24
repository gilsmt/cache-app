import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import * as React from "react";
import { buildPageMetadata } from "@/app/metadata";
import { ChatThread } from "@/components/chats/thread";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "@/lib/auth/session";
import { ChatError } from "@/lib/chats/error";
import { type ChatDetail, getChat, toUIMessages } from "@/lib/chats/service";

interface ChatPageParams {
    params: Promise<{ id: string; locale: string }>;
}

export async function generateMetadata({
    params,
}: ChatPageParams): Promise<Metadata> {
    await connection();

    const { id, locale } = await params;
    const gt = await getGT();

    const session = await getServerSession();
    const userId = session?.user?.id;
    if (!userId) {
        return buildPageMetadata({
            description: gt("Chat with Cache about your saved content."),
            locale,
            path: `/c/${id}`,
            title: gt("Chat"),
        });
    }

    try {
        const chat = await getChat({ chatId: id, userId });
        return {
            ...buildPageMetadata({
                description: gt("Follow up on this automation run."),
                locale,
                path: `/c/${chat.id}`,
                title: chat.title,
            }),
            robots: {
                follow: false,
                index: false,
            },
        };
    } catch {
        return buildPageMetadata({
            description: gt("Chat with Cache about your saved content."),
            locale,
            path: `/c/${id}`,
            title: gt("Chat"),
        });
    }
}

export default function ChatPage({ params }: ChatPageParams) {
    return (
        <React.Suspense fallback={<ChatPageSkeleton />}>
            <ChatPageBody params={params} />
        </React.Suspense>
    );
}

async function ChatPageBody({ params }: ChatPageParams) {
    await connection();

    const { id } = await params;
    const session = await getServerSession();
    const userId = session?.user?.id;

    if (!userId) {
        return redirect("/");
    }

    let chat: ChatDetail;
    try {
        chat = await getChat({ chatId: id, userId });
    } catch (error) {
        if (ChatError.isInstance(error) && error.data.code === "not_found") {
            return notFound();
        }
        throw error;
    }
    return (
        <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col p-4">
            <FadeIn>
                <div className="flex h-[calc(100dvh-1rem)] min-h-0 flex-col">
                    <ChatPageHeader chat={chat} />
                    <ChatThread
                        chatId={chat.id}
                        initialMessages={toUIMessages(chat.messages)}
                        key={chat.id}
                        sources={chat.run?.sources ?? []}
                    />
                </div>
            </FadeIn>
        </div>
    );
}

function ChatPageHeader({ chat }: { chat: ChatDetail }) {
    return (
        <header className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-6 pt-2 pb-4">
            <h1 className="sr-only font-semibold text-2xl text-foreground tracking-tight">
                {chat.title}
            </h1>
        </header>
    );
}

function ChatPageSkeleton() {
    return (
        <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col p-4">
            <div className="flex h-[calc(100dvh-1rem)] min-h-0 flex-col">
                <div className="flex min-h-0 w-full flex-1 flex-col">
                    <div className="h-full min-h-0 overflow-hidden">
                        <div
                            aria-busy="true"
                            aria-label="Loading chat"
                            className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6"
                            role="status"
                        >
                            <ChatAssistantSkeleton />
                            <ChatUserSkeleton />
                            <ChatAssistantSkeleton showSources={false} />
                        </div>
                    </div>
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-6">
                        <ChatComposerSkeleton />
                    </div>
                </div>
            </div>
        </div>
    );
}

interface ChatAssistantSkeletonProps {
    showSources?: boolean;
}

function ChatAssistantSkeleton({
    showSources = true,
}: ChatAssistantSkeletonProps) {
    return (
        <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
            </div>
            {showSources ? (
                <div className="flex items-center gap-2">
                    <Skeleton className="h-5.5 w-28 rounded-full" />
                    <Skeleton className="h-5.5 w-32 rounded-full" />
                </div>
            ) : null}
        </div>
    );
}

function ChatUserSkeleton() {
    return (
        <div className="flex flex-col items-end">
            <Skeleton className="h-16 w-2/3 rounded-3xl" />
        </div>
    );
}

function ChatComposerSkeleton() {
    return (
        <div className="squircle relative rounded-3xl px-3 py-3 ring-1 ring-black/10 ring-inset dark:ring-white/10">
            <div className="flex flex-col gap-3">
                <Skeleton className="h-4 w-1/3" />
                <div className="flex items-center justify-end">
                    <Skeleton className="size-9 rounded-full" />
                </div>
            </div>
        </div>
    );
}
