"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { T, useGT, Var } from "gt-next";
import {
    Archive,
    ArchiveRestore,
    ArchiveX,
    Ellipsis,
    History,
    LayoutList,
    MessageCircle,
    Trash2,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import {
    Dialog,
    DialogClose,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPopup,
    DialogTitle,
} from "@/components/ui/dialog";
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
import {
    RELATIVE_DATE_GROUP_IDS,
    type RelativeDateGroupId,
    resolveRelativeDateGroupId,
} from "@/lib/collections/grouping";
import { ACTION_STATUS } from "@/lib/common/constants";
import { type Dayjs, dayjs } from "@/lib/common/dayjs";
import { createLogger } from "@/lib/common/logs/console/logger";
import { normalizePathname } from "@/lib/common/url";
import { deleteThread, setThreadArchived } from "@/lib/threads/actions";
import type { ThreadListItem } from "@/lib/threads/service";

const THREADS_OPEN_STORAGE_KEY = "cache:threads:open";
const THREADS_LIST_VIEW_STORAGE_KEY = "cache:threads:view:v1";

const THREADS_LIST_GROUP_LABELS: Record<RelativeDateGroupId, React.ReactNode> =
    {
        "last-3-days": <T>Last 3 days</T>,
        "last-7-days": <T>Last 7 days</T>,
        "last-30-days": <T>Last 30 days</T>,
        older: <T>Older</T>,
        today: <T>Today</T>,
    };

type ThreadListView = "show-all" | "exclude-archives";

interface ThreadSection {
    groupId: RelativeDateGroupId;
    threads: ThreadListItem[];
}

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
    pendingDeleteThreadId: null as string | null,
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

function groupThreadsByUpdatedAt(
    threads: ThreadListItem[],
    now: Dayjs
): ThreadSection[] {
    const sections = RELATIVE_DATE_GROUP_IDS.map((groupId) => ({
        groupId,
        threads: [] as ThreadListItem[],
    }));
    const sectionByGroupId = new Map<RelativeDateGroupId, ThreadSection>(
        sections.map((section) => [section.groupId, section])
    );

    for (const thread of threads) {
        const groupId = resolveRelativeDateGroupId(thread.updatedAt, now);
        const section = sectionByGroupId.get(groupId);
        if (section === undefined) {
            throw new Error(
                `Thread grouping resolved "${groupId}", which is not a declared relative date group.`
            );
        }
        section.threads.push(thread);
    }

    return sections.filter((section) => section.threads.length > 0);
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

function useDeleteThread(threadId: string | null, onDeleted: () => void) {
    const gt = useGT();
    const router = useRouter();
    const pathname = usePathname();
    const [isPending, startTransition] = React.useTransition();
    const [failure, setFailure] = React.useState<{
        message: string;
        threadId: string;
    } | null>(null);

    const clearError = useStableCallback(() => {
        setFailure(null);
    });

    React.useEffect(() => {
        setFailure((current) =>
            current && current.threadId !== threadId ? null : current
        );
    }, [threadId]);

    const removeThread = useStableCallback(() => {
        if (!threadId) {
            return;
        }
        setFailure(null);
        startTransition(async () => {
            try {
                const result = await deleteThread({ threadId });
                if (result.status !== ACTION_STATUS.DELETED) {
                    setFailure({ message: result.message, threadId });
                    return;
                }
                onDeleted();
                if (
                    normalizePathname(pathname ?? "/") ===
                    normalizePathname(`/c/${threadId}`)
                ) {
                    router.push("/");
                } else {
                    router.refresh();
                }
            } catch (error) {
                log.error("Failed to delete thread", { error, threadId });
                setFailure({
                    message: gt("We couldn't delete this chat right now."),
                    threadId,
                });
            }
        });
    });

    const errorMessage =
        failure && failure.threadId === threadId ? failure.message : null;

    return { clearError, errorMessage, isPending, removeThread };
}

interface ThreadsProps {
    threads: ThreadListItem[];
}

export function Threads({ threads }: ThreadsProps) {
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
                    <ToolbarGroup className="pointer-events-none absolute right-1 justify-end">
                        <ToolbarButton
                            className="pointer-events-auto"
                            render={<ThreadsListFilterTrigger />}
                        />
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
            <ThreadsListDeleteDialog />
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
    const now = dayjs();

    const activeThreads = visibleThreads.filter((thread) => !thread.isArchived);
    const archivedThreads = visibleThreads.filter(
        (thread) => thread.isArchived
    );
    const groups = groupThreadsByUpdatedAt(activeThreads, now);

    return (
        <>
            {groups.map((group) => (
                <ThreadsListGroup
                    key={group.groupId}
                    label={THREADS_LIST_GROUP_LABELS[group.groupId]}
                    threads={group.threads}
                >
                    {children}
                </ThreadsListGroup>
            ))}
            {archivedThreads.length > 0 ? (
                <ThreadsListGroup
                    collapsible
                    label={<T>Archived</T>}
                    threads={archivedThreads}
                >
                    {children}
                </ThreadsListGroup>
            ) : null}
        </>
    );
}

interface ThreadsListGroupProps {
    children: (entry: ThreadListItem, index: number) => React.ReactNode;
    collapsible?: boolean;
    label: React.ReactNode;
    threads: ThreadListItem[];
}

function ThreadsListGroup({
    children,
    collapsible = false,
    label,
    threads,
}: ThreadsListGroupProps) {
    return (
        <div className="flex flex-col">
            <div className="sticky -top-9 flex items-center justify-between bg-background p-2.5">
                <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                    {label}
                </span>
            </div>
            {collapsible ? (
                <CollapsibleListVertical className="pl-1.25" maxVisible={5}>
                    {threads.map(children)}
                </CollapsibleListVertical>
            ) : (
                <div className="relative flex w-full min-w-0 flex-col gap-1 pl-1.25">
                    {threads.map(children)}
                </div>
            )}
        </div>
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
                    <Button onClick={handleShowAll} size="xs" variant="outline">
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

function ThreadsListDeleteDialog() {
    const { threads } = useThreadsListContext();
    const { pendingDeleteThreadId, setPendingDeleteThreadId } =
        useThreadsListStore();

    const handleDeleted = useStableCallback(() => {
        setPendingDeleteThreadId(null);
    });

    const { clearError, errorMessage, isPending, removeThread } =
        useDeleteThread(pendingDeleteThreadId, handleDeleted);

    const thread = threads.find((entry) => entry.id === pendingDeleteThreadId);

    const handleOpenChange = useStableCallback((isOpen: boolean) => {
        if (isOpen || isPending) {
            return;
        }
        clearError();
        setPendingDeleteThreadId(null);
    });

    const handleConfirm = useStableCallback(() => {
        if (!thread || isPending) {
            return;
        }
        // The dialog stays open on failure so the error stays readable; it
        // closes on success when the pending delete ID resets.
        removeThread();
    });

    return (
        <Dialog onOpenChange={handleOpenChange} open={thread !== undefined}>
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>
                        <T>Delete chat?</T>
                    </DialogTitle>
                    <DialogDescription>
                        <T>
                            This will permanently delete{" "}
                            <Var>{thread?.title ?? "this chat"}</Var> from your
                            Cache.
                        </T>
                    </DialogDescription>
                </DialogHeader>
                {errorMessage ? (
                    <ErrorMessage className="px-6 pt-2">
                        {errorMessage}
                    </ErrorMessage>
                ) : null}
                <DialogFooter>
                    <DialogClose
                        disabled={isPending}
                        render={<Button variant="ghost" />}
                    >
                        <T>Cancel</T>
                    </DialogClose>
                    <Button
                        isLoading={isPending}
                        onClick={handleConfirm}
                        variant="destructive"
                    >
                        <T>Delete</T>
                    </Button>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
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
    const { setPendingDeleteThreadId } = useThreadsListStore();

    const requestDelete = useStableCallback(() =>
        setPendingDeleteThreadId(entry.id)
    );

    const href = `/c/${entry.id}`;

    return (
        <div>
            <div className="group/thread-item relative">
                <ActivePathname
                    href={href}
                    render={
                        <SidebarItem
                            className={cn(
                                "pointer-fine:pr-8 pr-15 pl-8.5",
                                entry.isArchived &&
                                    "pointer-fine:group-focus-within/thread-item:pr-13.5 pointer-fine:group-hover/thread-item:pr-13.5"
                            )}
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
                </ActivePathname>
                <ThreadsListItemControls
                    isArchived={entry.isArchived}
                    isPending={isPending}
                    onArchiveToggle={setArchived}
                    onDelete={requestDelete}
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
    onDelete: () => void;
    updatedAt: Date;
}

function ThreadsListItemControls({
    isArchived,
    isPending,
    onArchiveToggle,
    onDelete,
    updatedAt,
}: ThreadsListItemControlsProps) {
    const gt = useGT();

    const label = isArchived ? gt("Unarchive chat") : gt("Archive chat");
    const deleteLabel = gt("Delete chat");

    return (
        <div className="absolute top-1/2 right-1 flex h-9 -translate-y-1/2 items-center justify-end">
            <time
                className={cn(
                    "pointer-events-none min-w-5 shrink-0 text-nowrap text-[11px] text-muted-foreground/80 tabular-nums pointer-fine:group-focus-within/thread-item:opacity-0 pointer-fine:group-hover/thread-item:opacity-0",
                    isPending && "opacity-0",
                    isArchived && "pointer-coarse:hidden"
                )}
                data-sidebar-collapsible=""
                dateTime={updatedAt.toISOString()}
                title={dayjs(updatedAt).format("MMM DD, YYYY, h:mm A")}
            >
                {dayjs(updatedAt).fromNow(true)}
            </time>
            <div className="absolute inline-flex items-center gap-px">
                <Button
                    aria-label={label}
                    className={cn(
                        "pointer-fine:pointer-events-none relative size-6 shrink-0 pointer-fine:opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 group-focus-within/thread-item:pointer-events-auto group-focus-within/thread-item:opacity-100 pointer-fine:group-hover/thread-item:pointer-events-auto pointer-fine:group-hover/thread-item:opacity-100",
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
                            className="size-3.5"
                            focusable="false"
                        />
                    ) : (
                        <Archive
                            aria-hidden
                            className="size-3.5"
                            focusable="false"
                        />
                    )}
                </Button>
                {isArchived ? (
                    <Button
                        aria-label={deleteLabel}
                        className="pointer-fine:pointer-events-none relative size-6 shrink-0 pointer-fine:opacity-0 focus-visible:pointer-events-auto focus-visible:opacity-100 group-focus-within/thread-item:pointer-events-auto group-focus-within/thread-item:opacity-100 pointer-fine:group-hover/thread-item:pointer-events-auto pointer-fine:group-hover/thread-item:opacity-100"
                        onClick={onDelete}
                        size="icon-xs"
                        title={deleteLabel}
                        variant="ghost"
                    >
                        <Trash2
                            aria-hidden
                            className="size-3.5"
                            focusable="false"
                        />
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
