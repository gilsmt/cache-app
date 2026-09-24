"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { Plural, T, useGT, Var } from "gt-next";
import { Archive, History, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import { ActivePathname } from "@/components/ui/active-pathname";
import { Button } from "@/components/ui/button";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CollapsibleListVertical } from "@/components/ui/collapsible-list";
import { HighlightIn } from "@/components/ui/highlight-in";
import { ChevronDownFilledIcon } from "@/components/ui/icons";
import { SidebarItem, SidebarItemValue } from "@/components/ui/sidebar";
import { Ticker } from "@/components/ui/ticker";
import { setChatArchived } from "@/lib/chats/actions";
import type { ChatListItem } from "@/lib/chats/service";
import { ACTION_STATUS } from "@/lib/common/constants";
import { dayjs } from "@/lib/common/dayjs";
import { createLogger } from "@/lib/common/logs/console/logger";
import { AutomationRunStatus } from "@/prisma/client/enums";

const CHATS_OPEN_STORAGE_KEY = "cache:chats:open";

const CHAT_SIDEBAR_UPDATE_WINDOW_MS = 24 * 60 * 60 * 1000;

const log = createLogger("chats:list");

const ChatsListContext = React.createContext<ChatListItem[] | null>(null);

function useChatsListContext(): ChatListItem[] {
    const context = React.use(ChatsListContext);
    if (!context) {
        throw new Error(
            "ChatsList compound components must be used within ChatsList."
        );
    }
    return context;
}

const { useStore: useChatsListStore } = createStore({
    isOpen: storage(true, {
        storageKey: CHATS_OPEN_STORAGE_KEY,
    }),
});

function getChatsUpdateCount(chats: ChatListItem[], nowMs: number): number {
    const cutoff = nowMs - CHAT_SIDEBAR_UPDATE_WINDOW_MS;
    return chats.filter((chat) => chat.updatedAt.getTime() >= cutoff).length;
}

function getChatHref(chat: ChatListItem): string {
    return `/c/${chat.id}`;
}

interface ChatsListProps {
    chats: ChatListItem[];
    nowMs: number;
}

export function ChatsList({ chats, nowMs }: ChatsListProps) {
    const updateCount = getChatsUpdateCount(chats, nowMs);

    return (
        <ChatsListContext value={chats}>
            <ChatsListCollapsible
                className="group/collapsible"
                data-sidebar-collapsible=""
            >
                <ChatsListTrigger updateCount={updateCount}>
                    <T>Chats</T>
                </ChatsListTrigger>
                <ChatsListPanel>
                    <ChatsListEmpty />
                    <ChatsListEntries />
                </ChatsListPanel>
            </ChatsListCollapsible>
        </ChatsListContext>
    );
}

function ChatsListCollapsible(props: React.ComponentProps<typeof Collapsible>) {
    const { isOpen, setIsOpen } = useChatsListStore();

    return <Collapsible {...props} onOpenChange={setIsOpen} open={isOpen} />;
}

function ChatsListPanel(props: React.ComponentProps<typeof CollapsiblePanel>) {
    return <CollapsiblePanel {...props} />;
}

interface ChatsListTriggerProps
    extends React.ComponentProps<typeof CollapsibleTrigger> {
    updateCount: number;
}

function ChatsListTrigger({
    children,
    render,
    updateCount,
    ...props
}: ChatsListTriggerProps) {
    return (
        <CollapsibleTrigger
            {...props}
            render={render ?? <SidebarItem render={<button type="button" />} />}
        >
            <span className="min-w-0 text-xs">{children}</span>
            <ChevronDownFilledIcon
                aria-hidden
                className="-ml-0.5"
                focusable="false"
            />
            {updateCount > 0 ? (
                <HighlightIn
                    className="absolute right-2 text-[11px] text-muted-foreground"
                    key={updateCount}
                >
                    <T>
                        <Plural
                            n={updateCount}
                            plural={
                                <>
                                    <Var>{updateCount}</Var> updates
                                </>
                            }
                            singular={
                                <>
                                    <Var>{updateCount}</Var> update
                                </>
                            }
                        />
                    </T>
                </HighlightIn>
            ) : null}
        </CollapsibleTrigger>
    );
}

function ChatsListEntries() {
    const entries = useChatsListContext();

    return (
        <CollapsibleListVertical
            className="relative ml-1.25 w-full min-w-0 gap-px"
            maxVisible={5}
        >
            {entries.map((entry) => (
                <ChatsListEntry entry={entry} key={entry.id} />
            ))}
        </CollapsibleListVertical>
    );
}

function ChatsListEmpty() {
    const entries = useChatsListContext();

    if (entries.length > 0) {
        return null;
    }

    return (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/30 border-dashed px-4 py-6 text-center">
            <History
                aria-hidden
                className="size-4 text-muted-foreground"
                focusable="false"
            />
            <p className="font-medium text-muted-foreground text-xs leading-tight">
                <T>No chats yet.</T>
            </p>
            <p className="text-[11px] text-muted-foreground/70 leading-tight">
                <T>
                    Recent activity will appear here after your automations run.
                </T>
            </p>
        </div>
    );
}

interface ChatsListEntryProps {
    entry: ChatListItem;
}

function ChatsListEntry({ entry }: ChatsListEntryProps) {
    const gt = useGT();
    const router = useRouter();
    const [isPending, startTransition] = React.useTransition();
    const [actionErrorMessage, setActionErrorMessage] = React.useState<
        string | null
    >(null);
    const href = getChatHref(entry);

    const handleArchive = useStableCallback(() => {
        setActionErrorMessage(null);
        startTransition(async () => {
            try {
                const result = await setChatArchived({
                    chatId: entry.id,
                    isArchived: true,
                });
                if (result.status !== ACTION_STATUS.UPDATED) {
                    setActionErrorMessage(result.message);
                    return;
                }
                router.refresh();
            } catch (error) {
                log.error("Failed to archive chat", {
                    chatId: entry.id,
                    error,
                });
                setActionErrorMessage(
                    gt("We couldn't archive this chat right now.")
                );
            }
        });
    });

    return (
        <div>
            <div className="group/chat-entry relative">
                <ActivePathname
                    href={href}
                    render={
                        <SidebarItem
                            className="pointer-fine:pr-8 pr-15 pl-8.5"
                            render={<Link href={href} title={entry.title} />}
                        />
                    }
                >
                    <span className="pointer-events-none absolute top-1/2 left-1.25 z-10 flex size-6 -translate-y-1/2 items-center justify-center rounded-md bg-muted/90">
                        <MessageCircle
                            aria-hidden
                            className="size-4"
                            focusable="false"
                        />
                    </span>
                    <SidebarItemValue>
                        <Ticker className="font-medium text-sm leading-none tracking-tight">
                            {entry.title}
                        </Ticker>
                    </SidebarItemValue>
                    {entry.runStatus === AutomationRunStatus.failed ? (
                        <span
                            className="mr-1 shrink-0 text-[11px] text-destructive/80"
                            data-sidebar-collapsible=""
                        >
                            <T>Failed</T>
                        </span>
                    ) : null}
                </ActivePathname>
                <ChatsListEntryControls
                    entry={entry}
                    isPending={isPending}
                    onArchive={handleArchive}
                />
            </div>
            {actionErrorMessage ? (
                <p
                    className="px-2 py-1 text-[11px] text-destructive"
                    role="alert"
                >
                    {actionErrorMessage}
                </p>
            ) : null}
        </div>
    );
}

interface ChatsListEntryControlsProps {
    entry: ChatListItem;
    isPending: boolean;
    onArchive: () => void;
}

function ChatsListEntryControls({
    entry,
    isPending,
    onArchive,
}: ChatsListEntryControlsProps) {
    const gt = useGT();

    return (
        <div className="absolute top-1/2 pointer-fine:right-0 right-1 flex pointer-fine:size-9 h-9 -translate-y-1/2 items-center justify-end pointer-fine:justify-center gap-1 pointer-fine:gap-0">
            <time
                className={cn(
                    "pointer-events-none shrink-0 text-nowrap text-[11px] text-muted-foreground/80 tabular-nums pointer-fine:group-focus-within/chat-entry:opacity-0 pointer-fine:group-hover/chat-entry:opacity-0",
                    isPending && "opacity-0"
                )}
                data-sidebar-collapsible=""
                dateTime={entry.updatedAt.toISOString()}
                title={dayjs(entry.updatedAt).format("MMM DD, YYYY, h:mm A")}
            >
                {dayjs(entry.updatedAt).fromNow(true)}
            </time>
            <Button
                aria-label={gt("Archive chat")}
                className={cn(
                    "pointer-fine:pointer-events-none pointer-fine:absolute relative size-6 shrink-0 text-muted-foreground pointer-fine:opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 group-focus-within/chat-entry:pointer-events-auto group-focus-within/chat-entry:opacity-100 pointer-fine:group-hover/chat-entry:pointer-events-auto pointer-fine:group-hover/chat-entry:opacity-100",
                    isPending &&
                        "pointer-fine:pointer-events-auto pointer-fine:opacity-100"
                )}
                isLoading={isPending}
                onClick={onArchive}
                size="icon-xs"
                title={gt("Archive chat")}
                variant="ghost"
            >
                <Archive aria-hidden className="size-3" focusable="false" />
            </Button>
        </div>
    );
}
