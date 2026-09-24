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

const DEFAULT_WEEK_DAY = 1;
const DEFAULT_CADENCE = "weekly";
const WEEK_DAY_LABELS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
] as const;

type AutomationTemplateKey = NonNullable<AutomationListItem["templateKey"]>;

type AutomationTemplateDefinition =
    (typeof AUTOMATION_TEMPLATE_DEFINITIONS)[number];

type AutomationRunStatus = AutomationListItem["recentRuns"][number]["status"];

const TEMPLATE_ICON: Record<AutomationTemplateKey, LucideIcon> = {
    daily_digest: CalendarClock,
    next_actions: ListTodo,
    worth_revisiting: History,
};

const TEMPLATE_DEFINITION_BY_KEY = new Map<
    AutomationTemplateKey,
    AutomationTemplateDefinition
>(
    AUTOMATION_TEMPLATE_DEFINITIONS.map(
        (definition): [AutomationTemplateKey, AutomationTemplateDefinition] => [
            definition.templateKey,
            definition,
        ]
    )
);

const RUN_LABEL_BY_STATUS: Record<AutomationRunStatus, string | null> = {
    canceled: "Canceled",
    failed: "Failed",
    pending: null,
    running: null,
    skipped: "Skipped",
    starting: null,
    succeeded: "Last ran",
};

function getAutomationTemplateIcon(
    templateKey: AutomationListItem["templateKey"]
) {
    if (!templateKey) {
        return Zap;
    }
    return TEMPLATE_ICON[templateKey];
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
    const definition = automation.templateKey
        ? TEMPLATE_DEFINITION_BY_KEY.get(automation.templateKey)
        : undefined;
    return definition?.summary ?? automation.prompt;
}

function getTemplateDefaultCadence(
    templateKey: AutomationListItem["templateKey"]
) {
    if (!templateKey) {
        return;
    }
    return TEMPLATE_DEFINITION_BY_KEY.get(templateKey)?.cadence;
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
    if (!automation.cadence) {
        return false;
    }
    if (!automation.timezone) {
        return false;
    }
    if (automation.timeOfDayMinutes === null) {
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

function getLastRunLabel(
    lastRun: NonNullable<AutomationListItem["lastRun"]>
): string | null {
    const label = RUN_LABEL_BY_STATUS[lastRun.status];
    if (!label) {
        return null;
    }
    return `${label} ${dayjs(lastRun.createdAt).fromNow()}`;
}

function isTerminalRun(run: AutomationListItem["recentRuns"][number]): boolean {
    return RUN_LABEL_BY_STATUS[run.status] !== null;
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

    if (automations.length === 0) {
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
    const lastTerminalRun = automation.recentRuns.find(isTerminalRun);
    const lastRunLabel = lastTerminalRun
        ? getLastRunLabel(lastTerminalRun)
        : null;

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
                <div className="flex items-center gap-4">
                    {scheduleLabel ? (
                        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                            {scheduleLabel}
                        </p>
                    ) : null}
                    {lastRunLabel ? (
                        <span className="text-[11px] text-muted-foreground/60">
                            {lastRunLabel}
                        </span>
                    ) : null}
                </div>
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
