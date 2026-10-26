"use client";

import { Checkbox } from "@base-ui/react/checkbox";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { T, useGT } from "gt-next";
import { Check, ChevronRight, LibraryBig } from "lucide-react";
import * as React from "react";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import { useCopyToClipboard } from "@/components/hooks/use-copy-to-clipboard";
import { openIntegrationsList } from "@/components/integrations/list";
import {
    shareCollectionPubliclySafely,
    useCollectionAccessGate,
    useCollectionActionRunner,
    useCollectionsContext,
    useCollectionsPendingActionsContext,
    useSmartCollectionsToggle,
} from "@/components/session/collections";
import { useItemsStateContext } from "@/components/session/items";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogPanel,
    DialogPopup,
    DialogTitle,
} from "@/components/ui/dialog";
import { ErrorMessage } from "@/components/ui/error-message";
import {
    Menu,
    MenuGroup,
    MenuGroupLabel,
    MenuItem,
    MenuPopup,
    MenuTrigger,
} from "@/components/ui/menu";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { useSidebarContext } from "@/components/ui/sidebar";
import { buildPublicCollectionShareUrl } from "@/lib/collections/sharing/url";
import type {
    LibraryCollectionSummary,
    LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { addUnique } from "@/lib/common/array";
import { ITEM_KIND_NOTE } from "@/lib/common/constants";

const ONBOARDING_TASK_META = [
    {
        id: "pain-point-survey",
        label: "Answer this…",
    },
    {
        id: "integration",
        label: "Connect your first integration",
    },
    {
        id: "collection",
        label: "Create your first collection",
    },
    {
        id: "smart-collections",
        label: "Enable Smart Collections",
    },
    {
        id: "note",
        label: "Add a note",
    },
    {
        id: "composer",
        label: "Try the Composer",
    },
    {
        id: "share",
        label: "Share a collection",
    },
] as const;

const ONBOARDING_TASK_COUNT = ONBOARDING_TASK_META.length;

const PAIN_POINT_OPTIONS = [
    {
        description: "I lose track of articles, videos, and links I've saved.",
        id: "losing-saved",
        label: "Finding things I've saved",
        solution:
            "You saved it for a reason. That reason is still there — even when all you remember is a detail. Search finds it, so nothing stays buried.",
    },
    {
        description:
            "Twitter here, YouTube there, browser bookmarks somewhere else.",
        id: "too-many-places",
        label: "Too many places to search",
        solution:
            "Everything you save lands in one place. No more hunting across apps to find what you're looking for.",
    },
    {
        description: "Saved stuff piles up without any structure or themes.",
        id: "organizing",
        label: "Hard to organize into topics",
        solution:
            "Your saves organize themselves around the topics and projects that matter to you. No folders to maintain, no taxonomy to design.",
    },
    {
        description: "I save things and never come back to read or watch them.",
        id: "reading-later",
        label: "Never getting back to them",
        solution:
            "What you set aside stays close enough to return to. On your time, not buried in a backlog of good intentions.",
    },
    {
        description: "I'd love a clean link to send friends or coworkers.",
        id: "sharing",
        label: "Sharing with others",
        solution:
            "One link. Exactly what you meant to show them. No export dumps, no “which app do you use?”, no screenshots.",
    },
    {
        description: "I want to jot ideas next to the things I save.",
        id: "quick-thoughts",
        label: "Adding my own notes",
        solution:
            "The thought that sparked when you saved something belongs next to it. Not in a separate notes app while the source lives somewhere else.",
    },
] as const;

type OnboardingTaskId = (typeof ONBOARDING_TASK_META)[number]["id"];

type PainPointId = (typeof PAIN_POINT_OPTIONS)[number]["id"];

type StoredOnboardingTaskId = Extract<
    OnboardingTaskId,
    "composer" | "pain-point-survey"
>;

interface CompletedTaskInput {
    collections: LibraryCollectionSummary[];
    completedOnboardingTaskIds: StoredOnboardingTaskId[];
    connectedIntegrationCount: number;
    items: LibraryItemWithCollections[];
    smartCollectionsEnabled: boolean;
}

const { useStore: useLibraryOnboardingStore } = createStore({
    completedOnboardingTaskIds: storage<StoredOnboardingTaskId[]>([]),
});

function getCompletedTaskIdSet({
    completedOnboardingTaskIds,
    collections,
    connectedIntegrationCount,
    items,
    smartCollectionsEnabled,
}: CompletedTaskInput): Set<OnboardingTaskId> {
    const completed = new Set<OnboardingTaskId>();

    if (connectedIntegrationCount > 0) {
        completed.add("integration");
    }
    if (collections.length > 0) {
        completed.add("collection");
    }
    if (items.some((item) => item.kind === ITEM_KIND_NOTE)) {
        completed.add("note");
    }
    if (completedOnboardingTaskIds.includes("composer")) {
        completed.add("composer");
    }
    if (completedOnboardingTaskIds.includes("pain-point-survey")) {
        completed.add("pain-point-survey");
    }
    if (collections.some(isSharedCollection)) {
        completed.add("share");
    }
    if (smartCollectionsEnabled) {
        completed.add("smart-collections");
    }

    return completed;
}

function isSharedCollection(
    collection: LibraryCollectionSummary
): collection is LibraryCollectionSummary & { shareId: string } {
    return !!(collection.shareId && collection.sharedAt);
}

interface OnboardingMenuProps {
    connectedIntegrationCount: number;
    onCreateCollection: () => void;
    onCreateNote: () => void;
    onOpenComposer: () => void;
    render?: React.ComponentProps<typeof MenuTrigger>["render"];
}

export function OnboardingMenu({
    connectedIntegrationCount,
    onCreateCollection,
    onCreateNote,
    onOpenComposer,
    render,
}: OnboardingMenuProps) {
    const gt = useGT();
    const { isCollectionActionPending } = useCollectionsPendingActionsContext();
    const { collections, syncCollectionShare } = useCollectionsContext();
    const { items } = useItemsStateContext();
    const { setIsOpen: setIsSidebarOpen } = useSidebarContext();
    const { copyToClipboard } = useCopyToClipboard();
    const ensureAccess = useCollectionAccessGate();
    const { runCollectionAction } = useCollectionActionRunner();
    const { completedOnboardingTaskIds, setCompletedOnboardingTaskIds } =
        useLibraryOnboardingStore();
    const {
        isEnabled: isSmartCollectionsEnabled,
        isLoading: isSmartCollectionsLoading,
        setEnabled: setSmartCollectionsEnabled,
    } = useSmartCollectionsToggle();

    const [pendingShareCollection, setPendingShareCollection] =
        React.useState<LibraryCollectionSummary | null>(null);
    const [shareErrorMessage, setShareErrorMessage] = React.useState<
        string | null
    >(null);
    const [isShareDialogOpen, setIsShareDialogOpen] = React.useState(false);
    const [isSurveyDialogOpen, setIsSurveyDialogOpen] = React.useState(false);
    const [isSurveySubmitted, setIsSurveySubmitted] = React.useState(false);
    const [surveyDialogSelections, setSurveyDialogSelections] = React.useState<
        Set<PainPointId>
    >(() => new Set());

    const isShareActionPending =
        pendingShareCollection !== null &&
        isCollectionActionPending("share", pendingShareCollection.id);

    const completedTaskIdSet = getCompletedTaskIdSet({
        collections,
        completedOnboardingTaskIds,
        connectedIntegrationCount,
        items,
        smartCollectionsEnabled: isSmartCollectionsEnabled ?? false,
    });
    const completedTaskCount = completedTaskIdSet.size;
    const isOnboardingCompleted = completedTaskCount === ONBOARDING_TASK_COUNT;
    const progressValue = (completedTaskCount / ONBOARDING_TASK_COUNT) * 100;

    const markTaskCompleted = useStableCallback(
        (taskId: StoredOnboardingTaskId) => {
            setCompletedOnboardingTaskIds((current) =>
                addUnique(current, taskId)
            );
        }
    );

    const handleOpenComposer = useStableCallback(() => {
        markTaskCompleted("composer");
        onOpenComposer();
    });

    const handleOpenIntegrations = useStableCallback(() => {
        setIsSidebarOpen(true);
        openIntegrationsList();
    });

    const handleEnableSmartCollections = useStableCallback(async () => {
        if (isSmartCollectionsLoading || isSmartCollectionsEnabled) {
            return;
        }
        await setSmartCollectionsEnabled(true);
    });

    const handleRequestShare = useStableCallback(async () => {
        const sharedCollection = collections.find(isSharedCollection);
        if (sharedCollection) {
            await copyToClipboard(
                buildPublicCollectionShareUrl(sharedCollection.shareId)
            );
            return;
        }

        const [shareCandidate] = collections;
        if (!shareCandidate) {
            onCreateCollection();
            return;
        }

        if (!ensureAccess(shareCandidate, "share")) {
            return;
        }

        setPendingShareCollection(shareCandidate);
        setIsShareDialogOpen(true);
    });

    const handleShareDialogOpenChange = useStableCallback(
        (nextOpen: boolean) => {
            if (nextOpen || isShareActionPending) {
                return;
            }
            setShareErrorMessage(null);
            setIsShareDialogOpen(false);
        }
    );

    const handleConfirmShare = useStableCallback(() => {
        const collection = pendingShareCollection;
        if (!collection) {
            return;
        }

        runCollectionAction({
            action: "share",
            collection,
            run: async () => {
                setShareErrorMessage(null);

                const result = await shareCollectionPubliclySafely({
                    collectionId: collection.id,
                });

                if (result.status !== "SHARED") {
                    setShareErrorMessage(result.message);
                    return;
                }

                syncCollectionShare(result.collection);
                setIsShareDialogOpen(false);

                await copyToClipboard(result.shareUrl);
            },
        });
    });

    const handleSelectShareCollection = useStableCallback(
        (collection: LibraryCollectionSummary) => {
            setShareErrorMessage(null);
            setPendingShareCollection(collection);
        }
    );

    const handleOpenSurveyDialog = useStableCallback(() => {
        setSurveyDialogSelections(new Set());
        setIsSurveySubmitted(false);
        setIsSurveyDialogOpen(true);
    });

    const handleTogglePainPoint = useStableCallback(
        (painPointId: PainPointId, checked: boolean) => {
            setSurveyDialogSelections((current) => {
                const next = new Set(current);
                if (checked) {
                    next.add(painPointId);
                } else {
                    next.delete(painPointId);
                }
                return next;
            });
        }
    );

    const handleSubmitSurvey = useStableCallback(() => {
        markTaskCompleted("pain-point-survey");
        setIsSurveySubmitted(true);
    });

    const taskHandlerMap: Record<OnboardingTaskId, () => void | Promise<void>> =
        {
            collection: onCreateCollection,
            composer: handleOpenComposer,
            integration: handleOpenIntegrations,
            note: onCreateNote,
            "pain-point-survey": handleOpenSurveyDialog,
            share: handleRequestShare,
            "smart-collections": handleEnableSmartCollections,
        };

    const triggerLabel = gt(
        "Get to know Cache, {completedTaskCount} of {totalTasks} checklist items complete",
        {
            completedTaskCount,
            totalTasks: ONBOARDING_TASK_COUNT,
        }
    );
    // The dialogs stay mounted after completion so the survey answers remain visible as the final step.
    return (
        <>
            {isOnboardingCompleted ? null : (
                <Menu>
                    <MenuTrigger
                        aria-label={triggerLabel}
                        openOnHover
                        render={render}
                    >
                        <ProgressCircle
                            aria-hidden
                            className="inline-block size-4 shrink-0"
                            size={9}
                            value={progressValue}
                        />
                        <T>Get to know Cache</T>
                    </MenuTrigger>
                    <MenuPopup align="start" className="min-w-72">
                        <MenuGroup>
                            <MenuGroupLabel>
                                <T>Complete this checklist</T>
                            </MenuGroupLabel>
                            {ONBOARDING_TASK_META.map((meta) => (
                                <OnboardingMenuItem
                                    isCompleted={completedTaskIdSet.has(
                                        meta.id
                                    )}
                                    key={meta.id}
                                    label={meta.label}
                                    onSelect={taskHandlerMap[meta.id]}
                                />
                            ))}
                        </MenuGroup>
                    </MenuPopup>
                </Menu>
            )}
            {pendingShareCollection ? (
                <ShareDialog
                    collection={pendingShareCollection}
                    collections={collections}
                    isShareActionPending={isShareActionPending}
                    onConfirm={handleConfirmShare}
                    onOpenChange={handleShareDialogOpenChange}
                    onSelectShareCollection={handleSelectShareCollection}
                    open={isShareDialogOpen}
                    shareErrorMessage={shareErrorMessage}
                />
            ) : null}
            <SurveyDialog
                isResponseStep={isSurveySubmitted}
                onCheckedChange={handleTogglePainPoint}
                onOpenChange={setIsSurveyDialogOpen}
                onSubmit={handleSubmitSurvey}
                open={isSurveyDialogOpen}
                selections={surveyDialogSelections}
            />
        </>
    );
}

interface OnboardingMenuItemProps {
    isCompleted: boolean;
    label: string;
    onSelect: () => void | Promise<void>;
}

function OnboardingMenuItem({
    isCompleted,
    label,
    onSelect,
}: OnboardingMenuItemProps) {
    return (
        <MenuItem onClick={onSelect}>
            <OnboardingTaskStateIcon isCompleted={isCompleted} />
            <span className="mr-2 min-w-0 flex-1 truncate">{label}</span>
            <ChevronRight className="ml-auto inline-block size-3.5 shrink-0 opacity-50" />
        </MenuItem>
    );
}

function OnboardingTaskStateIcon({ isCompleted }: { isCompleted: boolean }) {
    if (isCompleted) {
        return (
            <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/12 text-emerald-600">
                <Check className="size-3" />
            </span>
        );
    }

    return (
        <ProgressCircle
            aria-hidden
            className="inline-block size-4 shrink-0"
            value={0}
        />
    );
}

interface ShareDialogProps {
    collection: LibraryCollectionSummary;
    collections: LibraryCollectionSummary[];
    isShareActionPending: boolean;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
    onSelectShareCollection: (collection: LibraryCollectionSummary) => void;
    open: boolean;
    shareErrorMessage: string | null;
}

function ShareDialog({
    collection,
    collections,
    isShareActionPending,
    onConfirm,
    onOpenChange,
    onSelectShareCollection,
    open,
    shareErrorMessage,
}: ShareDialogProps) {
    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogPopup>
                <DialogHeader>
                    <div className="flex items-center gap-1.5">
                        <LibraryBig className="text-muted-foreground size-4" />
                        <DialogTitle>Share collection?</DialogTitle>
                    </div>
                    <DialogDescription>
                        Create a public, read-only link for {collection.name}.
                    </DialogDescription>
                </DialogHeader>
                {collections.length > 1 ? (
                    <DialogPanel className="grid gap-1">
                        {collections.map((entry) => (
                            <ShareCollectionButton
                                collection={entry}
                                key={entry.id}
                                onSelect={onSelectShareCollection}
                                selectedId={collection.id}
                            />
                        ))}
                    </DialogPanel>
                ) : null}
                <ErrorMessage className="px-1 leading-tight italic">
                    {shareErrorMessage}
                </ErrorMessage>
                <DialogFooter>
                    <DialogClose
                        disabled={isShareActionPending}
                        render={<Button size="sm" variant="ghost" />}
                    >
                        Cancel
                    </DialogClose>
                    <Button
                        isLoading={isShareActionPending}
                        onClick={onConfirm}
                        size="sm"
                    >
                        Share and copy link
                    </Button>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}

interface SurveyDialogProps {
    isResponseStep: boolean;
    onCheckedChange: (painPointId: PainPointId, checked: boolean) => void;
    onOpenChange: (open: boolean) => void;
    onSubmit: () => void;
    open: boolean;
    selections: Set<PainPointId>;
}

function SurveyDialog({
    isResponseStep,
    onCheckedChange,
    onOpenChange,
    onSubmit,
    open,
    selections,
}: SurveyDialogProps) {
    const selectedOptions = PAIN_POINT_OPTIONS.filter((option) =>
        selections.has(option.id)
    );

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogPopup>
                {isResponseStep ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>Good news —</DialogTitle>
                            <DialogDescription>
                                None of that has to follow you here.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogPanel className="grid gap-3">
                            {selectedOptions.map((option) => (
                                <div
                                    className="border-border grid gap-1 rounded-md border p-3"
                                    key={option.id}
                                >
                                    <p className="text-foreground text-sm leading-tight font-medium">
                                        {option.label}
                                    </p>
                                    <p className="text-muted-foreground text-sm leading-snug">
                                        {option.solution}
                                    </p>
                                </div>
                            ))}
                        </DialogPanel>
                        <DialogFooter>
                            <DialogClose render={<Button size="sm" />}>
                                Continue
                            </DialogClose>
                        </DialogFooter>
                    </>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle>
                                What's your biggest pain point right now?
                            </DialogTitle>
                            <DialogDescription>
                                Pick anything that sounds like you. We'll use
                                this to tailor the next steps.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogPanel className="grid gap-1.5">
                            {PAIN_POINT_OPTIONS.map((option) => (
                                <PainPointOption
                                    description={option.description}
                                    id={option.id}
                                    isChecked={selections.has(option.id)}
                                    key={option.id}
                                    label={option.label}
                                    onCheckedChange={onCheckedChange}
                                />
                            ))}
                        </DialogPanel>
                        <DialogFooter>
                            <DialogClose
                                render={<Button size="sm" variant="ghost" />}
                            >
                                Skip
                            </DialogClose>
                            <Button
                                disabled={selections.size === 0}
                                onClick={onSubmit}
                                size="sm"
                            >
                                Continue
                            </Button>
                        </DialogFooter>
                    </>
                )}
            </DialogPopup>
        </Dialog>
    );
}

function ShareCollectionButton({
    collection,
    onSelect,
    selectedId,
}: {
    collection: LibraryCollectionSummary;
    onSelect: (collection: LibraryCollectionSummary) => void;
    selectedId: string;
}) {
    const handleClick = useStableCallback(() => onSelect(collection));

    return (
        <Button
            className={cn(
                "w-full justify-start",
                selectedId === collection.id && "bg-accent"
            )}
            onClick={handleClick}
            size="sm"
            variant="ghost"
        >
            <LibraryBig className="size-4" />
            <span className="min-w-0 truncate">{collection.name}</span>
        </Button>
    );
}

function PainPointOption({
    id,
    isChecked,
    label,
    description,
    onCheckedChange,
}: {
    id: PainPointId;
    isChecked: boolean;
    label: string;
    description: string;
    onCheckedChange: (painPointId: PainPointId, checked: boolean) => void;
}) {
    const handleCheckedChange = useStableCallback((checked: boolean) =>
        onCheckedChange(id, checked)
    );

    return (
        <label
            className="hover:border-border has-focus-visible:border-ring data-checked:border-border flex cursor-pointer items-start gap-3 rounded-md border border-transparent p-2 transition-colors outline-none hover:transition-none"
            data-checked={isChecked || undefined}
            htmlFor={`pain-point-${id}`}
        >
            <Checkbox.Root
                aria-label={label}
                checked={isChecked}
                className="border-input bg-background ring-ring focus-visible:ring-offset-background aria-invalid:border-destructive/36 focus-visible:aria-invalid:border-destructive/64 focus-visible:aria-invalid:ring-destructive/48 dark:not-data-checked:bg-input/32 dark:aria-invalid:ring-destructive/24 relative inline-flex size-4.5 shrink-0 items-center justify-center rounded-lg border shadow-xs/5 transition-shadow outline-none not-dark:bg-clip-padding before:pointer-events-none before:absolute before:inset-0 before:rounded-[3px] not-data-disabled:not-data-checked:not-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] focus-visible:ring-2 focus-visible:ring-offset-1 data-disabled:cursor-not-allowed data-disabled:opacity-64 sm:size-4 dark:not-data-disabled:not-data-checked:not-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)] [[data-disabled],[data-checked],[aria-invalid]]:shadow-none"
                id={`pain-point-${id}`}
                onCheckedChange={handleCheckedChange}
            >
                <Checkbox.Indicator className="text-primary-foreground data-checked:bg-primary data-indeterminate:text-foreground absolute -inset-px flex items-center justify-center rounded-lg data-unchecked:hidden">
                    <Check
                        aria-hidden
                        className="size-3.5 sm:size-3"
                        focusable="false"
                    />
                </Checkbox.Indicator>
            </Checkbox.Root>
            <span className="grid min-w-0 flex-1 gap-0.5 text-sm leading-tight">
                <span className="text-foreground font-medium">{label}</span>
                <span className="text-muted-foreground">{description}</span>
            </span>
        </label>
    );
}
