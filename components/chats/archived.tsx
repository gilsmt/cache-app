"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T, useGT, Var } from "gt-next";
import {
    ArchiveRestore,
    ChevronLeft,
    ChevronRight,
    MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Ticker } from "@/components/ui/ticker";
import { setChatArchived } from "@/lib/chats/actions";
import type { ChatListItem } from "@/lib/chats/service";
import { ACTION_STATUS } from "@/lib/common/constants";
import { dayjs } from "@/lib/common/dayjs";
import { createLogger } from "@/lib/common/logs/console/logger";

const log = createLogger("chats:archived-list");

function getArchivedChatsPageHref(page: number): string {
    return page === 1 ? "/c/archived" : `/c/archived?page=${page}`;
}

interface ArchivedChatsListProps {
    chats: ChatListItem[];
    page: number;
    pageCount: number;
}

export function ArchivedChatsList({
    chats,
    page,
    pageCount,
}: ArchivedChatsListProps) {
    const gt = useGT();

    if (chats.length === 0) {
        return (
            <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/50 p-8 text-center">
                <ArchiveRestore
                    aria-hidden
                    className="size-5 text-muted-foreground"
                    focusable="false"
                />
                <p className="font-medium text-foreground text-sm">
                    <T>No archived chats</T>
                </p>
                <p className="text-muted-foreground text-xs">
                    <T>Chats you archive will appear here.</T>
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <ul className="flex flex-col gap-2">
                {chats.map((entry) => (
                    <ArchivedChatRow entry={entry} key={entry.id} />
                ))}
            </ul>
            {pageCount > 1 ? (
                <nav
                    aria-label={gt("Archived chats pages")}
                    className="flex items-center justify-between"
                >
                    {page > 1 ? (
                        <Link
                            className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            href={getArchivedChatsPageHref(page - 1)}
                        >
                            <ChevronLeft aria-hidden className="size-4" />
                            <T>Previous</T>
                        </Link>
                    ) : (
                        <span />
                    )}
                    <p className="text-muted-foreground text-xs">
                        <T>
                            Page <Var>{page}</Var> of <Var>{pageCount}</Var>
                        </T>
                    </p>
                    {page < pageCount ? (
                        <Link
                            className="inline-flex items-center gap-1 text-muted-foreground text-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            href={getArchivedChatsPageHref(page + 1)}
                        >
                            <T>Next</T>
                            <ChevronRight aria-hidden className="size-4" />
                        </Link>
                    ) : (
                        <span />
                    )}
                </nav>
            ) : null}
        </div>
    );
}

interface ArchivedChatRowProps {
    entry: ChatListItem;
}

function ArchivedChatRow({ entry }: ArchivedChatRowProps) {
    const gt = useGT();
    const router = useRouter();
    const [isPending, startTransition] = React.useTransition();
    const [actionErrorMessage, setActionErrorMessage] = React.useState<
        string | null
    >(null);

    const handleUnarchive = useStableCallback(() => {
        setActionErrorMessage(null);
        startTransition(async () => {
            try {
                const result = await setChatArchived({
                    chatId: entry.id,
                    isArchived: false,
                });
                if (result.status !== ACTION_STATUS.UPDATED) {
                    setActionErrorMessage(result.message);
                    return;
                }
                router.refresh();
            } catch (error) {
                log.error("Failed to unarchive chat", {
                    chatId: entry.id,
                    error,
                });
                setActionErrorMessage(
                    gt("We couldn't unarchive this chat right now.")
                );
            }
        });
    });

    return (
        <li className="group/archived-chat flex flex-col gap-1 rounded-2xl bg-muted/50 p-3">
            <div className="flex min-w-0 items-center gap-3">
                <Link
                    className="flex min-w-0 flex-1 items-center gap-3"
                    href={`/c/${entry.id}`}
                    title={entry.title}
                >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-xs/5">
                        <MessageCircle
                            aria-hidden
                            className="size-4"
                            focusable="false"
                        />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <Ticker className="font-medium text-foreground text-sm">
                            {entry.title}
                        </Ticker>
                        <time
                            className="text-[11px] text-muted-foreground"
                            dateTime={entry.updatedAt.toISOString()}
                            title={dayjs(entry.updatedAt).format(
                                "MMM DD, YYYY, h:mm A"
                            )}
                        >
                            {dayjs(entry.updatedAt).fromNow()}
                        </time>
                    </span>
                </Link>
                <Button
                    aria-label={gt("Unarchive chat")}
                    className="text-muted-foreground pointer-fine:opacity-0 focus-visible:opacity-100 group-focus-within/archived-chat:opacity-100 pointer-fine:group-hover/archived-chat:opacity-100"
                    isLoading={isPending}
                    onClick={handleUnarchive}
                    size="icon-sm"
                    title={gt("Unarchive chat")}
                    variant="ghost"
                >
                    <ArchiveRestore
                        aria-hidden
                        className="size-4"
                        focusable="false"
                    />
                </Button>
            </div>
            {actionErrorMessage ? (
                <p className="px-1 text-destructive text-xs" role="alert">
                    {actionErrorMessage}
                </p>
            ) : null}
        </li>
    );
}
