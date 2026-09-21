"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T } from "gt-next";
import {
    CalendarClock,
    Ellipsis,
    History,
    ListTodo,
    type LucideIcon,
    Pause,
    Pencil,
    Play,
    Trash2,
    Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import {
    type AutomationCollectionOption,
    type AutomationComposerAutomation,
    AutomationComposerDialog,
} from "@/components/automations/composer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Menu,
    MenuItem,
    MenuPopup,
    MenuSeparator,
    MenuTrigger,
} from "@/components/ui/menu";
import { getOrCreateChatForAutomationRun } from "@/lib/chats/actions";
import { getMonthDayLabel } from "@/lib/common/date";
import { dayjs } from "@/lib/common/dayjs";
import {
    DEFAULT_TIME_OF_DAY_MINUTES,
    formatTimeOfDayMinutes,
} from "@/lib/common/time";
import {
    deleteAutomation,
    pauseAutomation,
    resumeAutomation,
} from "@/lib/intelligence/automations/actions";
import { AUTOMATION_TEMPLATE_DEFINITIONS } from "@/lib/intelligence/automations/constants";
import type { AutomationListItem } from "@/lib/intelligence/automations/service";
import { AutomationRunStatus } from "@/prisma/client/enums";

const TEMPLATE_ICON: Record<string, LucideIcon> = {
    daily_digest: CalendarClock,
    next_actions: ListTodo,
    worth_revisiting: History,
};

const TEMPLATE_SUMMARY = Object.fromEntries(
    AUTOMATION_TEMPLATE_DEFINITIONS.map((definition) => [
        definition.templateKey,
        definition.summary,
    ])
) as Record<string, string>;

const DEFAULT_WEEK_DAY = 1;
const DEFAULT_CADENCE = "weekly" as const;
const WEEK_DAY_LABELS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
] as const;

function getAutomationTemplateIcon(
    templateKey: AutomationListItem["templateKey"]
) {
    if (templateKey) {
        const icon = TEMPLATE_ICON[templateKey];
        if (icon) {
            return icon;
        }
    }
    return Zap;
}

function toComposerAutomation(
    automation: AutomationListItem
): AutomationComposerAutomation {
    return {
        cadence:
            automation.cadence ??
            getTemplateDefaultCadence(automation.templateKey) ??
            DEFAULT_CADENCE,
        collectionId: automation.collectionId ?? undefined,
        id: automation.id,
        monthDay: automation.monthDay ?? undefined,
        payloadScope: automation.payloadScope,
        prompt: automation.prompt,
        status: automation.status,
        timeOfDayMinutes:
            automation.timeOfDayMinutes ?? DEFAULT_TIME_OF_DAY_MINUTES,
        timezone:
            automation.timezone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone,
        title: automation.title,
        weekDay: automation.weekDay ?? DEFAULT_WEEK_DAY,
    };
}

function getAutomationDescription(automation: AutomationListItem) {
    if (automation.templateKey) {
        const summary = TEMPLATE_SUMMARY[automation.templateKey];
        if (summary) {
            return summary;
        }
    }
    return automation.prompt;
}

function getTemplateDefaultCadence(
    templateKey: AutomationListItem["templateKey"]
) {
    if (!templateKey) {
        return;
    }
    return AUTOMATION_TEMPLATE_DEFINITIONS.find(
        (definition) => definition.templateKey === templateKey
    )?.cadence;
}

function formatSchedule(automation: AutomationListItem): string | null {
    if (!isCompleteSchedule(automation)) {
        return null;
    }

    const time = formatTimeOfDayMinutes(automation.timeOfDayMinutes);

    if (automation.cadence === "weekly") {
        const weekDayLabel =
            automation.weekDay === null
                ? null
                : WEEK_DAY_LABELS[automation.weekDay];
        if (weekDayLabel) {
            return `${weekDayLabel}s at ${time}`;
        }
        return `Weekly at ${time}`;
    }

    if (automation.cadence === "monthly") {
        if (automation.monthDay) {
            return `Monthly on the ${getMonthDayLabel(automation.monthDay)} at ${time}`;
        }
        return `Monthly at ${time}`;
    }

    return `Daily at ${time}`;
}

function isCompleteSchedule(
    automation: AutomationListItem
): automation is AutomationListItem & {
    cadence: NonNullable<AutomationListItem["cadence"]>;
    timeOfDayMinutes: number;
    timezone: string;
} {
    if (
        !(
            automation.cadence &&
            automation.timezone &&
            automation.timeOfDayMinutes !== null
        )
    ) {
        return false;
    }
    if (automation.cadence === "weekly" && automation.weekDay === null) {
        return false;
    }
    if (automation.cadence === "monthly" && automation.monthDay === null) {
        return false;
    }
    return true;
}

function isSuggestedAutomation(automation: AutomationListItem) {
    return (
        automation.templateKey !== null &&
        automation.status === "paused" &&
        !isCompleteSchedule(automation)
    );
}

export function getLastRunDisplay(
    lastRun: NonNullable<AutomationListItem["lastRun"]>
): {
    dotColor: string;
    label: string;
} | null {
    if (lastRun.status === AutomationRunStatus.succeeded) {
        return {
            dotColor: "bg-green-500",
            label: `Ran ${dayjs(lastRun.createdAt).fromNow()}`,
        };
    }
    if (lastRun.status === AutomationRunStatus.failed) {
        return {
            dotColor: "bg-red-500",
            label: `Failed ${dayjs(lastRun.createdAt).fromNow()}`,
        };
    }
    if (
        lastRun.status === AutomationRunStatus.skipped ||
        lastRun.status === AutomationRunStatus.canceled
    ) {
        return {
            dotColor: "bg-gray-400",
            label: `${
                lastRun.status === AutomationRunStatus.skipped
                    ? "Skipped"
                    : "Canceled"
            } ${dayjs(lastRun.createdAt).fromNow()}`,
        };
    }

    return null;
}

function isTerminalRun(run: AutomationListItem["recentRuns"][number]): boolean {
    return (
        run.status === AutomationRunStatus.succeeded ||
        run.status === AutomationRunStatus.failed ||
        run.status === AutomationRunStatus.skipped ||
        run.status === AutomationRunStatus.canceled
    );
}

interface AutomationsListProps {
    automations: AutomationListItem[];
    collections: AutomationCollectionOption[];
}

export function AutomationsList({
    automations,
    collections,
}: AutomationsListProps) {
    const configuredAutomations = automations.filter(
        (automation) => !isSuggestedAutomation(automation)
    );
    const suggestedAutomations = automations.filter(isSuggestedAutomation);

    if (
        configuredAutomations.length === 0 &&
        suggestedAutomations.length === 0
    ) {
        return (
            <section className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-muted/50 p-8 text-center">
                <Zap
                    aria-hidden
                    className="size-5 text-muted-foreground"
                    focusable="false"
                />
                <div className="flex flex-col gap-1">
                    <h2 className="font-medium text-foreground text-sm">
                        <T>No automations yet</T>
                    </h2>
                    <p className="max-w-sm text-muted-foreground text-sm leading-6">
                        <T>
                            Create one to summarize or organize saved content on
                            a schedule.
                        </T>
                    </p>
                </div>
            </section>
        );
    }

    return (
        <div className="flex flex-col gap-8">
            {configuredAutomations.length > 0 ? (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {configuredAutomations.map((automation) => (
                        <AutomationCard
                            automation={automation}
                            collections={collections}
                            key={automation.id}
                        />
                    ))}
                </section>
            ) : null}

            {suggestedAutomations.length > 0 ? (
                <section className="flex flex-col gap-3">
                    <h2 className="font-medium text-muted-foreground text-sm">
                        <T>Suggested</T>
                    </h2>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {suggestedAutomations.map((automation) => (
                            <SuggestedAutomationCard
                                automation={automation}
                                collections={collections}
                                key={automation.id}
                            />
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}

interface AutomationCardProps {
    automation: AutomationListItem;
    collections: AutomationCollectionOption[];
}

function AutomationCard({ automation, collections }: AutomationCardProps) {
    const router = useRouter();
    const [isPending, startTransition] = React.useTransition();
    const [isEditOpen, setIsEditOpen] = React.useState(false);
    const [actionErrorMessage, setActionErrorMessage] = React.useState<
        string | null
    >(null);

    const isActive = automation.status === "active";
    const canDelete = !isActive;
    const canResume = !isActive && isCompleteSchedule(automation);
    const Icon = getAutomationTemplateIcon(automation.templateKey);
    const description = getAutomationDescription(automation);
    const scheduleLabel = formatSchedule(automation);
    const terminalRuns = automation.recentRuns.filter(isTerminalRun);

    const handleEditOpen = useStableCallback(() => {
        setIsEditOpen(true);
    });

    const handlePause = useStableCallback(() => {
        setActionErrorMessage(null);
        startTransition(async () => {
            const result = await pauseAutomation({
                automationId: automation.id,
            });
            if (result.status !== "SUCCESS") {
                setActionErrorMessage(result.message);
                return;
            }
            router.refresh();
        });
    });

    const handleResume = useStableCallback(() => {
        if (!isCompleteSchedule(automation)) {
            return;
        }
        setActionErrorMessage(null);
        startTransition(async () => {
            const result = await resumeAutomation({
                automationId: automation.id,
                schedule: {
                    cadence: automation.cadence,
                    monthDay: automation.monthDay,
                    timeOfDayMinutes: automation.timeOfDayMinutes,
                    timezone: automation.timezone,
                    weekDay: automation.weekDay,
                },
            });
            if (result.status !== "SUCCESS") {
                setActionErrorMessage(result.message);
                return;
            }
            router.refresh();
        });
    });

    const handleEnableOrResume = useStableCallback(() => {
        if (canResume) {
            handleResume();
            return;
        }
        handleEditOpen();
    });

    const handleDelete = useStableCallback(() => {
        if (!canDelete) {
            return;
        }
        setActionErrorMessage(null);
        startTransition(async () => {
            const result = await deleteAutomation({
                automationId: automation.id,
            });
            if (result.status !== "SUCCESS") {
                setActionErrorMessage(result.message);
                return;
            }
            router.refresh();
        });
    });

    const handleOpenRunChat = useStableCallback((runId: string) => {
        setActionErrorMessage(null);
        startTransition(async () => {
            const result = await getOrCreateChatForAutomationRun({ runId });
            if (result.status !== "SUCCESS") {
                setActionErrorMessage(result.message);
                return;
            }
            router.push(`/chats/${result.chatId}`);
        });
    });

    return (
        <article className="group relative flex flex-col gap-3 rounded-2xl bg-muted/60 p-4">
            <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-xs/5">
                    <Icon aria-hidden className="size-4" focusable="false" />
                </span>
                <Menu>
                    <MenuTrigger
                        render={
                            <Button
                                aria-label={`Actions for ${automation.title}`}
                                className="rounded-full text-muted-foreground"
                                disabled={isPending}
                                size="icon-xs"
                                variant="ghost"
                            />
                        }
                    >
                        <Ellipsis
                            aria-hidden
                            className="size-4"
                            focusable="false"
                        />
                    </MenuTrigger>
                    <MenuPopup align="end" className="min-w-40">
                        <MenuItem onClick={handleEditOpen}>
                            <Pencil
                                aria-hidden
                                className="size-4 text-muted-foreground"
                                focusable="false"
                            />
                            Edit
                        </MenuItem>
                        {isActive ? (
                            <MenuItem
                                disabled={isPending}
                                onClick={handlePause}
                            >
                                <Pause
                                    aria-hidden
                                    className="size-4 text-muted-foreground"
                                    focusable="false"
                                />
                                Pause
                            </MenuItem>
                        ) : (
                            <MenuItem
                                disabled={isPending}
                                onClick={handleEnableOrResume}
                            >
                                <Play
                                    aria-hidden
                                    className="size-4 text-muted-foreground"
                                    focusable="false"
                                />
                                {canResume ? "Resume" : "Enable"}
                            </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem
                            disabled={isPending || !canDelete}
                            onClick={canDelete ? handleDelete : undefined}
                            variant="destructive"
                        >
                            <Trash2
                                aria-hidden
                                className="size-4"
                                focusable="false"
                            />
                            Delete
                        </MenuItem>
                    </MenuPopup>
                </Menu>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate font-medium text-foreground text-sm">
                        {automation.title}
                    </h2>
                    {isActive ? null : (
                        <Badge variant="secondary">Paused</Badge>
                    )}
                </div>
                <p className="line-clamp-2 text-muted-foreground text-xs leading-5">
                    {description}
                </p>
                {scheduleLabel ? (
                    <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                        {scheduleLabel}
                    </p>
                ) : null}
                <AutomationRunHistory
                    isPending={isPending}
                    onOpenChat={handleOpenRunChat}
                    runs={terminalRuns}
                />
                {actionErrorMessage ? (
                    <p
                        aria-live="polite"
                        className="mt-1 text-destructive text-xs leading-5"
                        role="status"
                    >
                        {actionErrorMessage}
                    </p>
                ) : null}
            </div>
            <AutomationComposerDialog
                automation={toComposerAutomation(automation)}
                collections={collections}
                onOpenChange={setIsEditOpen}
                open={isEditOpen}
                trigger={null}
            />
        </article>
    );
}

function SuggestedAutomationCard({
    automation,
    collections,
}: AutomationCardProps) {
    const Icon = getAutomationTemplateIcon(automation.templateKey);
    const description = getAutomationDescription(automation);

    return (
        <article className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-4">
            <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-xs/5">
                    <Icon aria-hidden className="size-4" focusable="false" />
                </span>
                <AutomationComposerDialog
                    automation={toComposerAutomation(automation)}
                    collections={collections}
                    trigger={
                        <Button
                            className="rounded-full"
                            size="xs"
                            variant="outline"
                        />
                    }
                >
                    Add
                </AutomationComposerDialog>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
                <h2 className="truncate font-medium text-foreground text-sm">
                    {automation.title}
                </h2>
                <p className="line-clamp-2 text-muted-foreground text-xs leading-5">
                    {description}
                </p>
            </div>
        </article>
    );
}

interface AutomationRunHistoryProps {
    isPending: boolean;
    onOpenChat: (runId: string) => void;
    runs: AutomationListItem["recentRuns"];
}

function AutomationRunHistory({
    isPending,
    onOpenChat,
    runs,
}: AutomationRunHistoryProps) {
    if (runs.length === 0) {
        return null;
    }

    return (
        <ul className="mt-1 flex flex-col gap-px border-border/40 border-t pt-2">
            {runs.map((run) => (
                <AutomationRunRow
                    isPending={isPending}
                    key={run.id}
                    onOpenChat={onOpenChat}
                    run={run}
                />
            ))}
        </ul>
    );
}

interface AutomationRunRowProps {
    isPending: boolean;
    onOpenChat: (runId: string) => void;
    run: AutomationListItem["recentRuns"][number];
}

function AutomationRunRow({
    isPending,
    onOpenChat,
    run,
}: AutomationRunRowProps) {
    const handleOpen = useStableCallback(() => {
        onOpenChat(run.id);
    });

    const display = getLastRunDisplay(run);
    if (!display) {
        return null;
    }
    const title = dayjs(run.createdAt).format("MMM DD, YYYY, h:mm A");
    const content = (
        <>
            <span
                aria-hidden
                className={`size-1.5 shrink-0 rounded-full ${display.dotColor}`}
            />
            <span className="truncate">{display.label}</span>
        </>
    );
    const className =
        "flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-[11px] text-muted-foreground/80 tabular-nums transition-colors hover:bg-background hover:text-foreground disabled:opacity-60";
    if (run.chat) {
        return (
            <li>
                <Link
                    className={className}
                    href={`/chats/${run.chat.id}`}
                    title={title}
                >
                    {content}
                </Link>
            </li>
        );
    }
    return (
        <li>
            <button
                className={className}
                disabled={isPending}
                onClick={handleOpen}
                title={title}
                type="button"
            >
                {content}
            </button>
        </li>
    );
}
