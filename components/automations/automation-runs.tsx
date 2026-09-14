"use client";

import { Calligraph } from "calligraph";
import { T, Var } from "gt-next";
import { History } from "lucide-react";
import * as React from "react";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import { Streamdown } from "streamdown";
import { getLastRunDisplay } from "@/components/automations/automations";
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

const AUTOMATIONS_RUNS_OPEN_STORAGE_KEY = "cache:automations:runs-open";
const AUTOMATION_RECENT_RUNS_MAX = 10;
const AUTOMATION_UPDATE_WINDOW_MS = 24 * 60 * 60 * 1000;

type AutomationRunListItem = AutomationListItem["recentRuns"][number];

interface AutomationRecentRun extends AutomationRunListItem {
    automationTitle: string;
}

interface AutomationsRunsContext {
    runs: AutomationRecentRun[];
}

interface AutomationsRunsItemContext {
    display: NonNullable<ReturnType<typeof getLastRunDisplay>>;
    run: AutomationRecentRun;
}

const { useStore: useAutomationsRunsStore } = createStore({
    isRunsOpen: storage(true, {
        storageKey: AUTOMATIONS_RUNS_OPEN_STORAGE_KEY,
    }),
});

const AutomationsRunsContext =
    React.createContext<AutomationsRunsContext | null>(null);

function useAutomationsRunsContext(): AutomationsRunsContext {
    const context = React.use(AutomationsRunsContext);
    if (!context) {
        throw new Error(
            "Automations runs components must be used within AutomationsRuns."
        );
    }
    return context;
}

const AutomationsRunsItemContext =
    React.createContext<AutomationsRunsItemContext | null>(null);

function useAutomationsRunsItemContext(): AutomationsRunsItemContext {
    const context = React.use(AutomationsRunsItemContext);
    if (!context) {
        throw new Error(
            "AutomationsRunsItem compound components must be used within AutomationsRunsItem."
        );
    }
    return context;
}

function getRecentAutomationRuns(
    automations: AutomationListItem[]
): AutomationRecentRun[] {
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
        .slice(0, AUTOMATION_RECENT_RUNS_MAX);
}

function getRecentUpdateCount(runs: AutomationRecentRun[]): number {
    const cutoff = Date.now() - AUTOMATION_UPDATE_WINDOW_MS;
    return runs.filter((run) => run.createdAt.getTime() >= cutoff).length;
}

interface AutomationsRunsProps {
    automations: AutomationListItem[];
}

export function AutomationsRuns({ automations }: AutomationsRunsProps) {
    const runs = getRecentAutomationRuns(automations);
    const updateCount = getRecentUpdateCount(runs);

    return (
        <AutomationsRunsContext value={{ runs }}>
            <AutomationsRunsList
                className="group/collapsible"
                data-sidebar-collapsible=""
            >
                <AutomationsRunsTrigger
                    count={runs.length}
                    updateCount={updateCount}
                >
                    <T>Recents</T>
                </AutomationsRunsTrigger>
                <AutomationsRunsPanel>
                    <AutomationsRunsEmpty />
                    <AutomationsRunsContent>
                        {(run) => (
                            <AutomationsRunsItem key={run.id} run={run}>
                                <AutomationsRunsItemTrigger>
                                    <AutomationsRunsItemValue />
                                </AutomationsRunsItemTrigger>
                                <AutomationsRunsItemPreview />
                            </AutomationsRunsItem>
                        )}
                    </AutomationsRunsContent>
                </AutomationsRunsPanel>
            </AutomationsRunsList>
        </AutomationsRunsContext>
    );
}

function AutomationsRunsList(props: React.ComponentProps<typeof Collapsible>) {
    const { isRunsOpen, setIsRunsOpen } = useAutomationsRunsStore();

    return (
        <Collapsible
            {...props}
            onOpenChange={setIsRunsOpen}
            open={isRunsOpen}
        />
    );
}

function AutomationsRunsPanel(
    props: React.ComponentProps<typeof CollapsiblePanel>
) {
    return <CollapsiblePanel {...props} />;
}

interface AutomationsRunsTriggerProps
    extends React.ComponentProps<typeof CollapsibleTrigger> {
    count: number;
    updateCount: number;
}

function AutomationsRunsTrigger({
    children,
    count,
    render,
    updateCount,
    ...props
}: AutomationsRunsTriggerProps) {
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

interface AutomationsRunsContentProps {
    children: (run: AutomationRecentRun, index: number) => React.ReactNode;
}

function AutomationsRunsContent({ children }: AutomationsRunsContentProps) {
    const { runs } = useAutomationsRunsContext();

    return <SidebarGroup>{runs.map(children)}</SidebarGroup>;
}

function AutomationsRunsEmpty() {
    const { runs } = useAutomationsRunsContext();

    if (runs.length > 0) {
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
                <T>No runs yet.</T>
            </p>
            <p className="text-[11px] text-muted-foreground/70 leading-tight">
                <T>Run outputs will appear here after your automations run.</T>
            </p>
        </div>
    );
}

interface AutomationsRunsItemProps extends React.PropsWithChildren {
    run: AutomationRecentRun;
}

function AutomationsRunsItem({ children, run }: AutomationsRunsItemProps) {
    const display = getLastRunDisplay(run);

    if (!display) {
        return null;
    }

    return (
        <AutomationsRunsItemContext value={{ display, run }}>
            <PreviewCard>{children}</PreviewCard>
        </AutomationsRunsItemContext>
    );
}

function AutomationsRunsItemTrigger({ children }: React.PropsWithChildren) {
    return (
        <PreviewCardTrigger
            render={<SidebarItem render={<button type="button" />} />}
        >
            {children}
        </PreviewCardTrigger>
    );
}

function AutomationsRunsItemValue() {
    const { run } = useAutomationsRunsItemContext();

    return (
        <>
            {run.status === AutomationRunStatus.succeeded ? (
                <span className="sr-only">
                    <T>Succeeded</T>,&nbsp;
                </span>
            ) : null}
            <SidebarItemValue>{run.automationTitle}</SidebarItemValue>
            {run.status === AutomationRunStatus.failed ? (
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
                dateTime={run.createdAt.toISOString()}
                title={dayjs(run.createdAt).format("MMM DD, YYYY, h:mm A")}
            >
                {dayjs(run.createdAt).fromNow(true)}
            </time>
        </>
    );
}

function AutomationsRunsItemPreview() {
    const { display, run } = useAutomationsRunsItemContext();
    const output = getRunPreviewOutput(run);

    return (
        <PreviewCardPopup
            align="start"
            className="max-h-80 overflow-y-auto p-3"
            positionMethod="fixed"
            side="right"
        >
            <p className="font-medium text-xs leading-tight">
                {run.automationTitle}
            </p>
            <p className="text-[11px] text-muted-foreground/60">
                {display.label}
            </p>
            <div className="mt-2 text-xs leading-snug">
                {output ?? (
                    <p className="text-muted-foreground">
                        <T>No output recorded for this run.</T>
                    </p>
                )}
            </div>
        </PreviewCardPopup>
    );
}

function getRunPreviewOutput(run: AutomationRecentRun): React.ReactNode {
    if (run.status === AutomationRunStatus.succeeded && run.summaryMarkdown) {
        return (
            <Streamdown className="text-muted-foreground/60 text-xs leading-5">
                {run.summaryMarkdown}
            </Streamdown>
        );
    }
    if (run.status === AutomationRunStatus.failed && run.errorMessage) {
        return (
            <p className="text-red-400/80 text-xs leading-5">
                {run.errorMessage}
            </p>
        );
    }
    return null;
}
