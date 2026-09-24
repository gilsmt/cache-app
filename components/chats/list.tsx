"use client";

import { T, Var } from "gt-next";
import { History, MessageCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import { ActivePathname } from "@/components/ui/active-pathname";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HighlightIn } from "@/components/ui/highlight-in";
import { ChevronDownFilledIcon } from "@/components/ui/icons";
import {
    SidebarGroup,
    SidebarItem,
    SidebarItemValue,
} from "@/components/ui/sidebar";
import type { ChatListItem } from "@/lib/chats/service";
import { dayjs } from "@/lib/common/dayjs";
import { AutomationRunStatus } from "@/prisma/client/enums";

const CHATS_OPEN_STORAGE_KEY = "cache:chats:open";
const CHAT_SIDEBAR_MAX = 10;
const CHAT_SIDEBAR_UPDATE_WINDOW_MS = 24 * 60 * 60 * 1000;

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
    const sortedChats = chats.toSorted(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
    );
    const updateCount = getChatsUpdateCount(sortedChats, nowMs);
    const entries = sortedChats.slice(0, CHAT_SIDEBAR_MAX);

    return (
        <ChatsListContext value={entries}>
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
                        <Var>{updateCount}</Var> updates
                    </T>
                </HighlightIn>
            ) : null}
        </CollapsibleTrigger>
    );
}

function ChatsListEntries() {
    const entries = useChatsListContext();

    return (
        <SidebarGroup>
            {entries.map((entry) => (
                <ChatsListEntry entry={entry} key={entry.id} />
            ))}
        </SidebarGroup>
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
    const href = getChatHref(entry);

    return (
        <li>
            <ActivePathname
                href={href}
                render={
                    <SidebarItem
                        render={<Link href={href} title={entry.title} />}
                    />
                }
            >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/90">
                    <MessageCircle
                        aria-hidden
                        className="size-4"
                        focusable="false"
                    />
                </span>
                <SidebarItemValue>{entry.title}</SidebarItemValue>
                {entry.runStatus === AutomationRunStatus.failed ? (
                    <span
                        className="mr-1 shrink-0 text-[11px] text-destructive/80"
                        data-sidebar-collapsible=""
                    >
                        <T>Failed</T>
                    </span>
                ) : null}
                <time
                    className="shrink-0 text-[11px] text-muted-foreground/80 tabular-nums"
                    data-sidebar-collapsible=""
                    dateTime={entry.updatedAt.toISOString()}
                    title={dayjs(entry.updatedAt).format(
                        "MMM DD, YYYY, h:mm A"
                    )}
                >
                    {dayjs(entry.updatedAt).fromNow(true)}
                </time>
            </ActivePathname>
        </li>
    );
}
