"use client";

import { T, Var } from "gt-next";
import { History, MessageCircle } from "lucide-react";
import * as React from "react";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import { Streamdown } from "streamdown";
import { getLastRunDisplay } from "@/components/automations/list";
import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { HighlightIn } from "@/components/ui/highlight-in";
import { ChevronDownFilledIcon } from "@/components/ui/icons";
import {
    PreviewCard,
    PreviewCardPopup,
    PreviewCardTrigger,
} from "@/components/ui/preview-card";
import {
    SidebarGroup,
    SidebarItem,
    SidebarItemValue,
} from "@/components/ui/sidebar";
import { dayjs } from "@/lib/common/dayjs";
import type { AutomationListItem } from "@/lib/intelligence/automations/service";
import { AutomationRunStatus } from "@/prisma/client/enums";

const AUTOMATION_CHATS_OPEN_STORAGE_KEY = "cache:automations:chats-open";
const AUTOMATION_CHATS_MAX = 10;
const AUTOMATION_CHATS_UPDATE_WINDOW_MS = 24 * 60 * 60 * 1000;

type AutomationChatsRun = AutomationListItem["recentRuns"][number];

interface AutomationChatsEntry extends AutomationChatsRun {
    automationTitle: string;
}

interface AutomationChatsContext {
    entries: AutomationChatsEntry[];
}

interface AutomationChatsItemContext {
    display: NonNullable<ReturnType<typeof getLastRunDisplay>>;
    entry: AutomationChatsEntry;
}

const AutomationChatsContext =
    React.createContext<AutomationChatsContext | null>(null);

function useAutomationChatsContext(): AutomationChatsContext {
    const context = React.use(AutomationChatsContext);
    if (!context) {
        throw new Error(
            "AutomationChats compound components must be used within AutomationChats."
        );
    }
    return context;
}

const AutomationChatsItemContext =
    React.createContext<AutomationChatsItemContext | null>(null);

function useAutomationChatsItemContext(): AutomationChatsItemContext {
    const context = React.use(AutomationChatsItemContext);
    if (!context) {
        throw new Error(
            "AutomationChatsItem compound components must be used within AutomationChatsItem."
        );
    }
    return context;
}

const { useStore: useAutomationChatsStore } = createStore({
    isChatsOpen: storage(true, {
        storageKey: AUTOMATION_CHATS_OPEN_STORAGE_KEY,
    }),
});

function toRunCreatedAt(value: Date | string): Date {
    return value instanceof Date ? value : new Date(value);
}

function getRecentAutomationChats(
    automations: AutomationListItem[]
): AutomationChatsEntry[] {
    return automations
        .flatMap((automation) =>
            automation.recentRuns.map((run) => ({
                ...run,
                automationTitle: automation.title,
                createdAt: toRunCreatedAt(run.createdAt),
            }))
        )
        .filter(
            (run) =>
                run.status === AutomationRunStatus.succeeded ||
                run.status === AutomationRunStatus.failed
        )
        .toSorted((left, right) => {
            const diff = right.createdAt.getTime() - left.createdAt.getTime();
            return diff === 0
                ? left.automationTitle.localeCompare(right.automationTitle)
                : diff;
        })
        .slice(0, AUTOMATION_CHATS_MAX);
}

function getRecentChatsUpdateCount(entries: AutomationChatsEntry[]): number {
    const cutoff = Date.now() - AUTOMATION_CHATS_UPDATE_WINDOW_MS;
    return entries.filter((entry) => entry.createdAt.getTime() >= cutoff)
        .length;
}

function getChatsPreviewOutput(entry: AutomationChatsEntry): React.ReactNode {
    if (
        entry.status === AutomationRunStatus.succeeded &&
        entry.summaryMarkdown
    ) {
        return (
            <Streamdown className="text-muted-foreground/60 text-xs leading-5">
                {entry.summaryMarkdown}
            </Streamdown>
        );
    }
    if (entry.status === AutomationRunStatus.failed && entry.errorMessage) {
        return (
            <p className="text-red-400/80 text-xs leading-5">
                {entry.errorMessage}
            </p>
        );
    }
    return null;
}

interface AutomationChatsProps {
    automations: AutomationListItem[];
}

export function AutomationChats({ automations }: AutomationChatsProps) {
    const entries = getRecentAutomationChats(automations);
    const updateCount = getRecentChatsUpdateCount(entries);

    return (
        <AutomationChatsContext value={{ entries }}>
            <AutomationChatsCollapsible
                className="group/collapsible"
                data-sidebar-collapsible=""
            >
                <AutomationChatsTrigger updateCount={updateCount}>
                    <T>Chats</T>
                </AutomationChatsTrigger>
                <AutomationChatsPanel>
                    <AutomationChatsEmpty />
                    <AutomationChatsList>
                        {(entry) => (
                            <AutomationChatsItem entry={entry} key={entry.id}>
                                <AutomationChatsItemTrigger>
                                    <AutomationChatsItemTitle />
                                </AutomationChatsItemTrigger>
                                <AutomationChatsItemPreview />
                            </AutomationChatsItem>
                        )}
                    </AutomationChatsList>
                </AutomationChatsPanel>
            </AutomationChatsCollapsible>
        </AutomationChatsContext>
    );
}

function AutomationChatsCollapsible(
    props: React.ComponentProps<typeof Collapsible>
) {
    const { isChatsOpen, setIsChatsOpen } = useAutomationChatsStore();

    return (
        <Collapsible
            {...props}
            onOpenChange={setIsChatsOpen}
            open={isChatsOpen}
        />
    );
}

function AutomationChatsPanel(
    props: React.ComponentProps<typeof CollapsiblePanel>
) {
    return <CollapsiblePanel {...props} />;
}

interface AutomationChatsTriggerProps
    extends React.ComponentProps<typeof CollapsibleTrigger> {
    updateCount: number;
}

function AutomationChatsTrigger({
    children,
    render,
    updateCount,
    ...props
}: AutomationChatsTriggerProps) {
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

interface AutomationChatsListProps {
    children: (entry: AutomationChatsEntry, index: number) => React.ReactNode;
}

function AutomationChatsList({ children }: AutomationChatsListProps) {
    const { entries } = useAutomationChatsContext();

    return <SidebarGroup>{entries.map(children)}</SidebarGroup>;
}

function AutomationChatsEmpty() {
    const { entries } = useAutomationChatsContext();

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

interface AutomationChatsItemProps extends React.PropsWithChildren {
    entry: AutomationChatsEntry;
}

function AutomationChatsItem({ children, entry }: AutomationChatsItemProps) {
    const display = getLastRunDisplay(entry);

    if (!display) {
        return null;
    }

    return (
        <AutomationChatsItemContext value={{ display, entry }}>
            <PreviewCard>{children}</PreviewCard>
        </AutomationChatsItemContext>
    );
}

function AutomationChatsItemTrigger({ children }: React.PropsWithChildren) {
    return (
        <PreviewCardTrigger
            render={<SidebarItem render={<button type="button" />} />}
        >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted/90">
                <MessageCircle
                    aria-hidden
                    className="size-4"
                    focusable="false"
                />
            </span>
            {children}
        </PreviewCardTrigger>
    );
}

function AutomationChatsItemTitle() {
    const { entry } = useAutomationChatsItemContext();

    return (
        <>
            <SidebarItemValue>{entry.automationTitle}</SidebarItemValue>
            {entry.status === AutomationRunStatus.failed ? (
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
                dateTime={entry.createdAt.toISOString()}
                title={dayjs(entry.createdAt).format("MMM DD, YYYY, h:mm A")}
            >
                {dayjs(entry.createdAt).fromNow(true)}
            </time>
        </>
    );
}

function AutomationChatsItemPreview() {
    const { entry } = useAutomationChatsItemContext();
    const output = getChatsPreviewOutput(entry);

    return (
        <PreviewCardPopup align="start" className="p-3" side="right">
            <div className="text-foreground text-xs leading-snug">
                {output ?? (
                    <p className="text-muted-foreground">
                        <T>No output recorded.</T>
                    </p>
                )}
            </div>
        </PreviewCardPopup>
    );
}
