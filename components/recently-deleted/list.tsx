"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { T, Var } from "gt-next";
import { RotateCcw, Trash } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
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
import {
    purgeAllRecentlyDeletedItems,
    purgeLibraryItem,
    restoreLibraryItem,
} from "@/lib/collections/items";
import {
    getRecentlyDeletedDaysRemaining,
    type LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { ACTION_STATUS, ITEM_KIND_NOTE } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import { parseDisplayUrl } from "@/lib/common/url";
import { getSourceIcon } from "@/lib/integrations/support";

const log = createLogger("recently-deleted");

const RECENTLY_DELETED_EXPIRES_SOON_DAYS = 7;

type ActionFailureKind = "purge" | "purge-all" | "restore";

interface ActionFailure {
    kind: ActionFailureKind;
    /** Message returned by the action, shown verbatim when present. */
    serverMessage?: string;
}

interface PendingAction {
    item: LibraryItemWithCollections;
    kind: "purge" | "restore";
}

interface RecentlyDeletedListContext {
    items: LibraryItemWithCollections[];
    onRequestAction: (
        item: LibraryItemWithCollections,
        kind: PendingAction["kind"]
    ) => void;
    onRequestDeleteAll: () => void;
}

const RecentlyDeletedListContext =
    React.createContext<RecentlyDeletedListContext | null>(null);

function useRecentlyDeletedListContext(): RecentlyDeletedListContext {
    const context = React.use(RecentlyDeletedListContext);
    if (!context) {
        throw new Error(
            "RecentlyDeletedList compound components must be used within RecentlyDeletedList."
        );
    }
    return context;
}

function displayTitle(item: LibraryItemWithCollections): string {
    if (item.kind === ITEM_KIND_NOTE) {
        return item.noteContentText?.trim() || "Untitled note";
    }
    return item.caption?.trim() || parseDisplayUrl(item.url);
}

function formatCountdownCopy(daysRemaining: number): React.ReactNode {
    if (daysRemaining <= 0) {
        return <T>Deletes today</T>;
    }
    if (daysRemaining === 1) {
        return <T>Deletes in 1 day</T>;
    }
    return (
        <T>
            Deletes in <Var>{daysRemaining}</Var> days
        </T>
    );
}

interface RecentlyDeletedListProps {
    items: LibraryItemWithCollections[];
}

export function RecentlyDeletedList({ items }: RecentlyDeletedListProps) {
    const [isPending, startTransition] = React.useTransition();
    const [activeAction, setActiveAction] =
        React.useState<PendingAction | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
    const [failure, setFailure] = React.useState<ActionFailure | null>(null);
    const [hiddenItemIds, setHiddenItemIds] = React.useState<Set<string>>(
        () => new Set()
    );
    const [showDeleteAllDialog, setShowDeleteAllDialog] = React.useState(false);

    const visibleItems = items.filter((item) => !hiddenItemIds.has(item.id));

    const handleRequestAction = useStableCallback(
        (item: LibraryItemWithCollections, kind: PendingAction["kind"]) => {
            setFailure(null);
            setActiveAction({ item, kind });
            setIsConfirmOpen(true);
        }
    );

    const handleConfirmOpenChange = useStableCallback((open: boolean) => {
        if (open || isPending) {
            return;
        }
        setIsConfirmOpen(false);
    });

    const handleConfirmOpenChangeComplete = useStableCallback(
        (isOpen: boolean) => {
            if (isOpen) {
                return;
            }
            setActiveAction(null);
            setFailure(null);
        }
    );

    const handleConfirmAction = useStableCallback(() => {
        const target = activeAction;
        if (!target) {
            return;
        }

        startTransition(async () => {
            try {
                const response =
                    target.kind === "restore"
                        ? await restoreLibraryItem(target.item.id)
                        : await purgeLibraryItem(target.item.id);

                if (
                    response.status === ACTION_STATUS.RESTORED ||
                    response.status === ACTION_STATUS.DELETED
                ) {
                    setHiddenItemIds((current) =>
                        new Set(current).add(target.item.id)
                    );
                    setIsConfirmOpen(false);
                    return;
                }
                setFailure({
                    kind: target.kind,
                    serverMessage: response.message,
                });
            } catch (error) {
                log.error(`Failed to ${target.kind} recently deleted item`, {
                    error,
                    itemId: target.item.id,
                });
                setFailure({ kind: target.kind });
            }
        });
    });

    const handleDeleteAll = useStableCallback(() => {
        startTransition(async () => {
            setFailure(null);
            try {
                const response = await purgeAllRecentlyDeletedItems();
                if (response.status === ACTION_STATUS.DELETED) {
                    setHiddenItemIds(
                        (current) =>
                            new Set([...current, ...response.purgedItemIds])
                    );
                    setShowDeleteAllDialog(false);
                    return;
                }
                setFailure({
                    kind: "purge-all",
                    serverMessage: response.message,
                });
            } catch (error) {
                log.error("Failed to purge all recently deleted items", {
                    error,
                });
                setFailure({ kind: "purge-all" });
            }
        });
    });

    const handleRequestDeleteAll = useStableCallback(() => {
        setFailure(null);
        setShowDeleteAllDialog(true);
    });

    const handleDeleteAllDialogOpenChange = useStableCallback(
        (isOpen: boolean) => {
            if (isOpen || isPending) {
                return;
            }
            setShowDeleteAllDialog(false);
        }
    );

    const handleDeleteAllDialogOpenChangeComplete = useStableCallback(
        (isOpen: boolean) => {
            if (isOpen) {
                return;
            }
            setFailure(null);
        }
    );

    const contextValue = {
        items: visibleItems,
        onRequestAction: handleRequestAction,
        onRequestDeleteAll: handleRequestDeleteAll,
    };

    return (
        <RecentlyDeletedListContext value={contextValue}>
            <div className="flex flex-col gap-3">
                <RecentlyDeletedListEmpty />
                <RecentlyDeletedListToolbar />
                <RecentlyDeletedListContent>
                    {(item) => (
                        <RecentlyDeletedListItem item={item} key={item.id} />
                    )}
                </RecentlyDeletedListContent>
            </div>
            <RecentlyDeletedConfirmDialog
                activeAction={activeAction}
                failure={failure}
                isPending={isPending}
                onConfirm={handleConfirmAction}
                onOpenChange={handleConfirmOpenChange}
                onOpenChangeComplete={handleConfirmOpenChangeComplete}
                open={isConfirmOpen}
            />
            <RecentlyDeletedDeleteAllDialog
                failure={failure}
                isPending={isPending}
                onDeleteAll={handleDeleteAll}
                onOpenChange={handleDeleteAllDialogOpenChange}
                onOpenChangeComplete={handleDeleteAllDialogOpenChangeComplete}
                open={showDeleteAllDialog}
            />
        </RecentlyDeletedListContext>
    );
}

interface RecentlyDeletedListContentProps {
    children: (
        item: LibraryItemWithCollections,
        index: number
    ) => React.ReactNode;
}

function RecentlyDeletedListContent({
    children,
}: RecentlyDeletedListContentProps) {
    const { items } = useRecentlyDeletedListContext();

    if (items.length === 0) {
        return null;
    }

    return (
        <ul className="flex list-none flex-col gap-3">{items.map(children)}</ul>
    );
}

function RecentlyDeletedListToolbar() {
    const { items, onRequestDeleteAll } = useRecentlyDeletedListContext();

    if (items.length === 0) {
        return null;
    }

    return (
        <Button
            className="self-end"
            onClick={onRequestDeleteAll}
            size="sm"
            variant="destructive-outline"
        >
            <Trash aria-hidden className="size-4" focusable="false" />
            <T>Delete all</T>
        </Button>
    );
}

function RecentlyDeletedListEmpty() {
    const { items } = useRecentlyDeletedListContext();

    if (items.length > 0) {
        return null;
    }

    return (
        <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/50 p-8 text-center">
            <RotateCcw
                aria-hidden
                className="size-5 text-muted-foreground"
                focusable="false"
            />
            <p className="font-medium text-foreground text-sm">
                <T>Nothing to restore right now</T>
            </p>
            <p className="text-muted-foreground text-xs">
                <T>
                    Items you remove from your library stay here for 30 days
                    before being deleted forever.
                </T>
            </p>
        </div>
    );
}

interface RecentlyDeletedListItemProps {
    item: LibraryItemWithCollections;
}

function RecentlyDeletedListItem({ item }: RecentlyDeletedListItemProps) {
    const { onRequestAction } = useRecentlyDeletedListContext();

    const SourceIcon = getSourceIcon(item.source) ?? Trash;
    const displayUrl = parseDisplayUrl(item.url);

    const handleRestore = useStableCallback(() => {
        onRequestAction(item, "restore");
    });
    const handlePurge = useStableCallback(() => {
        onRequestAction(item, "purge");
    });

    const daysRemaining = getRecentlyDeletedDaysRemaining(item.deletedAt);
    const expiresSoon = daysRemaining <= RECENTLY_DELETED_EXPIRES_SOON_DAYS;

    return (
        <li className="flex list-none items-start gap-4 rounded-2xl bg-muted/60 p-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <SourceIcon aria-hidden className="size-5" focusable="false" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate font-medium text-foreground text-sm">
                    {displayTitle(item)}
                </p>
                {displayUrl ? (
                    <p className="truncate text-muted-foreground text-xs">
                        {displayUrl}
                    </p>
                ) : null}
                <div className="flex items-center gap-2 text-xs">
                    <span
                        className={cn(
                            "rounded-full px-2 py-0.5 font-medium",
                            expiresSoon
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground"
                        )}
                    >
                        {formatCountdownCopy(daysRemaining)}
                    </span>
                    {item.collections.length === 0 ? null : (
                        <span className="truncate text-muted-foreground text-xs">
                            {item.collections.length === 1 ? (
                                <T>1 collection</T>
                            ) : (
                                <T>
                                    <Var>{item.collections.length}</Var>{" "}
                                    collections
                                </T>
                            )}
                        </span>
                    )}
                </div>
            </div>
            <RecentlyDeletedListItemControls
                onPurge={handlePurge}
                onRestore={handleRestore}
            />
        </li>
    );
}

interface RecentlyDeletedListItemControlsProps {
    onPurge: () => void;
    onRestore: () => void;
}

function RecentlyDeletedListItemControls({
    onPurge,
    onRestore,
}: RecentlyDeletedListItemControlsProps) {
    return (
        <div className="flex shrink-0 items-center gap-2">
            <Button onClick={onRestore} size="sm" variant="outline">
                <RotateCcw aria-hidden className="size-4" focusable="false" />
                <T>Restore</T>
            </Button>
            <Button onClick={onPurge} size="sm" variant="destructive">
                <Trash aria-hidden className="size-4" focusable="false" />
                <T>Delete forever</T>
            </Button>
        </div>
    );
}

interface RecentlyDeletedConfirmDialogProps {
    activeAction: PendingAction | null;
    failure: ActionFailure | null;
    isPending: boolean;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
    onOpenChangeComplete: (isOpen: boolean) => void;
    open: boolean;
}

function RecentlyDeletedConfirmDialog({
    activeAction,
    failure,
    isPending,
    onConfirm,
    onOpenChange,
    onOpenChangeComplete,
    open,
}: RecentlyDeletedConfirmDialogProps) {
    return (
        <Dialog
            onOpenChange={onOpenChange}
            onOpenChangeComplete={onOpenChangeComplete}
            open={open}
        >
            <DialogPopup>
                {activeAction ? (
                    <>
                        <DialogHeader>
                            <DialogTitle>
                                {activeAction.kind === "restore" ? (
                                    <T>Restore this saved item?</T>
                                ) : (
                                    <T>Delete forever?</T>
                                )}
                            </DialogTitle>
                            <DialogDescription>
                                {activeAction.kind === "restore" ? (
                                    <T>
                                        Move{" "}
                                        <Var>
                                            {displayTitle(activeAction.item)}
                                        </Var>{" "}
                                        back to your library. Collections and
                                        previews come back intact.
                                    </T>
                                ) : (
                                    <T>
                                        Permanently delete{" "}
                                        <Var>
                                            {displayTitle(activeAction.item)}
                                        </Var>{" "}
                                        from Cache. This cannot be undone.
                                    </T>
                                )}
                            </DialogDescription>
                        </DialogHeader>
                        {failure ? (
                            <ErrorMessage className="px-6 pt-2">
                                <ActionFailureMessage failure={failure} />
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
                                onClick={onConfirm}
                                variant={
                                    activeAction.kind === "purge"
                                        ? "destructive"
                                        : "default"
                                }
                            >
                                {activeAction.kind === "restore" ? (
                                    <T>Restore</T>
                                ) : (
                                    <T>Delete forever</T>
                                )}
                            </Button>
                        </DialogFooter>
                    </>
                ) : null}
            </DialogPopup>
        </Dialog>
    );
}

interface RecentlyDeletedDeleteAllDialogProps {
    failure: ActionFailure | null;
    isPending: boolean;
    onDeleteAll: () => void;
    onOpenChange: (isOpen: boolean) => void;
    onOpenChangeComplete: (isOpen: boolean) => void;
    open: boolean;
}

function RecentlyDeletedDeleteAllDialog({
    failure,
    isPending,
    onDeleteAll,
    onOpenChange,
    onOpenChangeComplete,
    open,
}: RecentlyDeletedDeleteAllDialogProps) {
    const { items } = useRecentlyDeletedListContext();

    return (
        <Dialog
            onOpenChange={onOpenChange}
            onOpenChangeComplete={onOpenChangeComplete}
            open={open}
        >
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>
                        <T>Delete all items forever?</T>
                    </DialogTitle>
                    <DialogDescription>
                        <T>
                            Permanently delete all <Var>{items.length}</Var>{" "}
                            items from Recently deleted. This cannot be undone.
                        </T>
                    </DialogDescription>
                </DialogHeader>
                {failure ? (
                    <ErrorMessage className="px-6 pt-2">
                        <ActionFailureMessage failure={failure} />
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
                        onClick={onDeleteAll}
                        variant="destructive"
                    >
                        <T>Delete all</T>
                    </Button>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}

interface ActionFailureMessageProps {
    failure: ActionFailure;
}

function ActionFailureMessage({ failure }: ActionFailureMessageProps) {
    if (failure.serverMessage) {
        return <>{failure.serverMessage}</>;
    }
    switch (failure.kind) {
        case "purge":
            return (
                <T>We couldn't permanently delete this saved item right now.</T>
            );
        case "purge-all":
            return <T>We couldn't permanently delete your items right now.</T>;
        case "restore":
            return <T>We couldn't restore this saved item right now.</T>;
        default:
            throw new Error(`Unhandled action failure kind: ${failure.kind}.`);
    }
}
