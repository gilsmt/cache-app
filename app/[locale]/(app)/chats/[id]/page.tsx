import { sanitizeUrl } from "@braintree/sanitize-url";
import { T } from "gt-next";
import { getGT } from "gt-next/server";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import * as React from "react";
import { buildPageMetadata } from "@/app/metadata";
import { AutomationChats } from "@/components/automations/chats";
import { ChatThread } from "@/components/chats/thread";
import { SidebarNavigation } from "@/components/sidebar/navigation";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "@/lib/auth/session";
import { ChatError } from "@/lib/chats/error";
import {
    type ChatDetail,
    getChat,
    listChats,
    toUIMessages,
} from "@/lib/chats/service";
import { dayjs } from "@/lib/common/dayjs";
import { AutomationRunStatus } from "@/prisma/client/enums";

interface ChatPageParams {
    params: Promise<{ id: string; locale: string }>;
}

export async function generateMetadata({
    params,
}: ChatPageParams): Promise<Metadata> {
    const { id, locale } = await params;
    const gt = await getGT();

    const session = await getServerSession();
    const userId = session?.user?.id;
    if (!userId) {
        return buildPageMetadata({
            description: gt("Chat with Cache about your saved content."),
            locale,
            path: `/chats/${id}`,
            title: gt("Chat"),
        });
    }

    try {
        const chat = await getChat({ chatId: id, userId });
        return {
            ...buildPageMetadata({
                description: gt("Follow up on this automation run."),
                locale,
                path: `/chats/${chat.id}`,
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
            path: `/chats/${id}`,
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
    const chats = await listChats({ userId });

    return (
        <>
            <SidebarNavigation>
                <AutomationChats chats={chats} />
            </SidebarNavigation>
            <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col p-8">
                <FadeIn>
                    <div className="flex min-h-0 flex-1 flex-col">
                        <ChatPageHeader chat={chat} />
                        <ChatThread
                            chatId={chat.id}
                            initialMessages={toUIMessages(chat.messages)}
                        />
                    </div>
                </FadeIn>
            </div>
        </>
    );
}

function ChatPageHeader({ chat }: { chat: ChatDetail }) {
    return (
        <header className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-6 pt-2 pb-4">
            <Link
                className="flex w-fit items-center gap-1 text-muted-foreground text-xs hover:text-foreground"
                href="/automations"
            >
                <ArrowLeft aria-hidden className="size-3.5" focusable="false" />
                <T>Automations</T>
            </Link>
            <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                {chat.title}
            </h1>
            {chat.run ? <ChatRunMeta chat={chat} /> : null}
            {chat.run && chat.run.sources.length > 0 ? (
                <ChatSources chat={chat} />
            ) : null}
        </header>
    );
}

function ChatRunMeta({ chat }: { chat: ChatDetail }) {
    const run = chat.run;
    if (!run) {
        return null;
    }

    return (
        <p className="text-muted-foreground text-xs">
            {getRunStatusLabel(run.status)}{" "}
            <time
                dateTime={run.createdAt.toISOString()}
                title={dayjs(run.createdAt).format("MMM DD, YYYY, h:mm A")}
            >
                {dayjs(run.createdAt).fromNow()}
            </time>
        </p>
    );
}

function getRunStatusLabel(status: AutomationRunStatus): React.ReactNode {
    switch (status) {
        case AutomationRunStatus.succeeded:
            return <T>Ran</T>;
        case AutomationRunStatus.failed:
            return <T>Failed</T>;
        case AutomationRunStatus.skipped:
            return <T>Skipped</T>;
        case AutomationRunStatus.canceled:
            return <T>Canceled</T>;
        default:
            return <T>Ran</T>;
    }
}

function ChatSources({ chat }: { chat: ChatDetail }) {
    const sources = chat.run?.sources ?? [];
    if (sources.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-col gap-1">
            <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
                <T>Sources</T>
            </p>
            <ul className="flex flex-col gap-1">
                {sources.map((source) => {
                    const key =
                        source.type === "library_item" ? source.id : source.url;
                    const label = source.title ?? source.url;
                    return (
                        <li key={`${source.type}:${key}`}>
                            <a
                                className="text-muted-foreground text-xs underline-offset-2 hover:text-foreground hover:underline"
                                href={sanitizeUrl(source.url)}
                                rel="noreferrer"
                                target="_blank"
                            >
                                {label}
                            </a>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function ChatPageSkeleton() {
    return (
        <>
            <SidebarNavigation>
                <div
                    className="relative flex flex-col gap-0.5"
                    data-sidebar-collapsible=""
                >
                    <Skeleton className="h-8 w-full rounded-lg" />
                </div>
            </SidebarNavigation>
            <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col gap-6 p-8">
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-6 pt-2 pb-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-64" />
                </div>
                <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-6">
                    <Skeleton className="h-24 w-full rounded-2xl" />
                    <Skeleton className="h-16 w-2/3 self-end rounded-2xl" />
                    <Skeleton className="h-24 w-full rounded-2xl" />
                </div>
            </div>
        </>
    );
}
