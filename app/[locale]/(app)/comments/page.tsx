import { T } from "gt-next";
import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import * as React from "react";
import { buildPageMetadata } from "@/app/metadata";
import { CommentsList } from "@/components/comments/list";
import { ApplicationSidebar } from "@/components/sidebar/application-sidebar";
import { FadeIn } from "@/components/ui/fade-in";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerSession } from "@/lib/auth/session";
import { listCommentsForUser } from "@/lib/comment/service";

const COMMENTS_SKELETON_KEYS = ["c0", "c1", "c2", "c3", "c4"] as const;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}): Promise<Metadata> {
    const { locale } = await params;
    const gt = await getGT();

    return {
        ...buildPageMetadata({
            description: gt("Comments you added to saved items, newest first."),
            locale,
            path: "/comments",
            title: gt("Comments"),
        }),
        robots: {
            follow: false,
            index: false,
        },
    };
}

export default function CommentsPage() {
    return (
        <>
            <ApplicationSidebar />
            <div className="relative z-0 flex w-full min-w-0 flex-1 flex-col gap-6 p-8">
                <React.Suspense fallback={<CommentsPageSkeleton />}>
                    <CommentsPageBody />
                </React.Suspense>
            </div>
        </>
    );
}

function CommentsPageHeader() {
    return (
        <header className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1.5">
                <h1 className="font-semibold text-2xl text-foreground tracking-tight">
                    <T>Comments</T>
                </h1>
                <p className="text-muted-foreground text-sm">
                    <T>Everything you noted across your library.</T>
                </p>
            </div>
        </header>
    );
}

async function CommentsPageBody() {
    await connection();

    const session = await getServerSession();
    const userId = session?.user?.id;

    if (!userId) {
        return redirect("/");
    }

    const comments = await listCommentsForUser({ userId });

    return (
        <FadeIn>
            <div className="flex flex-col gap-8">
                <CommentsPageHeader />
                <CommentsList comments={comments} />
            </div>
        </FadeIn>
    );
}

function CommentsPageSkeleton() {
    return (
        <>
            <CommentsPageHeader />
            <div
                aria-busy="true"
                aria-label="Loading comments"
                className="flex flex-col gap-3"
                role="status"
            >
                {COMMENTS_SKELETON_KEYS.map((key) => (
                    <div
                        className="flex items-center gap-4 rounded-2xl bg-muted/60 p-4"
                        key={key}
                    >
                        <Skeleton className="size-12 shrink-0 rounded-lg" />
                        <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-3 w-1/3" />
                            <Skeleton className="h-3 w-full" />
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}
