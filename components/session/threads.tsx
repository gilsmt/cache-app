"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { T, useGT } from "gt-next";
import {
    Archive,
    ArchiveRestore,
    ArchiveX,
    Ellipsis,
    History,
    LayoutList,
    MessageCircle,
} from "lucide-react";
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
import { ErrorMessage } from "@/components/ui/error-message";
import { ChevronDownFilledIcon } from "@/components/ui/icons";
import {
    Menu,
    MenuGroupLabel,
    MenuPopup,
    MenuRadioGroup,
    MenuRadioItem,
    MenuTrigger,
} from "@/components/ui/menu";
import { SidebarItem, SidebarItemValue } from "@/components/ui/sidebar";
import { Ticker } from "@/components/ui/ticker";
import { Toolbar, ToolbarButton, ToolbarGroup } from "@/components/ui/toolbar";
import { ACTION_STATUS } from "@/lib/common/constants";
import { dayjs } from "@/lib/common/dayjs";
import { createLogger } from "@/lib/common/logs/console/logger";
import { setThreadArchived } from "@/lib/threads/actions";
import type { ThreadListItem } from "@/lib/threads/service";
import { AutomationRunStatus } from "@/prisma/client/enums";

const THREADS_OPEN_STORAGE_KEY = "cache:threads:open";
const THREADS_LIST_VIEW_STORAGE_KEY = "cache:threads:view:v1";

type ThreadListView = "show-all" | "exclude-archives";

interface ThreadsListContext {
    threads: ThreadListItem[];
    visibleThreads: ThreadListItem[];
}

const log = createLogger("threads:list");

const ThreadsListContext = React.createContext<ThreadsListContext | null>(null);

function useThreadsListContext(): ThreadsListContext {
    const context = React.use(ThreadsListContext);
    if (!context) {
        throw new Error(
            "ThreadsList compound components must be used within Threads."
        );
    }
    return context;
}

const { useStore: useThreadsListStore } = createStore({
    isOpen: storage(true, {
        storageKey: THREADS_OPEN_STORAGE_KEY,
    }),
    view: storage<ThreadListView>("exclude-archives", {
        storageKey: THREADS_LIST_VIEW_STORAGE_KEY,
    }),
});

function getVisibleThreads(
    threads: ThreadListItem[],
    view: ThreadListView
): ThreadListItem[] {
    if (view === "show-all") {
        return threads;
    }
    return threads.filter((thread) => !thread.isArchived);
}

function useSetThreadArchived(threadId: string, isArchived: boolean) {
    const gt = useGT();
    const router = useRouter();
    const [isPending, startTransition] = React.useTransition();
    const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

    const setArchived = useStableCallback(() => {
        setErrorMessage(null);
        startTransition(async () => {
            try {
                const result = await setThreadArchived({
                    isArchived,
                    threadId,
                });
                if (result.status !== ACTION_STATUS.UPDATED) {
                    setErrorMessage(result.message);
                    return;
                }
                router.refresh();
            } catch (error) {
                log.error(
                    isArchived
                        ? "Failed to archive thread"
                        : "Failed to unarchive thread",
                    {
                        error,
                        threadId,
                    }
                );
                setErrorMessage(
                    isArchived
                        ? gt("We couldn't archive this chat right now.")
                        : gt("We couldn't unarchive this chat right now.")
                );
            }
        });
    });

    return { errorMessage, isPending, setArchived };
}

interface ThreadsListProps {
    threads: ThreadListItem[];
}

export function Threads({ threads }: ThreadsListProps) {
    const { view } = useThreadsListStore();

    const visibleThreads = getVisibleThreads(threads, view);

    const contextValue: ThreadsListContext = { threads, visibleThreads };

    return (
        <ThreadsListContext value={contextValue}>
            <ThreadsList
                className="group/collapsible"
                data-sidebar-collapsible=""
            >
                <Toolbar className="group">
                    <ThreadsListTrigger>
                        <T>Recents</T>
                    </ThreadsListTrigger>
                    <ToolbarGroup>
                        <ToolbarButton render={<ThreadsListFilterTrigger />} />
                    </ToolbarGroup>
                </Toolbar>
                <ThreadsListPanel>
                    <ThreadsListEmpty />
                    <ThreadsListContent>
                        {(entry) => (
                            <ThreadsListItem entry={entry} key={entry.id} />
                        )}
                    </ThreadsListContent>
                </ThreadsListPanel>
            </ThreadsList>
        </ThreadsListContext>
    );
}

function ThreadsList(props: React.ComponentProps<typeof Collapsible>) {
    const { isOpen, setIsOpen } = useThreadsListStore();

    return <Collapsible {...props} onOpenChange={setIsOpen} open={isOpen} />;
}

function ThreadsListPanel(
    props: React.ComponentProps<typeof CollapsiblePanel>
) {
    return <CollapsiblePanel {...props} />;
}

function ThreadsListTrigger({
    children,
    render,
    ...props
}: React.ComponentProps<typeof CollapsibleTrigger>) {
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
        </CollapsibleTrigger>
    );
}

function ThreadsListFilterTrigger(
    props: React.ComponentProps<typeof MenuTrigger>
) {
    const gt = useGT();
    const { setView, view } = useThreadsListStore();

    const handleViewChange = useStableCallback((value: unknown) => {
        if (value === "show-all" || value === "exclude-archives") {
            setView(value);
        }
    });

    return (
        <Menu>
            <MenuTrigger
                {...props}
                render={
                    <Button
                        aria-label={gt("Filter chats")}
                        size="icon-xs"
                        title={gt("Filter chats")}
                        variant="ghost"
                    />
                }
            >
                <Ellipsis aria-hidden className="size-3.5" focusable="false" />
            </MenuTrigger>
            <MenuPopup align="end">
                <MenuRadioGroup onValueChange={handleViewChange} value={view}>
                    <MenuGroupLabel>
                        <T>Show</T>
                    </MenuGroupLabel>
                    <MenuRadioItem value="show-all">
                        <span className="flex items-center gap-2">
                            <LayoutList
                                aria-hidden
                                className="size-4 text-muted-foreground"
                                focusable="false"
                            />
                            <T>Show all</T>
                        </span>
                    </MenuRadioItem>
                    <MenuRadioItem value="exclude-archives">
                        <span className="flex items-center gap-2">
                            <ArchiveX
                                aria-hidden
                                className="size-4 text-muted-foreground"
                                focusable="false"
                            />
                            <T>Exclude archives</T>
                        </span>
                    </MenuRadioItem>
                </MenuRadioGroup>
            </MenuPopup>
        </Menu>
    );
}

interface ThreadsListContentProps {
    children: (entry: ThreadListItem, index: number) => React.ReactNode;
}

function ThreadsListContent({ children }: ThreadsListContentProps) {
    const { visibleThreads } = useThreadsListContext();

    return (
        <CollapsibleListVertical className="pl-1.25" maxVisible={5}>
            {visibleThreads.map(children)}
        </CollapsibleListVertical>
    );
}

function ThreadsListEmpty() {
    const { threads, visibleThreads } = useThreadsListContext();
    const { setView } = useThreadsListStore();

    const handleShowAll = useStableCallback(() => setView("show-all"));

    if (visibleThreads.length > 0) {
        return null;
    }

    return (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/30 border-dashed px-4 py-6 text-center">
            {threads.length > 0 ? (
                <>
                    <ArchiveRestore
                        aria-hidden
                        className="size-4 text-muted-foreground"
                        focusable="false"
                    />
                    <p className="font-medium text-muted-foreground text-xs leading-tight">
                        <T>No chats match this view.</T>
                    </p>
                    <Button
                        onClick={handleShowAll}
                        size="sm"
                        variant="secondary"
                    >
                        <T>Show all chats</T>
                    </Button>
                </>
            ) : (
                <>
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
                            Recent activity will appear here after your
                            automations run.
                        </T>
                    </p>
                </>
            )}
        </div>
    );
}

interface ThreadsListItemProps {
    entry: ThreadListItem;
}

function ThreadsListItem({ entry }: ThreadsListItemProps) {
    const { errorMessage, isPending, setArchived } = useSetThreadArchived(
        entry.id,
        !entry.isArchived
    );

    const href = `/c/${entry.id}`;

    return (
        <div>
            <div className="group/thread-item relative">
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
                    {entry.runStatus === AutomationRunStatus.failed && (
                        <span
                            className="mr-1 shrink-0 text-[11px] text-destructive/80"
                            data-sidebar-collapsible=""
                        >
                            <T>Failed</T>
                        </span>
                    )}
                </ActivePathname>
                <ThreadsListItemControls
                    isArchived={entry.isArchived}
                    isPending={isPending}
                    onArchiveToggle={setArchived}
                    updatedAt={entry.updatedAt}
                />
            </div>
            <ErrorMessage className="px-2 py-1 text-[11px]">
                {errorMessage}
            </ErrorMessage>
        </div>
    );
}

interface ThreadsListItemControlsProps {
    isArchived: boolean;
    isPending: boolean;
    onArchiveToggle: () => void;
    updatedAt: Date;
}

function ThreadsListItemControls({
    isArchived,
    isPending,
    onArchiveToggle,
    updatedAt,
}: ThreadsListItemControlsProps) {
    const gt = useGT();
    const label = isArchived ? gt("Unarchive chat") : gt("Archive chat");

    return (
        <div className="absolute top-1/2 pointer-fine:right-0 right-1 flex pointer-fine:size-9 h-9 -translate-y-1/2 items-center justify-end pointer-fine:justify-center gap-1 pointer-fine:gap-0">
            <time
                className={cn(
                    "pointer-events-none shrink-0 text-nowrap text-[11px] text-muted-foreground/80 tabular-nums pointer-fine:group-focus-within/thread-item:opacity-0 pointer-fine:group-hover/thread-item:opacity-0",
                    isPending && "opacity-0"
                )}
                data-sidebar-collapsible=""
                dateTime={updatedAt.toISOString()}
                title={dayjs(updatedAt).format("MMM DD, YYYY, h:mm A")}
            >
                {dayjs(updatedAt).fromNow(true)}
            </time>
            <Button
                aria-label={label}
                className={cn(
                    "pointer-fine:pointer-events-none pointer-fine:absolute relative size-6 shrink-0 text-muted-foreground pointer-fine:opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 group-focus-within/thread-item:pointer-events-auto group-focus-within/thread-item:opacity-100 pointer-fine:group-hover/thread-item:pointer-events-auto pointer-fine:group-hover/thread-item:opacity-100",
                    isPending &&
                        "pointer-fine:pointer-events-auto pointer-fine:opacity-100"
                )}
                isLoading={isPending}
                onClick={onArchiveToggle}
                size="icon-xs"
                title={label}
                variant="ghost"
            >
                {isArchived ? (
                    <ArchiveRestore
                        aria-hidden
                        className="size-3"
                        focusable="false"
                    />
                ) : (
                    <Archive aria-hidden className="size-3" focusable="false" />
                )}
            </Button>
        </div>
    );
}
