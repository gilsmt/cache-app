"use client";

import { Calligraph } from "calligraph";
import { T, Var } from "gt-next";
import { History } from "lucide-react";
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

const AUTOMATION_ACTIVITY_OPEN_STORAGE_KEY = "cache:automations:activity-open";
const AUTOMATION_ACTIVITY_MAX = 10;
const AUTOMATION_ACTIVITY_UPDATE_WINDOW_MS = 24 * 60 * 60 * 1000;

type AutomationActivityRun = AutomationListItem["recentRuns"][number];

interface AutomationActivityEntry extends AutomationActivityRun {
    automationTitle: string;
}

interface AutomationActivityContext {
    entries: AutomationActivityEntry[];
}

interface AutomationActivityItemContext {
    display: NonNullable<ReturnType<typeof getLastRunDisplay>>;
    entry: AutomationActivityEntry;
}

const AutomationActivityContext =
    React.createContext<AutomationActivityContext | null>(null);

function useAutomationActivityContext(): AutomationActivityContext {
    const context = React.use(AutomationActivityContext);
    if (!context) {
        throw new Error(
            "AutomationActivity compound components must be used within AutomationActivity."
        );
    }
    return context;
}

const AutomationActivityItemContext =
    React.createContext<AutomationActivityItemContext | null>(null);

function useAutomationActivityItemContext(): AutomationActivityItemContext {
    const context = React.use(AutomationActivityItemContext);
    if (!context) {
        throw new Error(
            "AutomationActivityItem compound components must be used within AutomationActivityItem."
        );
    }
    return context;
}

const { useStore: useAutomationActivityStore } = createStore({
    isActivityOpen: storage(true, {
        storageKey: AUTOMATION_ACTIVITY_OPEN_STORAGE_KEY,
    }),
});

function getRecentAutomationActivity(
    automations: AutomationListItem[]
): AutomationActivityEntry[] {
    return automations
        .flatMap((automation) =>
            automation.recentRuns.map((run) => ({
                ...run,
                automationTitle: automation.title,
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
        .slice(0, AUTOMATION_ACTIVITY_MAX);
}

function getRecentActivityUpdateCount(
    entries: AutomationActivityEntry[]
): number {
    const cutoff = Date.now() - AUTOMATION_ACTIVITY_UPDATE_WINDOW_MS;
    return entries.filter((entry) => entry.createdAt.getTime() >= cutoff)
        .length;
}

function getActivityPreviewOutput(
    entry: AutomationActivityEntry
): React.ReactNode {
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

interface AutomationActivityProps {
    automations: AutomationListItem[];
}

export function AutomationActivity({ automations }: AutomationActivityProps) {
    const entries = getRecentAutomationActivity(automations);
    const updateCount = getRecentActivityUpdateCount(entries);

    return (
        <AutomationActivityContext value={{ entries }}>
            <AutomationActivityCollapsible
                className="group/collapsible"
                data-sidebar-collapsible=""
            >
                <AutomationActivityTrigger
                    count={entries.length}
                    updateCount={updateCount}
                >
                    <T>Activity</T>
                </AutomationActivityTrigger>
                <AutomationActivityPanel>
                    <AutomationActivityEmpty />
                    <AutomationActivityList>
                        {(entry) => (
                            <AutomationActivityItem
                                entry={entry}
                                key={entry.id}
                            >
                                <AutomationActivityItemTrigger>
                                    <AutomationActivityItemTitle />
                                </AutomationActivityItemTrigger>
                                <AutomationActivityItemPreview />
                            </AutomationActivityItem>
                        )}
                    </AutomationActivityList>
                </AutomationActivityPanel>
            </AutomationActivityCollapsible>
        </AutomationActivityContext>
    );
}

function AutomationActivityCollapsible(
    props: React.ComponentProps<typeof Collapsible>
) {
    const { isActivityOpen, setIsActivityOpen } = useAutomationActivityStore();

    return (
        <Collapsible
            {...props}
            onOpenChange={setIsActivityOpen}
            open={isActivityOpen}
        />
    );
}

function AutomationActivityPanel(
    props: React.ComponentProps<typeof CollapsiblePanel>
) {
    return <CollapsiblePanel {...props} />;
}

interface AutomationActivityTriggerProps
    extends React.ComponentProps<typeof CollapsibleTrigger> {
    count: number;
    updateCount: number;
}

function AutomationActivityTrigger({
    children,
    count,
    render,
    updateCount,
    ...props
}: AutomationActivityTriggerProps) {
    return (
        <CollapsibleTrigger
            {...props}
            render={render ?? <SidebarItem render={<button type="button" />} />}
        >
            <span className="min-w-0 text-xs">
                {children}&nbsp;
                <Calligraph className="mx-0.5 opacity-80">{count}</Calligraph>
            </span>
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

interface AutomationActivityListProps {
    children: (
        entry: AutomationActivityEntry,
        index: number
    ) => React.ReactNode;
}

function AutomationActivityList({ children }: AutomationActivityListProps) {
    const { entries } = useAutomationActivityContext();

    return <SidebarGroup>{entries.map(children)}</SidebarGroup>;
}

function AutomationActivityEmpty() {
    const { entries } = useAutomationActivityContext();

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
                <T>No activity yet.</T>
            </p>
            <p className="text-[11px] text-muted-foreground/70 leading-tight">
                <T>Outputs will appear here after your automations run.</T>
            </p>
        </div>
    );
}

interface AutomationActivityItemProps extends React.PropsWithChildren {
    entry: AutomationActivityEntry;
}

function AutomationActivityItem({
    children,
    entry,
}: AutomationActivityItemProps) {
    const display = getLastRunDisplay(entry);

    if (!display) {
        return null;
    }

    return (
        <AutomationActivityItemContext value={{ display, entry }}>
            <PreviewCard>{children}</PreviewCard>
        </AutomationActivityItemContext>
    );
}

function AutomationActivityItemTrigger({ children }: React.PropsWithChildren) {
    return (
        <PreviewCardTrigger
            render={<SidebarItem render={<button type="button" />} />}
        >
            {children}
        </PreviewCardTrigger>
    );
}

function AutomationActivityItemTitle() {
    const { entry } = useAutomationActivityItemContext();

    return (
        <>
            {entry.status === AutomationRunStatus.succeeded ? (
                <span className="sr-only">
                    <T>Succeeded</T>,&nbsp;
                </span>
            ) : null}
            <SidebarItemValue>{entry.automationTitle}</SidebarItemValue>
            {entry.status === AutomationRunStatus.failed ? (
                <span
                    className="shrink-0 text-[11px] text-muted-foreground/60"
                    data-sidebar-collapsible=""
                >
                    <T>Failed</T>
                </span>
            ) : null}
            <time
                className="shrink-0 text-[11px] text-muted-foreground/60 tabular-nums"
                data-sidebar-collapsible=""
                dateTime={entry.createdAt.toISOString()}
                title={dayjs(entry.createdAt).format("MMM DD, YYYY, h:mm A")}
            >
                {dayjs(entry.createdAt).fromNow(true)}
            </time>
        </>
    );
}

function AutomationActivityItemPreview() {
    const { display, entry } = useAutomationActivityItemContext();
    const output = getActivityPreviewOutput(entry);

    return (
        <PreviewCardPopup
            align="start"
            className="max-h-80 overflow-y-auto p-3"
            positionMethod="fixed"
            side="right"
        >
            <p className="font-medium text-xs leading-tight">
                {entry.automationTitle}
            </p>
            <p className="text-[11px] text-muted-foreground/60">
                {display.label}
            </p>
            <div className="mt-2 text-xs leading-snug">
                {output ?? (
                    <p className="text-muted-foreground">
                        <T>No output recorded.</T>
                    </p>
                )}
            </div>
        </PreviewCardPopup>
    );
}
