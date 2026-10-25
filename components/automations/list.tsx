"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T } from "gt-next";
import {
    Activity,
    AlarmClock,
    CalendarClock,
    CalendarRange,
    Copy,
    Ellipsis,
    FileSearch,
    GraduationCap,
    History,
    Inbox,
    ListTodo,
    type LucideIcon,
    MessageCircleQuestion,
    Newspaper,
    NotebookText,
    Pause,
    Pencil,
    Play,
    Scale,
    Trash2,
    Waypoints,
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
import { ErrorMessage } from "@/components/ui/error-message";
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
    type AutomationActionResult,
    deleteAutomation,
    pauseAutomation,
    resumeAutomation,
} from "@/lib/session/automations/actions";
import {
    AUTOMATION_TEMPLATE_DEFINITIONS,
    type AutomationTemplate,
} from "@/lib/session/automations/constants";
import type { AutomationListItem } from "@/lib/session/automations/service";

const DEFAULT_WEEK_DAY = 1;
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

type AutomationRunStatus = AutomationListItem["recentRuns"][number]["status"];

interface AutomationSchedule {
    cadence: NonNullable<AutomationListItem["cadence"]>;
    timeOfDayMinutes: number;
    timezone: string;
}

type AutomationMutationResult =
    | AutomationActionResult
    | Awaited<ReturnType<typeof deleteAutomation>>;

const TEMPLATE_ICON: Record<AutomationTemplateKey, LucideIcon> = {
    collection_brief: NotebookText,
    collection_health: Activity,
    daily_digest: CalendarClock,
    decision_memo: Scale,
    duplicate_radar: Copy,
    expiring_soon: AlarmClock,
    learning_path: GraduationCap,
    monthly_recap: CalendarRange,
    next_actions: ListTodo,
    open_questions: MessageCircleQuestion,
    research_digest: FileSearch,
    story_follow_up: Newspaper,
    theme_thread: Waypoints,
    unsorted_triage: Inbox,
    worth_revisiting: History,
};

const RUN_LABEL_BY_STATUS: Record<AutomationRunStatus, string | null> = {
    canceled: "Canceled",
    failed: "Failed",
    pending: null,
    running: null,
    skipped: "Skipped",
    starting: null,
    succeeded: "Last ran",
};

interface AutomationsListContext {
    automations: AutomationListItem[];
    collections: AutomationCollectionOption[];
    suggestions: readonly AutomationTemplate[];
}

const AutomationsListContext =
    React.createContext<AutomationsListContext | null>(null);

function useAutomationsListContext(): AutomationsListContext {
    const context = React.use(AutomationsListContext);
    if (!context) {
        throw new Error(
            "AutomationsList compound components must be used within AutomationsList."
        );
    }
    return context;
}

function getTemplateDefinition(templateKey: AutomationListItem["templateKey"]) {
    if (!templateKey) {
        return;
    }
    return AUTOMATION_TEMPLATE_DEFINITIONS[templateKey];
}

function getAutomationTemplateIcon(
    templateKey: AutomationListItem["templateKey"]
) {
    if (!templateKey) {
        return Zap;
    }
    const icon: LucideIcon | undefined = TEMPLATE_ICON[templateKey];
    return icon ?? Zap;
}

function toComposerAutomation(
    automation: AutomationListItem
): AutomationComposerAutomation {
    return {
        cadence:
            automation.cadence ??
            getTemplateDefinition(automation.templateKey)?.defaultCadence ??
            "weekly",
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

function toComposerTemplate(
    template: AutomationTemplate
): AutomationComposerAutomation {
    return {
        cadence: template.defaultCadence,
        payloadScope: "all_library_items",
        prompt: template.prompt,
        status: "paused",
        templateKey: template.templateKey,
        timeOfDayMinutes: DEFAULT_TIME_OF_DAY_MINUTES,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        title: template.title,
    };
}

function getAutomationDescription(automation: AutomationListItem) {
    return (
        getTemplateDefinition(automation.templateKey)?.summary ??
        automation.prompt
    );
}

function formatSchedule(automation: AutomationListItem): string | null {
    if (!isCompleteSchedule(automation)) {
        return null;
    }
    const time = formatTimeOfDayMinutes(automation.timeOfDayMinutes);
    if (automation.cadence === "weekly") {
        if (automation.weekDay === null) {
            return null;
        }
        return `${WEEK_DAY_LABELS[automation.weekDay]}s at ${time}`;
    }
    if (automation.cadence === "monthly") {
        if (automation.monthDay === null) {
            return null;
        }
        return `Monthly on the ${getMonthDayLabel(automation.monthDay)} at ${time}`;
    }
    return `Daily at ${time}`;
}

function isCompleteSchedule(
    automation: AutomationListItem
): automation is AutomationListItem & AutomationSchedule {
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

function getLastRunLabel(
    run: AutomationListItem["recentRuns"][number] | undefined
): string | null {
    if (!run) {
        return null;
    }
    const label = RUN_LABEL_BY_STATUS[run.status];
    if (!label) {
        return null;
    }
    return `${label} ${dayjs(run.createdAt).fromNow()}`;
}

function isTerminalRun(run: AutomationListItem["recentRuns"][number]): boolean {
    return RUN_LABEL_BY_STATUS[run.status] !== null;
}

interface AutomationsListProps {
    automations: AutomationListItem[];
    collections: AutomationCollectionOption[];
    suggestions: readonly AutomationTemplate[];
}

export function AutomationsList({
    automations,
    collections,
    suggestions,
}: AutomationsListProps) {
    const contextValue = { automations, collections, suggestions };

    return (
        <AutomationsListContext value={contextValue}>
            <AutomationsListEmpty />
            <div className="flex flex-col gap-8">
                <AutomationsListManaged>
                    {(automation) => (
                        <AutomationsListItem
                            automation={automation}
                            key={automation.id}
                        />
                    )}
                </AutomationsListManaged>
                <AutomationsListSuggestions>
                    {(template) => (
                        <AutomationsListSuggestionsItem
                            key={template.templateKey}
                            template={template}
                        />
                    )}
                </AutomationsListSuggestions>
            </div>
        </AutomationsListContext>
    );
}

function AutomationsListEmpty() {
    const { automations, suggestions } = useAutomationsListContext();

    if (automations.length > 0 || suggestions.length > 0) {
        return null;
    }

    return (
        <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/50 p-8 text-center">
            <Zap
                aria-hidden
                className="size-5 text-muted-foreground"
                focusable="false"
            />
            <p className="font-medium text-foreground text-sm">
                <T>No automations yet</T>
            </p>
            <p className="text-muted-foreground text-xs">
                <T>
                    Create one to summarize or organize saved content on a
                    schedule.
                </T>
            </p>
        </div>
    );
}

interface AutomationsListManagedProps {
    children: (
        automation: AutomationListItem,
        index: number
    ) => React.ReactNode;
}

function AutomationsListManaged({ children }: AutomationsListManagedProps) {
    const { automations } = useAutomationsListContext();

    if (automations.length === 0) {
        return null;
    }

    return (
        <section className="flex flex-col gap-3">
            <h2 className="font-medium text-muted-foreground text-sm">
                <T>Your automations</T>
            </h2>
            <ul className="grid list-none grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {automations.map(children)}
            </ul>
        </section>
    );
}

interface AutomationsListSuggestionsProps {
    children: (template: AutomationTemplate, index: number) => React.ReactNode;
}

function AutomationsListSuggestions({
    children,
}: AutomationsListSuggestionsProps) {
    const { suggestions } = useAutomationsListContext();

    if (suggestions.length === 0) {
        return null;
    }

    return (
        <section className="flex flex-col gap-3">
            <h2 className="font-medium text-muted-foreground text-sm">
                <T>Suggested</T>
            </h2>
            <ul className="grid list-none grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {suggestions.map(children)}
            </ul>
        </section>
    );
}

interface AutomationsListItemProps {
    automation: AutomationListItem;
}

function AutomationsListItem({ automation }: AutomationsListItemProps) {
    const { collections } = useAutomationsListContext();
    const router = useRouter();
    const [isPending, startTransition] = React.useTransition();
    const [isEditOpen, setIsEditOpen] = React.useState(false);
    const [actionErrorMessage, setActionErrorMessage] = React.useState<
        string | null
    >(null);

    const isActive = automation.status === "active";
    const canResume = !isActive && isCompleteSchedule(automation);
    const Icon = getAutomationTemplateIcon(automation.templateKey);
    const scheduleLabel = formatSchedule(automation);
    const lastRunLabel = getLastRunLabel(
        automation.recentRuns.find(isTerminalRun)
    );

    function handleAction(action: () => Promise<AutomationMutationResult>) {
        setActionErrorMessage(null);
        startTransition(async () => {
            const result = await action();
            if (result.status !== "SUCCESS") {
                setActionErrorMessage(result.message);
                return;
            }
            router.refresh();
        });
    }

    const handlePause = useStableCallback(() => {
        handleAction(() => pauseAutomation({ automationId: automation.id }));
    });

    const handleResume = useStableCallback(() => {
        if (!isCompleteSchedule(automation)) {
            return;
        }
        handleAction(() =>
            resumeAutomation({
                automationId: automation.id,
                schedule: {
                    cadence: automation.cadence,
                    monthDay:
                        automation.cadence === "monthly"
                            ? automation.monthDay
                            : null,
                    timeOfDayMinutes: automation.timeOfDayMinutes,
                    timezone: automation.timezone,
                    weekDay:
                        automation.cadence === "weekly"
                            ? automation.weekDay
                            : null,
                },
            })
        );
    });

    const handleEditOpen = useStableCallback(() => {
        setIsEditOpen(true);
    });

    const handleEnableOrResume = useStableCallback(() => {
        if (canResume) {
            handleResume();
            return;
        }
        handleEditOpen();
    });

    const handleDelete = useStableCallback(() => {
        handleAction(() => deleteAutomation({ automationId: automation.id }));
    });

    return (
        <li className="flex list-none flex-col gap-3 rounded-2xl bg-muted/60 p-4">
            <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-xs/5">
                    <Icon aria-hidden className="size-4" focusable="false" />
                </span>
                <AutomationsListItemMenu
                    canResume={canResume}
                    isActive={isActive}
                    isPending={isPending}
                    onDelete={handleDelete}
                    onEdit={handleEditOpen}
                    onEnableOrResume={handleEnableOrResume}
                    onPause={handlePause}
                    title={automation.title}
                />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate font-medium text-foreground text-sm">
                        {automation.title}
                    </p>
                    {isActive ? null : (
                        <Badge variant="secondary">Paused</Badge>
                    )}
                </div>
                <p className="line-clamp-2 text-muted-foreground text-xs leading-5">
                    {getAutomationDescription(automation)}
                </p>
                {scheduleLabel || lastRunLabel ? (
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
                ) : null}
                <ErrorMessage className="mt-1 leading-5">
                    {actionErrorMessage}
                </ErrorMessage>
            </div>
            <AutomationComposerDialog
                automation={toComposerAutomation(automation)}
                collections={collections}
                onOpenChange={setIsEditOpen}
                open={isEditOpen}
                trigger={null}
            />
        </li>
    );
}

interface AutomationsListItemMenuProps {
    canResume: boolean;
    isActive: boolean;
    isPending: boolean;
    onDelete: () => void;
    onEdit: () => void;
    onEnableOrResume: () => void;
    onPause: () => void;
    title: string;
}

function AutomationsListItemMenu({
    canResume,
    isActive,
    isPending,
    onDelete,
    onEdit,
    onEnableOrResume,
    onPause,
    title,
}: AutomationsListItemMenuProps) {
    return (
        <Menu>
            <MenuTrigger
                render={
                    <Button
                        aria-label={`Actions for ${title}`}
                        className="rounded-full text-muted-foreground"
                        disabled={isPending}
                        size="icon-xs"
                        variant="ghost"
                    />
                }
            >
                <Ellipsis aria-hidden className="size-4" focusable="false" />
            </MenuTrigger>
            <MenuPopup align="end" className="min-w-40">
                <MenuItem onClick={onEdit}>
                    <Pencil
                        aria-hidden
                        className="size-4 text-muted-foreground"
                        focusable="false"
                    />
                    Edit
                </MenuItem>
                {isActive ? (
                    <MenuItem disabled={isPending} onClick={onPause}>
                        <Pause
                            aria-hidden
                            className="size-4 text-muted-foreground"
                            focusable="false"
                        />
                        Pause
                    </MenuItem>
                ) : (
                    <MenuItem disabled={isPending} onClick={onEnableOrResume}>
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
                    disabled={isPending}
                    onClick={onDelete}
                    variant="destructive"
                >
                    <Trash2
                        aria-hidden
                        className="size-4 text-muted-foreground"
                        focusable="false"
                    />
                    Delete
                </MenuItem>
            </MenuPopup>
        </Menu>
    );
}

interface AutomationsListSuggestedItemProps {
    template: AutomationTemplate;
}

function AutomationsListSuggestionsItem({
    template,
}: AutomationsListSuggestedItemProps) {
    const { collections } = useAutomationsListContext();
    const Icon = getAutomationTemplateIcon(template.templateKey);

    return (
        <li className="flex list-none flex-col gap-3 rounded-2xl bg-muted/60 p-4">
            <div className="flex items-start justify-between gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-xs/5">
                    <Icon aria-hidden className="size-4" focusable="false" />
                </span>
                <AutomationComposerDialog
                    automation={toComposerTemplate(template)}
                    collections={collections}
                    trigger={
                        <Button
                            aria-label={`Add ${template.title}`}
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
                <p className="truncate font-medium text-foreground text-sm">
                    {template.title}
                </p>
                <p className="line-clamp-2 text-muted-foreground text-xs leading-5">
                    {template.summary}
                </p>
            </div>
        </li>
    );
}
