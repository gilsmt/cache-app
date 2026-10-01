"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
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
import { ErrorMessage } from "@/components/ui/error-message";
import { Ticker } from "@/components/ui/ticker";
import { setChatArchived } from "@/lib/chats/actions";
import type { ChatListItem } from "@/lib/chats/service";
import { ACTION_STATUS } from "@/lib/common/constants";
import { dayjs } from "@/lib/common/dayjs";
import { createLogger } from "@/lib/common/logs/console/logger";
import { AutomationRunStatus } from "@/prisma/client/enums";

const log = createLogger("chats:archived-list");

const ArchivedChatsListContext = React.createContext<ChatListItem[] | null>(
    null
);

function useArchivedChatsListContext(): ChatListItem[] {
    const context = React.use(ArchivedChatsListContext);
    if (!context) {
        throw new Error(
            "ArchivedChatsList compound components must be used within ArchivedChatsList."
        );
    }
    return context;
}

function getArchivedChatsPageHref(page: number): string {
    return page === 1 ? "/c/archived" : `/c/archived?page=${page}`;
}

function useUnarchiveChat(chatId: string) {
    const gt = useGT();
    const router = useRouter();
    const [isPending, startTransition] = React.useTransition();
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    const unarchive = useStableCallback(() => {
        setErrorMessage(null);
        startTransition(async () => {
            try {
                const result = await setChatArchived({
                    chatId,
                    isArchived: false,
                });
                if (result.status !== ACTION_STATUS.UPDATED) {
                    setErrorMessage(result.message);
                    return;
                }
                router.refresh();
            } catch (error) {
                log.error("Failed to unarchive chat", {
                    chatId,
                    error,
                });
                setErrorMessage(
                    gt("We couldn't unarchive this chat right now.")
                );
            }
        });
    });

    return { errorMessage, isPending, unarchive };
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
    return (
        <ArchivedChatsListContext value={chats}>
            <div className="flex flex-col gap-4">
                <ArchivedChatsListEmpty />
                <ArchivedChatsListContent>
                    {(entry) => (
                        <ArchivedChatsListItem entry={entry} key={entry.id} />
                    )}
                </ArchivedChatsListContent>
                <ArchivedChatsListPagination
                    page={page}
                    pageCount={pageCount}
                />
            </div>
        </ArchivedChatsListContext>
    );
}

interface ArchivedChatsListContentProps {
    children: (entry: ChatListItem, index: number) => React.ReactNode;
}

function ArchivedChatsListContent({ children }: ArchivedChatsListContentProps) {
    const entries = useArchivedChatsListContext();

    if (entries.length === 0) {
        return null;
    }

    return (
        <ul className="flex list-none flex-col gap-2">
            {entries.map(children)}
        </ul>
    );
}

function ArchivedChatsListEmpty() {
    const entries = useArchivedChatsListContext();

    if (entries.length > 0) {
        return null;
    }

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

interface ArchivedChatsListPaginationProps {
    page: number;
    pageCount: number;
}

function ArchivedChatsListPagination({
    page,
    pageCount,
}: ArchivedChatsListPaginationProps) {
    const gt = useGT();
    const entries = useArchivedChatsListContext();

    if (entries.length === 0 || pageCount <= 1) {
        return null;
    }

    return (
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
    );
}

interface ArchivedChatsListItemProps {
    entry: ChatListItem;
}

function ArchivedChatsListItem({ entry }: ArchivedChatsListItemProps) {
    const { errorMessage, isPending, unarchive } = useUnarchiveChat(entry.id);

    const href = `/c/${entry.id}`;

    return (
        <li className="group/archived-chat-item flex list-none flex-col gap-1 rounded-2xl bg-muted/50 p-3">
            <div className="flex min-w-0 items-center gap-3">
                <Link
                    className="flex min-w-0 flex-1 items-center gap-3"
                    href={href}
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
                        <Ticker className="font-medium text-foreground text-sm leading-none tracking-tight">
                            {entry.title}
                        </Ticker>
                        <time
                            className="text-[11px] text-muted-foreground"
                            dateTime={entry.updatedAt.toISOString()}
                            suppressHydrationWarning
                            title={dayjs(entry.updatedAt).format(
                                "MMM DD, YYYY, h:mm A"
                            )}
                        >
                            {dayjs(entry.updatedAt).fromNow()}
                        </time>
                    </span>
                    {entry.runStatus === AutomationRunStatus.failed ? (
                        <span className="shrink-0 text-[11px] text-destructive/80">
                            <T>Failed</T>
                        </span>
                    ) : null}
                </Link>
                <ArchivedChatsListItemControls
                    isPending={isPending}
                    onUnarchive={unarchive}
                />
            </div>
            <ErrorMessage className="px-1 text-[11px]">
                {errorMessage}
            </ErrorMessage>
        </li>
    );
}

interface ArchivedChatsListItemControlsProps {
    isPending: boolean;
    onUnarchive: () => void;
}

function ArchivedChatsListItemControls({
    isPending,
    onUnarchive,
}: ArchivedChatsListItemControlsProps) {
    const gt = useGT();

    return (
        <Button
            aria-label={gt("Unarchive chat")}
            className={cn(
                "text-muted-foreground pointer-fine:opacity-0 focus-visible:opacity-100 group-focus-within/archived-chat-item:opacity-100 pointer-fine:group-hover/archived-chat-item:opacity-100",
                isPending && "pointer-fine:opacity-100"
            )}
            isLoading={isPending}
            onClick={onUnarchive}
            size="icon-sm"
            title={gt("Unarchive chat")}
            variant="ghost"
        >
            <ArchiveRestore aria-hidden className="size-4" focusable="false" />
        </Button>
    );
}
