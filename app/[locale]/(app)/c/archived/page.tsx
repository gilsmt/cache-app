import { T } from "gt-next";
import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import * as React from "react";
import * as z from "zod";
import { buildPageMetadata } from "@/app/metadata";
import { ArchivedChatsList } from "@/components/chats/archived";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "@/lib/auth/session";
import { listArchivedChats } from "@/lib/chats/service";

const ARCHIVED_CHAT_PAGE_SCHEMA = z.coerce.number().int().min(1);

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
                "Chats you archived, ready to restore when you need them."
            ),
            locale,
            path: "/c/archived",
            title: gt("Archived chats"),
        }),
        robots: {
            follow: false,
            index: false,
        },
    };
}

interface ArchivedChatsPageProps {
    searchParams: Promise<{
        [key: string]: string | string[] | undefined;
    }>;
}

export default function ArchivedChatsPage({
    searchParams,
}: ArchivedChatsPageProps) {
    return (
        <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col gap-6 p-8">
            <React.Suspense fallback={<ArchivedChatsPageSkeleton />}>
                <ArchivedChatsPageBody searchParams={searchParams} />
            </React.Suspense>
        </div>
    );
}

interface ArchivedChatsPageBodyProps {
    searchParams: ArchivedChatsPageProps["searchParams"];
}

async function ArchivedChatsPageBody({
    searchParams,
}: ArchivedChatsPageBodyProps) {
    await connection();

    const [session, params] = await Promise.all([
        getServerSession(),
        searchParams,
    ]);
    const userId = session?.user?.id;

    if (!userId) {
        return redirect("/");
    }

    const parsedPage = ARCHIVED_CHAT_PAGE_SCHEMA.safeParse(params.page ?? "1");
    const requestedPage = parsedPage.success ? parsedPage.data : 1;
    const archivedChats = await listArchivedChats({
        page: requestedPage,
        userId,
    });

    if (archivedChats.page !== requestedPage) {
        const href =
            archivedChats.page === 1
                ? "/c/archived"
                : `/c/archived?page=${archivedChats.page}`;
        return redirect(href);
    }

    return (
        <FadeIn>
            <div className="flex flex-col gap-8">
                <header className="flex flex-col gap-1.5">
                    <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                        <T>Archived chats</T>
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        <T>
                            Chats you archive stay here until you unarchive
                            them.
                        </T>
                    </p>
                </header>
                <ArchivedChatsList
                    chats={archivedChats.chats}
                    page={archivedChats.page}
                    pageCount={archivedChats.pageCount}
                />
            </div>
        </FadeIn>
    );
}

function ArchivedChatsPageSkeleton() {
    return (
        <div
            aria-busy="true"
            aria-label="Loading archived chats"
            className="flex flex-col gap-8"
            role="status"
        >
            <header className="flex flex-col gap-2">
                <Skeleton className="h-7 w-44" />
                <Skeleton className="h-4 w-80 max-w-full" />
            </header>
            <div className="flex flex-col gap-2">
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
                <Skeleton className="h-16 w-full rounded-2xl" />
            </div>
        </div>
    );
}
