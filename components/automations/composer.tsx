"use client";

import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { parseDate } from "chrono-node";
import { cn } from "cn";
import { useLocale } from "gt-next";
import {
    CalendarDays,
    ChevronDown,
    ChevronRight,
    Clock,
    FolderOpen,
    type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Combobox,
    ComboboxCollection,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxPopup,
    ComboboxTrigger,
    ComboboxValue,
} from "@/components/ui/combobox";
import {
    Dialog,
    DialogFooter,
    DialogHeader,
    DialogPanel,
    DialogPopup,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getMonthDayLabel } from "@/lib/common/date";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    DEFAULT_TIME_OF_DAY_MINUTES,
    formatTimeOfDayMinutes,
    getTimeOfDayOption,
    getTimeOfDayOptionByLabel,
    getTimeOfDayOptions,
    parseTimeOfDayMinutes,
    roundTimeOfDayMinutes,
    type TimeOfDayOption,
} from "@/lib/common/time";
import {
    createAutomation,
    resumeAutomation,
    updateAutomation,
} from "@/lib/intelligence/automations/actions";
import AppIconSmall from "@/public/cache-icon-small.png";

const ALL_LIBRARY_COLLECTION_ID = "all_library";

const DEFAULT_WEEK_DAY = 1;
const DEFAULT_MONTH_DAY = 1;
const DEFAULT_WEEK_DAY_OPTION: WeekDayOption = {
    label: "Monday",
    value: DEFAULT_WEEK_DAY,
};
const DEFAULT_MONTH_DAY_OPTION: MonthDayOption = {
    label: "1st",
    value: DEFAULT_MONTH_DAY,
};
const WEEK_DAYS: WeekDayOption[] = [
    { label: "Sunday", value: 0 },
    DEFAULT_WEEK_DAY_OPTION,
    { label: "Tuesday", value: 2 },
    { label: "Wednesday", value: 3 },
    { label: "Thursday", value: 4 },
    { label: "Friday", value: 5 },
    { label: "Saturday", value: 6 },
];
const CADENCE_OPTIONS: CadenceOption[] = [
    { label: "Daily", value: "daily" },
    { label: "Weekly", value: "weekly" },
    { label: "Monthly", value: "monthly" },
];
const MONTH_DAY_OPTIONS: MonthDayOption[] = Array.from(
    { length: 31 },
    (_, index) => {
        const value = index + 1;
        if (value === DEFAULT_MONTH_DAY_OPTION.value) {
            return DEFAULT_MONTH_DAY_OPTION;
        }
        return {
            label: getMonthDayLabel(value),
            value,
        };
    }
);
const DEFAULT_CADENCE_OPTION: CadenceOption = {
    label: "Weekly",
    value: "weekly",
};
const ALL_LIBRARY_OPTION: AutomationCollectionOption = {
    id: ALL_LIBRARY_COLLECTION_ID,
    name: "All library",
};

function getAutomationCollectionName(
    option: AutomationCollectionOption
): string {
    return option.name;
}

function getAutomationCollectionId(option: AutomationCollectionOption): string {
    return option.id;
}

function getOptionLabel(option: { label: string }): string {
    return option.label;
}

function getStringOptionValue(option: { value: string }): string {
    return option.value;
}

function getNumericOptionValue(option: { value: number }): string {
    return String(option.value);
}

type AutomationCadence = "daily" | "weekly" | "monthly";
type AutomationPayloadScope = "all_library_items" | "collection";
type AutomationStatus = "active" | "paused";

interface CadenceOption {
    label: string;
    value: AutomationCadence;
}

interface WeekDayOption {
    label: string;
    value: number;
}

interface MonthDayOption {
    label: string;
    value: number;
}

export interface AutomationCollectionOption {
    id: string;
    name: string;
}

export interface AutomationComposerAutomation {
    cadence: AutomationCadence;
    collectionId?: string;
    id: string;
    monthDay?: number;
    payloadScope: AutomationPayloadScope;
    prompt: string;
    status: AutomationStatus;
    timeOfDayMinutes: number;
    timezone: string;
    title: string;
    weekDay?: number;
}

interface AutomationFormState {
    cadence: CadenceOption;
    collection: AutomationCollectionOption;
    errorMessage: string | null;
    monthDay: number;
    prompt: string;
    timeValue: string;
    title: string;
    weekDay: number;
}

const log = createLogger("automations:composer");

function getInitialFormState(
    automation: AutomationComposerAutomation | undefined,
    collections: AutomationCollectionOption[]
): AutomationFormState {
    return {
        cadence: getCadenceOption(automation?.cadence),
        collection: getCollectionOption(collections, automation),
        errorMessage: null,
        monthDay: automation?.monthDay ?? DEFAULT_MONTH_DAY,
        prompt: automation === undefined ? "" : automation.prompt,
        timeValue: formatTimeOfDayMinutes(
            automation === undefined
                ? DEFAULT_TIME_OF_DAY_MINUTES
                : automation.timeOfDayMinutes
        ),
        title: automation === undefined ? "" : automation.title,
        weekDay: automation?.weekDay ?? DEFAULT_WEEK_DAY,
    };
}

function getSubmitLabel(args: {
    isEditing: boolean;
    shouldResumeAfterSave: boolean;
}): string {
    if (!args.isEditing) {
        return "Create automation";
    }
    if (args.shouldResumeAfterSave) {
        return "Enable automation";
    }
    return "Save automation";
}

function getCollectionOption(
    collections: AutomationCollectionOption[],
    automation: AutomationComposerAutomation | undefined
) {
    if (automation?.payloadScope !== "collection") {
        return ALL_LIBRARY_OPTION;
    }

    const collection = collections.find(
        (option) => option.id === automation.collectionId
    );
    if (collection) {
        return collection;
    }

    // Keep an invalid sentinel so save revalidates server-side instead of
    // silently rewriting the scope to "All library".
    return {
        id: automation.collectionId ?? "missing_collection",
        name: "Collection missing",
    };
}

function getCollectionComboboxOptions(
    collections: AutomationCollectionOption[],
    selected: AutomationCollectionOption
): AutomationCollectionOption[] {
    const options = [ALL_LIBRARY_OPTION, ...collections];
    if (
        selected.id === ALL_LIBRARY_COLLECTION_ID ||
        options.some((option) => option.id === selected.id)
    ) {
        return options;
    }
    return [selected, ...options];
}

function getCadenceOption(cadence: AutomationCadence | undefined) {
    return (
        CADENCE_OPTIONS.find((option) => option.value === cadence) ??
        DEFAULT_CADENCE_OPTION
    );
}

function getWeekDayOption(weekDay: number) {
    return (
        WEEK_DAYS.find((option) => option.value === weekDay) ??
        DEFAULT_WEEK_DAY_OPTION
    );
}

function getMonthDayOption(monthDay: number) {
    return (
        MONTH_DAY_OPTIONS.find((option) => option.value === monthDay) ??
        DEFAULT_MONTH_DAY_OPTION
    );
}

type AutomationComposerDialogProps = {
    automation?: AutomationComposerAutomation;
    children?: React.ReactNode;
    collections: AutomationCollectionOption[];
    /** Pass `null` to hide the trigger (controlled open only). */
    trigger?: React.ReactElement | null;
} & (
    | { onOpenChange?: (open: boolean) => void; open?: undefined }
    | { onOpenChange: (open: boolean) => void; open: boolean }
);

export function AutomationComposerDialog({
    automation,
    children,
    collections,
    onOpenChange,
    open,
    trigger,
}: AutomationComposerDialogProps) {
    const router = useRouter();
    const locale = useLocale();

    const titleId = React.useId();
    const promptId = React.useId();
    const collectionId = React.useId();
    const cadenceId = React.useId();
    const timeId = React.useId();
    const weekDayId = React.useId();
    const monthDayId = React.useId();
    const errorId = React.useId();

    const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
    const isOpenControlled = open !== undefined;
    const isOpen = isOpenControlled ? open : uncontrolledOpen;
    const [isPending, startTransition] = React.useTransition();
    const submissionPendingRef = React.useRef(false);
    const [formState, setFormState] = React.useState<AutomationFormState>(() =>
        getInitialFormState(automation, collections)
    );
    const isEditing = automation !== undefined;
    const shouldRenderTrigger = trigger !== null;
    const shouldResumeAfterSave = automation?.status === "paused";
    const submitLabel = getSubmitLabel({
        isEditing,
        shouldResumeAfterSave,
    });
    const timeOptions = getTimeOfDayOptions(locale);

    const handleOpenChange = useStableCallback((nextOpen: boolean) => {
        if (nextOpen || !submissionPendingRef.current) {
            if (!isOpenControlled) {
                setUncontrolledOpen(nextOpen);
            }
            onOpenChange?.(nextOpen);
        }
    });

    useIsoLayoutEffect(() => {
        if (!isOpen) {
            return;
        }
        setFormState(getInitialFormState(automation, collections));
    }, [automation?.id, collections, isOpen]);

    const updateFormState = useStableCallback(
        (nextState: Partial<AutomationFormState>) => {
            setFormState((currentState) => ({
                ...currentState,
                ...nextState,
                ...("errorMessage" in nextState ? {} : { errorMessage: null }),
            }));
        }
    );

    const handleTitleChange = useStableCallback(
        (event: React.ChangeEvent<HTMLInputElement>) =>
            updateFormState({ title: event.currentTarget.value })
    );

    const handlePromptChange = useStableCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) =>
            updateFormState({ prompt: event.currentTarget.value })
    );

    const handleCollectionChange = useStableCallback(
        (collection: AutomationCollectionOption) =>
            updateFormState({ collection })
    );

    const handleCadenceChange = useStableCallback((cadence: CadenceOption) =>
        updateFormState({ cadence })
    );

    const handleTimeValueChange = useStableCallback((timeValue: string) =>
        updateFormState({ timeValue })
    );

    const handleWeekDayChange = useStableCallback((weekDay: number) =>
        updateFormState({ weekDay })
    );

    const handleMonthDayChange = useStableCallback((monthDay: number) =>
        updateFormState({ monthDay })
    );

    const handleSubmit = useStableCallback(
        (event: React.ChangeEvent<HTMLFormElement>) => {
            event.preventDefault();

            if (submissionPendingRef.current) {
                return;
            }

            if (!(formState.title.trim() && formState.prompt.trim())) {
                updateFormState({
                    errorMessage: "Title and instructions are required.",
                });
                return;
            }

            submissionPendingRef.current = true;

            startTransition(async () => {
                try {
                    const isAllLibraryPayload =
                        formState.collection.id === ALL_LIBRARY_COLLECTION_ID;

                    const payloadScope: AutomationPayloadScope =
                        isAllLibraryPayload
                            ? "all_library_items"
                            : "collection";

                    const timezone =
                        automation === undefined
                            ? Intl.DateTimeFormat().resolvedOptions().timeZone
                            : automation.timezone;

                    const input = {
                        collectionId: isAllLibraryPayload
                            ? null
                            : formState.collection.id,
                        payloadScope,
                        prompt: formState.prompt,
                        schedule: {
                            cadence: formState.cadence.value,
                            monthDay:
                                formState.cadence.value === "monthly"
                                    ? formState.monthDay
                                    : null,
                            timeOfDayMinutes: parseTimeOfDayMinutes(
                                formState.timeValue
                            ),
                            timezone,
                            weekDay:
                                formState.cadence.value === "weekly"
                                    ? formState.weekDay
                                    : null,
                        },
                        title: formState.title,
                    };

                    const result = isEditing
                        ? await updateAutomation({
                              automation: input,
                              automationId: automation.id,
                          })
                        : await createAutomation(input);

                    if (result.status !== "SUCCESS") {
                        setFormState((currentState) => ({
                            ...currentState,
                            errorMessage: result.message,
                        }));
                        return;
                    }

                    if (isEditing && shouldResumeAfterSave) {
                        const resumeResult = await resumeAutomation({
                            automationId: automation.id,
                            schedule: input.schedule,
                        });

                        if (resumeResult.status !== "SUCCESS") {
                            setFormState((currentState) => ({
                                ...currentState,
                                errorMessage: resumeResult.message,
                            }));

                            return;
                        }
                    }

                    submissionPendingRef.current = false;
                    handleOpenChange(false);
                    setFormState(getInitialFormState(undefined, collections));
                    router.refresh();
                } catch (error) {
                    log.error("Automation submit action failed", error);
                    setFormState((currentState) => ({
                        ...currentState,
                        errorMessage:
                            "We couldn't save this automation. Please try again.",
                    }));
                } finally {
                    submissionPendingRef.current = false;
                }
            });
        }
    );

    return (
        <Dialog onOpenChange={handleOpenChange} open={isOpen}>
            {shouldRenderTrigger ? (
                <DialogTrigger render={trigger ?? <Button size="sm" />}>
                    {children ?? "New Automation"}
                </DialogTrigger>
            ) : null}
            <DialogPopup>
                <form className="contents" onSubmit={handleSubmit}>
                    <DialogHeader>
                        <div className="flex items-center gap-1">
                            <Badge size="lg" variant="outline">
                                <Image
                                    alt=""
                                    height={12}
                                    src={AppIconSmall}
                                    width={12}
                                />
                                Cache
                            </Badge>
                            <ChevronRight className="inline-block size-3.5 shrink-0 text-muted-foreground" />
                            <DialogTitle className="font-medium text-sm">
                                {isEditing ? "Edit" : "New"} automation
                            </DialogTitle>
                        </div>
                    </DialogHeader>
                    <DialogPanel className="space-y-4">
                        <div className="space-y-1">
                            <label
                                className="sr-only font-medium text-sm"
                                htmlFor={titleId}
                            >
                                Title
                            </label>
                            <Input
                                aria-describedby={
                                    formState.errorMessage ? errorId : undefined
                                }
                                autoFocus
                                className="-mx-[calc(--spacing(3)-1px)] font-semibold text-xl"
                                id={titleId}
                                isUnstyled
                                onChange={handleTitleChange}
                                placeholder="Automation title"
                                required
                                size="lg"
                                type="text"
                                value={formState.title}
                            />
                            <label
                                className="sr-only font-medium text-sm"
                                htmlFor={promptId}
                            >
                                Instructions
                            </label>
                            <Textarea
                                aria-describedby={
                                    formState.errorMessage ? errorId : undefined
                                }
                                className="-mx-[calc(--spacing(3)-1px)] *:resize-none"
                                id={promptId}
                                isUnstyled
                                onChange={handlePromptChange}
                                placeholder="Describe what Cache should do"
                                required
                                rows={5}
                                size="lg"
                                value={formState.prompt}
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                            <span
                                className="sr-only font-medium text-sm"
                                id={collectionId}
                            >
                                Collection
                            </span>
                            <AutomationCollectionCombobox
                                labelId={collectionId}
                                onValueChange={handleCollectionChange}
                                options={getCollectionComboboxOptions(
                                    collections,
                                    formState.collection
                                )}
                                value={formState.collection}
                            />
                            <span
                                className="sr-only font-medium text-sm"
                                id={cadenceId}
                            >
                                Cadence
                            </span>
                            <AutomationCadenceCombobox
                                labelId={cadenceId}
                                onValueChange={handleCadenceChange}
                                value={formState.cadence}
                            />
                            <span
                                className="sr-only font-medium text-sm"
                                id={timeId}
                            >
                                Local time
                            </span>
                            <AutomationTimeCombobox
                                labelId={timeId}
                                onValueChange={handleTimeValueChange}
                                options={timeOptions}
                                value={getTimeOfDayOption(
                                    timeOptions,
                                    formState.timeValue
                                )}
                            />
                            {formState.cadence.value === "weekly" ? (
                                <>
                                    <span
                                        className="sr-only font-medium text-sm"
                                        id={weekDayId}
                                    >
                                        Weekday
                                    </span>
                                    <AutomationWeekDayCombobox
                                        labelId={weekDayId}
                                        onValueChange={handleWeekDayChange}
                                        value={getWeekDayOption(
                                            formState.weekDay
                                        )}
                                    />
                                </>
                            ) : null}
                            {formState.cadence.value === "monthly" ? (
                                <>
                                    <span
                                        className="sr-only font-medium text-sm"
                                        id={monthDayId}
                                    >
                                        Month day
                                    </span>
                                    <AutomationMonthDayCombobox
                                        labelId={monthDayId}
                                        onValueChange={handleMonthDayChange}
                                        value={getMonthDayOption(
                                            formState.monthDay
                                        )}
                                    />
                                </>
                            ) : null}
                        </div>
                        {formState.errorMessage ? (
                            <p
                                className="text-destructive text-sm leading-6"
                                id={errorId}
                                role="alert"
                            >
                                {formState.errorMessage}
                            </p>
                        ) : null}
                    </DialogPanel>
                    <DialogFooter>
                        <Button isLoading={isPending} size="sm" type="submit">
                            {submitLabel}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogPopup>
        </Dialog>
    );
}

interface AutomationOptionTriggerProps {
    icon: LucideIcon;
    labelId: string;
    valueClassName?: string;
}

function AutomationOptionTrigger({
    icon: Icon,
    labelId,
    valueClassName,
}: AutomationOptionTriggerProps) {
    return (
        <ComboboxTrigger
            render={
                <Button
                    aria-labelledby={labelId}
                    className="h-7 min-w-0 max-w-full justify-start gap-1 rounded-md px-2 font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
                    size="xs"
                    variant="ghost"
                />
            }
        >
            <Icon
                aria-hidden
                className="size-3.5 shrink-0 opacity-70"
                focusable="false"
            />
            <span className={cn("min-w-0 truncate", valueClassName)}>
                <ComboboxValue />
            </span>
            <ChevronDown
                aria-hidden
                className="size-3 shrink-0 opacity-50"
                focusable="false"
            />
        </ComboboxTrigger>
    );
}

interface AutomationCollectionComboboxProps {
    labelId: string;
    onValueChange: (value: AutomationCollectionOption) => void;
    options: AutomationCollectionOption[];
    value: AutomationCollectionOption;
}

function AutomationCollectionCombobox({
    labelId,
    onValueChange,
    options,
    value,
}: AutomationCollectionComboboxProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleValueChange = useStableCallback(
        (nextCollection: AutomationCollectionOption | null) => {
            if (!nextCollection) {
                return;
            }
            onValueChange(nextCollection);
            setIsOpen(false);
        }
    );

    return (
        <Combobox<AutomationCollectionOption>
            autoHighlight
            items={options}
            itemToStringLabel={getAutomationCollectionName}
            itemToStringValue={getAutomationCollectionId}
            onOpenChange={setIsOpen}
            onValueChange={handleValueChange}
            open={isOpen}
            value={value}
        >
            <AutomationOptionTrigger icon={FolderOpen} labelId={labelId} />
            <ComboboxPopup className="min-w-44">
                <ComboboxInput
                    aria-label="Search collections"
                    placeholder="Collection"
                    size="sm"
                />
                <ComboboxEmpty>No matching collections</ComboboxEmpty>
                <ComboboxList>
                    <ComboboxCollection>
                        {(option: AutomationCollectionOption) => (
                            <ComboboxItem
                                key={option.id}
                                shouldShowIndicatorLast
                                value={option}
                            >
                                <span className="truncate">{option.name}</span>
                            </ComboboxItem>
                        )}
                    </ComboboxCollection>
                </ComboboxList>
            </ComboboxPopup>
        </Combobox>
    );
}

interface AutomationCadenceComboboxProps {
    labelId: string;
    onValueChange: (value: CadenceOption) => void;
    value: CadenceOption;
}

function AutomationCadenceCombobox({
    labelId,
    onValueChange,
    value,
}: AutomationCadenceComboboxProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleValueChange = useStableCallback(
        (nextCadence: CadenceOption | null) => {
            if (!nextCadence) {
                return;
            }
            onValueChange(nextCadence);
            setIsOpen(false);
        }
    );

    return (
        <Combobox<CadenceOption>
            autoHighlight
            items={CADENCE_OPTIONS}
            itemToStringLabel={getOptionLabel}
            itemToStringValue={getStringOptionValue}
            onOpenChange={setIsOpen}
            onValueChange={handleValueChange}
            open={isOpen}
            value={value}
        >
            <AutomationOptionTrigger icon={CalendarDays} labelId={labelId} />
            <ComboboxPopup className="min-w-36">
                <ComboboxList>
                    <ComboboxCollection>
                        {(option: CadenceOption) => (
                            <ComboboxItem
                                key={option.value}
                                shouldShowIndicatorLast
                                value={option}
                            >
                                {option.label}
                            </ComboboxItem>
                        )}
                    </ComboboxCollection>
                </ComboboxList>
            </ComboboxPopup>
        </Combobox>
    );
}

interface AutomationTimeComboboxProps {
    labelId: string;
    onValueChange: (value: string) => void;
    options: TimeOfDayOption[];
    value: TimeOfDayOption;
}

function AutomationTimeCombobox({
    labelId,
    onValueChange,
    options,
    value,
}: AutomationTimeComboboxProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState(() => value.label);

    useIsoLayoutEffect(() => {
        setInputValue(value.label);
    }, [value.label]);

    const handleSelectFromList = useStableCallback(
        (nextTime: TimeOfDayOption) => {
            onValueChange(nextTime.value);
            setInputValue(nextTime.label);
            setIsOpen(false);
        }
    );

    const handleFreeformEnter = useStableCallback(() => {
        const exactOption = getTimeOfDayOptionByLabel(options, inputValue);
        if (exactOption) {
            onValueChange(exactOption.value);
            setInputValue(exactOption.label);
            setIsOpen(false);
            return;
        }

        const parsedDate = parseDate(inputValue);
        if (!parsedDate) {
            setInputValue(value.label);
            return;
        }

        const roundedValue = formatTimeOfDayMinutes(
            roundTimeOfDayMinutes(
                parsedDate.getHours() * 60 + parsedDate.getMinutes()
            )
        );
        const roundedOption = getTimeOfDayOption(options, roundedValue);
        onValueChange(roundedOption.value);
        setInputValue(roundedOption.label);
        setIsOpen(false);
    });

    const handleInputValueChange = useStableCallback(
        (nextInputValue: string) => {
            setInputValue(nextInputValue);
        }
    );

    const handleValueChange = useStableCallback(
        (nextTime: TimeOfDayOption | null) => {
            if (!nextTime) {
                return;
            }
            handleSelectFromList(nextTime);
        }
    );

    const handleKeyDown = useStableCallback((event: React.KeyboardEvent) => {
        if (event.key === "Enter") {
            handleFreeformEnter();
        }
    });

    return (
        <Combobox<TimeOfDayOption>
            autoHighlight
            inputValue={inputValue}
            items={options}
            itemToStringLabel={getOptionLabel}
            itemToStringValue={getStringOptionValue}
            onInputValueChange={handleInputValueChange}
            onOpenChange={setIsOpen}
            onValueChange={handleValueChange}
            open={isOpen}
            value={value}
        >
            <AutomationOptionTrigger
                icon={Clock}
                labelId={labelId}
                valueClassName="tabular-nums"
            />
            <ComboboxPopup className="min-w-36">
                <ComboboxInput
                    aria-label="Search times"
                    onKeyDown={handleKeyDown}
                    placeholder="Time"
                    size="sm"
                />
                <ComboboxEmpty>No matching times</ComboboxEmpty>
                <ComboboxList>
                    <ComboboxCollection>
                        {(option: TimeOfDayOption) => (
                            <ComboboxItem
                                className="tabular-nums"
                                key={option.value}
                                shouldShowIndicatorLast
                                value={option}
                            >
                                {option.label}
                            </ComboboxItem>
                        )}
                    </ComboboxCollection>
                </ComboboxList>
            </ComboboxPopup>
        </Combobox>
    );
}

interface AutomationWeekDayComboboxProps {
    labelId: string;
    onValueChange: (value: number) => void;
    value: WeekDayOption;
}

function AutomationWeekDayCombobox({
    labelId,
    onValueChange,
    value,
}: AutomationWeekDayComboboxProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleValueChange = useStableCallback(
        (nextWeekDay: WeekDayOption | null) => {
            if (!nextWeekDay) {
                return;
            }
            onValueChange(nextWeekDay.value);
            setIsOpen(false);
        }
    );

    return (
        <Combobox<WeekDayOption>
            autoHighlight
            items={WEEK_DAYS}
            itemToStringLabel={getOptionLabel}
            itemToStringValue={getNumericOptionValue}
            onOpenChange={setIsOpen}
            onValueChange={handleValueChange}
            open={isOpen}
            value={value}
        >
            <AutomationOptionTrigger icon={CalendarDays} labelId={labelId} />
            <ComboboxPopup className="min-w-36">
                <ComboboxList>
                    <ComboboxCollection>
                        {(option: WeekDayOption) => (
                            <ComboboxItem
                                key={option.value}
                                shouldShowIndicatorLast
                                value={option}
                            >
                                {option.label}
                            </ComboboxItem>
                        )}
                    </ComboboxCollection>
                </ComboboxList>
            </ComboboxPopup>
        </Combobox>
    );
}

interface AutomationMonthDayComboboxProps {
    labelId: string;
    onValueChange: (value: number) => void;
    value: MonthDayOption;
}

function AutomationMonthDayCombobox({
    labelId,
    onValueChange,
    value,
}: AutomationMonthDayComboboxProps) {
    const [isOpen, setIsOpen] = React.useState(false);

    const handleValueChange = useStableCallback(
        (nextMonthDay: MonthDayOption | null) => {
            if (!nextMonthDay) {
                return;
            }
            onValueChange(nextMonthDay.value);
            setIsOpen(false);
        }
    );

    return (
        <Combobox<MonthDayOption>
            autoHighlight
            items={MONTH_DAY_OPTIONS}
            itemToStringLabel={getOptionLabel}
            itemToStringValue={getNumericOptionValue}
            onOpenChange={setIsOpen}
            onValueChange={handleValueChange}
            open={isOpen}
            value={value}
        >
            <AutomationOptionTrigger icon={CalendarDays} labelId={labelId} />
            <ComboboxPopup className="min-w-32">
                <ComboboxInput
                    aria-label="Search month days"
                    placeholder="Day"
                    size="sm"
                />
                <ComboboxEmpty>No matching days</ComboboxEmpty>
                <ComboboxList>
                    <ComboboxCollection>
                        {(option: MonthDayOption) => (
                            <ComboboxItem
                                key={option.value}
                                shouldShowIndicatorLast
                                value={option}
                            >
                                {option.label}
                            </ComboboxItem>
                        )}
                    </ComboboxCollection>
                </ComboboxList>
            </ComboboxPopup>
        </Combobox>
    );
}
