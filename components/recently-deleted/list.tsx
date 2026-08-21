"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T, Var } from "gt-next";
import { RotateCcw, Trash } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogDescription,
    DialogFieldError,
    DialogFooter,
    DialogHeader,
    DialogPopup,
    DialogTitle,
} from "@/components/ui/dialog";
import type { LibraryItemPurgeAllResult } from "@/lib/collections/items";
import {
    purgeAllRecentlyDeletedItems,
    purgeLibraryItem,
    restoreLibraryItem,
} from "@/lib/collections/items";
import type {
    LibraryCollectionTag,
    LibraryItemWithCollections,
} from "@/lib/collections/utils";
import { cn } from "@/lib/common/cn";
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
    kind: Exclude<ActionFailureKind, "purge-all">;
}

// Mirrors getLibraryItemPrimaryText in components/library/browser.tsx; falls
// back to a parsed display URL because tombstone rows should not print raw hrefs.
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
    itemDaysRemainingById: Record<string, number>;
    items: LibraryItemWithCollections[];
}

export function RecentlyDeletedList({
    itemDaysRemainingById,
    items,
}: RecentlyDeletedListProps) {
    const [isPending, startTransition] = React.useTransition();
    const [activeAction, setActiveAction] =
        React.useState<PendingAction | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
    const [failure, setFailure] = React.useState<ActionFailure | null>(null);
    const [hiddenItemIds, setHiddenItemIds] = React.useState<Set<string>>(
        () => new Set()
    );

    const [showDeleteAllDialog, setShowDeleteAllDialog] = React.useState(false);
    const [isDeleteAllPending, startDeleteAllTransition] =
        React.useTransition();

    const visibleItems = items.filter((item) => !hiddenItemIds.has(item.id));

    const handleRequestAction = useStableCallback(
        (item: LibraryItemWithCollections, kind: PendingAction["kind"]) => {
            setFailure(null);
            setActiveAction({ item, kind });
            setIsConfirmOpen(true);
        }
    );

    const handleConfirmOpenChange = useStableCallback((open: boolean) => {
        if (!(open || isPending)) {
            setIsConfirmOpen(false);
        }
    });

    // Keep the dialog subject mounted while the close animation plays.
    const handleConfirmOpenChangeComplete = useStableCallback(
        (open: boolean) => {
            if (!open) {
                setActiveAction(null);
                setFailure(null);
            }
        }
    );

    const handleConfirmAction = useStableCallback(() => {
        const target = activeAction;
        if (!target) {
            return;
        }

        const failureKind: ActionFailure["kind"] =
            target.kind === "restore" ? "restore" : "purge";

        startTransition(async () => {
            const removeFromList = () => {
                setHiddenItemIds((current) =>
                    new Set(current).add(target.item.id)
                );
                setIsConfirmOpen(false);
            };

            try {
                if (target.kind === "restore") {
                    const response = await restoreLibraryItem(target.item.id);
                    if (response.status === ACTION_STATUS.RESTORED) {
                        removeFromList();
                        return;
                    }
                    setFailure({
                        kind: failureKind,
                        serverMessage: response.message,
                    });
                    return;
                }

                const response = await purgeLibraryItem(target.item.id);
                if (response.status === ACTION_STATUS.DELETED) {
                    removeFromList();
                    return;
                }
                setFailure({
                    kind: failureKind,
                    serverMessage: response.message,
                });
            } catch (error) {
                log.error(
                    `Failed to ${failureKind} recently deleted item`,
                    error
                );
                setFailure({ kind: failureKind });
            }
        });
    });

    const handleDeleteAll = useStableCallback(() => {
        startDeleteAllTransition(async () => {
            setFailure(null);
            let response: LibraryItemPurgeAllResult;
            try {
                response = await purgeAllRecentlyDeletedItems();
            } catch (error) {
                log.error("Failed to purge all recently deleted items", error);
                setFailure({ kind: "purge-all" });
                return;
            }
            if (response.status === ACTION_STATUS.DELETED) {
                setHiddenItemIds(
                    (current) =>
                        new Set([...current, ...response.purgedItemIds])
                );
                setShowDeleteAllDialog(false);
                return;
            }
            setFailure({ kind: "purge-all", serverMessage: response.message });
        });
    });

    const handleRequestDeleteAll = useStableCallback(() => {
        setFailure(null);
        setShowDeleteAllDialog(true);
    });

    const handleDeleteAllDialogOpenChange = useStableCallback(
        (isOpen: boolean) => {
            if (!(isOpen || isDeleteAllPending)) {
                setShowDeleteAllDialog(false);
            }
        }
    );

    const handleDeleteAllDialogOpenChangeComplete = useStableCallback(
        (isOpen: boolean) => {
            if (!isOpen) {
                setFailure(null);
            }
        }
    );

    return (
        <div className="flex flex-col gap-3">
            {visibleItems.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-muted/50 p-8 text-center">
                    <p className="font-medium text-foreground text-sm">
                        <T>Nothing to restore right now</T>
                    </p>
                    <p className="text-muted-foreground text-xs">
                        <T>
                            Items you remove from your library stay here for 30
                            days before being deleted forever.
                        </T>
                    </p>
                </div>
            ) : (
                <>
                    <div className="flex items-center justify-end">
                        <Button
                            onClick={handleRequestDeleteAll}
                            size="sm"
                            variant="destructive-outline"
                        >
                            <Trash
                                aria-hidden
                                className="size-4"
                                focusable="false"
                            />
                            <T>Delete all now</T>
                        </Button>
                    </div>
                    {visibleItems.map((item) => {
                        const daysRemaining = itemDaysRemainingById[item.id];
                        return (
                            <RecentlyDeletedRow
                                daysRemaining={daysRemaining}
                                item={item}
                                key={item.id}
                                onRequestAction={handleRequestAction}
                            />
                        );
                    })}
                </>
            )}
            <Dialog
                onOpenChange={handleConfirmOpenChange}
                onOpenChangeComplete={handleConfirmOpenChangeComplete}
                open={isConfirmOpen}
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
                                                {displayTitle(
                                                    activeAction.item
                                                )}
                                            </Var>{" "}
                                            back to your library. Collections
                                            and previews come back intact.
                                        </T>
                                    ) : (
                                        <T>
                                            Permanently delete{" "}
                                            <Var>
                                                {displayTitle(
                                                    activeAction.item
                                                )}
                                            </Var>{" "}
                                            from Cache. This cannot be undone.
                                        </T>
                                    )}
                                </DialogDescription>
                            </DialogHeader>
                            {failure ? (
                                <div className="px-6">
                                    <DialogFieldError>
                                        <ActionFailureMessage
                                            failure={failure}
                                        />
                                    </DialogFieldError>
                                </div>
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
                                    onClick={handleConfirmAction}
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
            <Dialog
                onOpenChange={handleDeleteAllDialogOpenChange}
                onOpenChangeComplete={handleDeleteAllDialogOpenChangeComplete}
                open={showDeleteAllDialog}
            >
                <DialogPopup>
                    <DialogHeader>
                        <DialogTitle>
                            <T>Delete all items forever?</T>
                        </DialogTitle>
                        <DialogDescription>
                            <T>
                                Permanently delete all{" "}
                                <Var>{visibleItems.length}</Var> items from
                                Recently deleted. This cannot be undone.
                            </T>
                        </DialogDescription>
                    </DialogHeader>
                    {failure && showDeleteAllDialog ? (
                        <div className="px-6">
                            <DialogFieldError>
                                <ActionFailureMessage failure={failure} />
                            </DialogFieldError>
                        </div>
                    ) : null}
                    <DialogFooter>
                        <DialogClose
                            disabled={isDeleteAllPending}
                            render={<Button variant="ghost" />}
                        >
                            <T>Cancel</T>
                        </DialogClose>
                        <Button
                            isLoading={isDeleteAllPending}
                            onClick={handleDeleteAll}
                            variant="destructive"
                        >
                            <T>Delete all</T>
                        </Button>
                    </DialogFooter>
                </DialogPopup>
            </Dialog>
        </div>
    );
}

interface RecentlyDeletedRowProps {
    daysRemaining?: number;
    item: LibraryItemWithCollections;
    onRequestAction: (
        item: LibraryItemWithCollections,
        kind: PendingAction["kind"]
    ) => void;
}

function RecentlyDeletedRow({
    item,
    daysRemaining,
    onRequestAction,
}: RecentlyDeletedRowProps) {
    const SourceIcon = getSourceIcon(item.source) ?? Trash;
    const displayUrl = parseDisplayUrl(item.url);
    const isExpiresSoon =
        daysRemaining !== undefined &&
        daysRemaining <= RECENTLY_DELETED_EXPIRES_SOON_DAYS;

    const handleRestore = useStableCallback(() =>
        onRequestAction(item, "restore")
    );
    const handlePurge = useStableCallback(() => onRequestAction(item, "purge"));

    return (
        <div className="flex items-start gap-4 rounded-2xl bg-muted/60 p-4">
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
                    {daysRemaining === undefined ? null : (
                        <span
                            className={cn(
                                "rounded-full px-2 py-0.5 font-medium",
                                isExpiresSoon
                                    ? "bg-destructive/10 text-destructive"
                                    : "bg-muted text-muted-foreground"
                            )}
                        >
                            {formatCountdownCopy(daysRemaining)}
                        </span>
                    )}
                    <CollectionCountLabel collections={item.collections} />
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
                <Button onClick={handleRestore} size="sm" variant="outline">
                    <RotateCcw
                        aria-hidden
                        className="size-4"
                        focusable="false"
                    />
                    <T>Restore</T>
                </Button>
                <Button onClick={handlePurge} size="sm" variant="destructive">
                    <Trash aria-hidden className="size-4" focusable="false" />
                    <T>Delete forever</T>
                </Button>
            </div>
        </div>
    );
}

function ActionFailureMessage({ failure }: { failure: ActionFailure }) {
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
        default: {
            // Exhaustive over ActionFailureKind; fails to compile if a kind
            // is added without a fallback message.
            const unreachable: never = failure.kind;
            return unreachable;
        }
    }
}

function CollectionCountLabel({
    collections,
}: {
    collections: LibraryCollectionTag[];
}) {
    if (collections.length === 0) {
        return null;
    }
    return (
        <span className="truncate text-muted-foreground text-xs">
            {collections.length === 1 ? (
                <T>1 collection</T>
            ) : (
                <T>
                    <Var>{collections.length}</Var> collections
                </T>
            )}
        </span>
    );
}
