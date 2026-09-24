"use client";

import { Checkbox } from "@base-ui/react/checkbox";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { T, useGT } from "gt-next";
import { Check, ChevronRight, Component, LibraryBig } from "lucide-react";
import * as React from "react";
import { createStore } from "stan-js";
import { storage } from "stan-js/storage";
import { openIntegrationsList } from "@/components/integrations/list";
import {
    shareCollectionPubliclySafely,
    useCollectionAccessGate,
    useCollectionActionRunner,
    useCollectionsContext,
    useCollectionsPendingActionsContext,
} from "@/components/session/collections";
import { useItemsContext } from "@/components/session/items";
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
import { RadialIcon } from "@/components/ui/radial-icon";
import { useSidebarContext } from "@/components/ui/sidebar";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
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

interface OnboardingTask {
    id: OnboardingTaskId;
    isCompleted: boolean;
    label: string;
    onSelect: () => void | Promise<void>;
}

interface CompletedTaskInput {
    collections: LibraryCollectionSummary[];
    completedOnboardingTaskIds: StoredOnboardingTaskId[];
    connectedIntegrationCount: number;
    items: LibraryItemWithCollections[];
}

const { useStore: useLibraryOnboardingStore } = createStore({
    completedOnboardingTaskIds: storage<StoredOnboardingTaskId[]>([]),
});

function getCompletedTaskIdSet({
    completedOnboardingTaskIds,
    collections,
    connectedIntegrationCount,
    items,
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

    return completed;
}

function isSharedCollection(
    collection: LibraryCollectionSummary
): collection is LibraryCollectionSummary & { shareId: string } {
    return !!(collection.shareId && collection.sharedAt);
}

interface OnboardingMenuProps
    extends Omit<
        React.ComponentProps<typeof MenuTrigger>,
        "children" | "aria-label"
    > {
    connectedIntegrationCount: number;
    onCreateCollection: () => void;
    onCreateNote: () => void;
    onOpenComposer: () => void;
}

export function OnboardingMenu({
    connectedIntegrationCount,
    onCreateCollection,
    onCreateNote,
    onOpenComposer,
    openOnHover = true,
    ...props
}: OnboardingMenuProps) {
    const gt = useGT();
    const { isCollectionActionPending } = useCollectionsPendingActionsContext();
    const { collections, syncCollectionShare } = useCollectionsContext();
    const { items } = useItemsContext();
    const { setOpen: setIsSidebarOpen } = useSidebarContext();
    const { copyToClipboard } = useCopyToClipboard();
    const ensureAccess = useCollectionAccessGate();
    const { isPending: isSharePending, runCollectionAction } =
        useCollectionActionRunner();
    const { completedOnboardingTaskIds, setCompletedOnboardingTaskIds } =
        useLibraryOnboardingStore();

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
        isSharePending ||
        (pendingShareCollection !== null &&
            isCollectionActionPending("share", pendingShareCollection.id));

    const completedTaskIdSet = getCompletedTaskIdSet({
        collections,
        completedOnboardingTaskIds,
        connectedIntegrationCount,
        items,
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

    const handleShareDialogOpenChange = useStableCallback((open: boolean) => {
        if (!(open || isShareActionPending)) {
            setShareErrorMessage(null);
            setIsShareDialogOpen(false);
        }
    });

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
            setPendingShareCollection((current) =>
                current?.id === collection.id ? current : collection
            );
        }
    );

    const resetSurveyDialogState = useStableCallback(() => {
        setSurveyDialogSelections(new Set());
        setIsSurveySubmitted(false);
    });

    const handleOpenSurveyDialog = useStableCallback(() => {
        resetSurveyDialogState();
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
        };

    const triggerLabel = gt(
        "Get to know Cache, {completedTaskCount} of {totalTasks} checklist items complete",
        {
            completedTaskCount: String(completedTaskCount),
            totalTasks: String(ONBOARDING_TASK_COUNT),
        }
    );
    return (
        <>
            {isOnboardingCompleted ? null : (
                <Menu>
                    <MenuTrigger
                        {...props}
                        aria-label={triggerLabel}
                        openOnHover={openOnHover}
                    >
                        <RadialIcon
                            aria-hidden
                            className="inline-block size-4 shrink-0"
                            size={9}
                            value={progressValue}
                        />
                        &nbsp;<T>Get to know Cache</T>
                    </MenuTrigger>
                    <MenuPopup align="start" className="min-w-72">
                        <MenuGroup>
                            <MenuGroupLabel>
                                <T>Complete this checklist</T>
                            </MenuGroupLabel>
                            {ONBOARDING_TASK_META.map((meta) => (
                                <OnboardingMenuItem
                                    key={meta.id}
                                    task={{
                                        ...meta,
                                        isCompleted: completedTaskIdSet.has(
                                            meta.id
                                        ),
                                        onSelect: taskHandlerMap[meta.id],
                                    }}
                                />
                            ))}
                        </MenuGroup>
                    </MenuPopup>
                </Menu>
            )}
            <ShareDialog
                collections={collections}
                isShareActionPending={isShareActionPending}
                onConfirm={handleConfirmShare}
                onOpenChange={handleShareDialogOpenChange}
                onSelectShareCollection={handleSelectShareCollection}
                open={isShareDialogOpen}
                pendingShareCollection={pendingShareCollection}
                shareErrorMessage={shareErrorMessage}
            />
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

function OnboardingMenuItem({ task }: { task: OnboardingTask }) {
    return (
        <MenuItem onClick={task.onSelect}>
            <OnboardingTaskStateIcon isCompleted={task.isCompleted} />
            <span className="mr-2 min-w-0 flex-1 truncate">{task.label}</span>
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
        <RadialIcon
            aria-hidden
            className="inline-block size-4 shrink-0"
            size={10}
            value={0}
        />
    );
}

interface ShareDialogProps {
    collections: LibraryCollectionSummary[];
    isShareActionPending: boolean;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
    onSelectShareCollection: (collection: LibraryCollectionSummary) => void;
    open: boolean;
    pendingShareCollection: LibraryCollectionSummary | null;
    shareErrorMessage: string | null;
}

function ShareDialog({
    collections,
    isShareActionPending,
    onConfirm,
    onOpenChange,
    onSelectShareCollection,
    open,
    pendingShareCollection,
    shareErrorMessage,
}: ShareDialogProps) {
    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogPopup>
                {pendingShareCollection ? (
                    <>
                        <DialogHeader>
                            <div className="flex items-center gap-1.5">
                                <LibraryBig className="size-4 text-muted-foreground" />
                                <DialogTitle>Share collection?</DialogTitle>
                            </div>
                            <DialogDescription>
                                Create a public, read-only link for{" "}
                                {pendingShareCollection.name}.
                            </DialogDescription>
                        </DialogHeader>
                        {collections.length > 1 ? (
                            <DialogPanel className="grid gap-1">
                                {collections.map((collection) => (
                                    <ShareCollectionButton
                                        collection={collection}
                                        key={collection.id}
                                        onSelect={onSelectShareCollection}
                                        selectedId={pendingShareCollection.id}
                                    />
                                ))}
                            </DialogPanel>
                        ) : null}
                        {shareErrorMessage ? (
                            <ErrorMessage className="px-1 italic leading-tight">
                                {shareErrorMessage}
                            </ErrorMessage>
                        ) : null}
                        <DialogFooter>
                            <DialogClose
                                disabled={isShareActionPending}
                                render={<Button size="sm" variant="ghost" />}
                            >
                                Cancel
                            </DialogClose>
                            <Button
                                disabled={isShareActionPending}
                                isLoading={isShareActionPending}
                                onClick={onConfirm}
                                size="sm"
                            >
                                Share and copy link
                            </Button>
                        </DialogFooter>
                    </>
                ) : null}
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
    const selectedOptions = isResponseStep
        ? PAIN_POINT_OPTIONS.filter((option) => selections.has(option.id))
        : null;

    return (
        <Dialog onOpenChange={onOpenChange} open={open}>
            <DialogPopup>
                {selectedOptions ? (
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
                                    className="grid gap-1 rounded-md border border-border p-3"
                                    key={option.id}
                                >
                                    <p className="font-medium text-foreground text-sm leading-tight">
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
            <Component className="size-4" />
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
            className="flex cursor-pointer items-start gap-3 rounded-md border border-transparent p-2 outline-none transition-colors hover:border-border has-focus-visible:border-ring data-checked:border-border"
            data-checked={isChecked || undefined}
            htmlFor={`pain-point-${id}`}
        >
            <Checkbox.Root
                aria-label={label}
                checked={isChecked}
                className="relative inline-flex size-4.5 shrink-0 items-center justify-center rounded-lg border border-input bg-background not-dark:bg-clip-padding shadow-xs/5 outline-none ring-ring transition-shadow before:pointer-events-none before:absolute before:inset-0 before:rounded-[3px] not-data-disabled:not-data-checked:not-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background aria-invalid:border-destructive/36 focus-visible:aria-invalid:border-destructive/64 focus-visible:aria-invalid:ring-destructive/48 data-disabled:cursor-not-allowed data-disabled:opacity-64 sm:size-4 dark:not-data-checked:bg-input/32 dark:aria-invalid:ring-destructive/24 dark:not-data-disabled:not-data-checked:not-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/6%)] [[data-disabled],[data-checked],[aria-invalid]]:shadow-none"
                id={`pain-point-${id}`}
                onCheckedChange={handleCheckedChange}
            >
                <Checkbox.Indicator className="absolute -inset-px flex items-center justify-center rounded-lg text-primary-foreground data-unchecked:hidden data-checked:bg-primary data-indeterminate:text-foreground">
                    <Check
                        aria-hidden
                        className="size-3.5 sm:size-3"
                        focusable="false"
                    />
                </Checkbox.Indicator>
            </Checkbox.Root>
            <span className="grid min-w-0 flex-1 gap-0.5 text-sm leading-tight">
                <span className="font-medium text-foreground">{label}</span>
                <span className="text-muted-foreground">{description}</span>
            </span>
        </label>
    );
}
