"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { Rss, Trash2 } from "lucide-react";
import * as React from "react";
import { createStore } from "stan-js";
import useSWR from "swr";
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
import { Input } from "@/components/ui/input";
import { createLogger } from "@/lib/common/logs/console/logger";
import {
    addFeed,
    type FeedViewModel,
    listFeeds,
    removeFeed,
} from "@/lib/integrations/rss/actions";

const FEEDS_SWR_KEY = "library:rss:feeds";

const log = createLogger("library:rss:manage-dialog");

const { useStore: useRssManageStore, actions: rssManageStoreActions } =
    createStore({
        isOpen: false,
    });

export function openRssManageDialog() {
    rssManageStoreActions.setIsOpen(true);
}

async function fetchFeeds(): Promise<FeedViewModel[]> {
    const result = await listFeeds();
    if (result.status !== "SUCCESS") {
        throw new Error(result.message);
    }
    return result.feeds;
}

export function RssManageDialog() {
    const { isOpen, setIsOpen } = useRssManageStore();
    const [removingFeedIds, setRemovingFeedIds] = React.useState<Set<string>>(
        () => new Set()
    );
    const [removeError, setRemoveError] = React.useState<string | null>(null);

    const {
        data: feeds = [],
        error,
        isLoading,
        mutate,
    } = useSWR<FeedViewModel[], Error>(
        isOpen ? FEEDS_SWR_KEY : null,
        fetchFeeds
    );

    const refreshFeeds = useStableCallback(() => {
        mutate().catch((refreshError: unknown) => {
            log.error("Refresh feeds failed", refreshError);
        });
    });

    const handleRemove = useStableCallback(async (feedId: string) => {
        setRemovingFeedIds((prev) => new Set(prev).add(feedId));
        setRemoveError(null);

        try {
            const result = await removeFeed({ feedId });
            if (result.status === "SUCCESS") {
                await mutate(
                    (currentFeeds) =>
                        (currentFeeds ?? []).filter(
                            (feed) => feed.id !== feedId
                        ),
                    { revalidate: false }
                );
            } else {
                log.error("Remove feed failed", result);
                setRemoveError(result.message);
            }
        } catch (unexpectedError) {
            log.error("Remove feed failed unexpectedly", unexpectedError);
            setRemoveError("We couldn't remove this feed right now.");
        } finally {
            setRemovingFeedIds((prev) => {
                const next = new Set(prev);
                next.delete(feedId);
                return next;
            });
        }
    });

    return (
        <Dialog onOpenChange={setIsOpen} open={isOpen}>
            <DialogPopup>
                <DialogHeader>
                    <DialogTitle>Manage RSS feeds</DialogTitle>
                    <DialogDescription>
                        Add or remove RSS feeds to import entries into your
                        library.
                    </DialogDescription>
                </DialogHeader>
                <DialogPanel className="space-y-2">
                    <RssAddFeedForm onFeedAdded={refreshFeeds} />
                    {removeError ? (
                        <ErrorMessage className="pt-2">
                            {removeError}
                        </ErrorMessage>
                    ) : null}
                    <RssFeedList
                        error={error}
                        feeds={feeds}
                        isLoading={isLoading}
                        onRetry={refreshFeeds}
                    >
                        {(feed) => (
                            <RssFeedItem
                                feed={feed}
                                isRemoving={removingFeedIds.has(feed.id)}
                                key={feed.id}
                                onRemove={handleRemove}
                            />
                        )}
                    </RssFeedList>
                </DialogPanel>
                <DialogFooter>
                    <DialogClose render={<Button variant="ghost" />}>
                        Close
                    </DialogClose>
                </DialogFooter>
            </DialogPopup>
        </Dialog>
    );
}

interface RssFeedListProps {
    children: (feed: FeedViewModel, index: number) => React.ReactNode;
    error: Error | undefined;
    feeds: FeedViewModel[];
    isLoading: boolean;
    onRetry: () => void;
}

function RssFeedList({
    children,
    error,
    feeds,
    isLoading,
    onRetry,
}: RssFeedListProps) {
    if (isLoading) {
        return <RssFeedListLoading />;
    }

    if (error && feeds.length === 0) {
        return (
            <RssFeedListError onRetry={onRetry}>
                {error.message}
            </RssFeedListError>
        );
    }

    if (feeds.length === 0) {
        return <RssFeedListEmpty />;
    }

    return <div className="flex flex-col gap-2">{feeds.map(children)}</div>;
}

function RssFeedListLoading() {
    return (
        <p className="text-muted-foreground text-sm" role="status">
            Loading feeds...
        </p>
    );
}

interface RssFeedListErrorProps {
    children: React.ReactNode;
    onRetry: () => void;
}

function RssFeedListError({ children, onRetry }: RssFeedListErrorProps) {
    return (
        <div className="flex flex-col items-start gap-1.5">
            <ErrorMessage className="text-sm">{children}</ErrorMessage>
            <Button onClick={onRetry} size="sm" variant="ghost">
                Try again
            </Button>
        </div>
    );
}

function RssFeedListEmpty() {
    return (
        <p className="text-muted-foreground text-sm">
            No feeds added yet. Paste a feed URL above to get started.
        </p>
    );
}

interface RssFeedItemProps {
    feed: FeedViewModel;
    isRemoving: boolean;
    onRemove: (feedId: string) => void;
}

function RssFeedItem({ feed, isRemoving, onRemove }: RssFeedItemProps) {
    const handleRemove = useStableCallback(() => onRemove(feed.id));

    return (
        <div className="flex items-center gap-3 rounded-lg bg-muted p-3 text-sm">
            <Rss
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
                focusable="false"
            />
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                    {feed.title ?? feed.feedUrl}
                </p>
                {feed.title ? (
                    <p className="truncate text-muted-foreground">
                        {feed.feedUrl}
                    </p>
                ) : null}
                {feed.lastError ? (
                    <p className="text-destructive text-xs">{feed.lastError}</p>
                ) : null}
            </div>
            <Button
                aria-label={`Remove ${feed.title ?? feed.feedUrl}`}
                isLoading={isRemoving}
                onClick={handleRemove}
                size="icon"
                variant="ghost"
            >
                <Trash2 aria-hidden className="size-4" focusable="false" />
            </Button>
        </div>
    );
}

interface RssAddFeedFormProps {
    onFeedAdded: () => void;
}

function RssAddFeedForm({ onFeedAdded }: RssAddFeedFormProps) {
    const [url, setUrl] = React.useState("");
    const [error, setError] = React.useState<string | null>(null);
    const [isPending, startTransition] = React.useTransition();

    const handleChange = useStableCallback(
        (event: React.ChangeEvent<HTMLInputElement>) => {
            setUrl(event.currentTarget.value);
            setError(null);
        }
    );

    const handleSubmit = useStableCallback(
        (event: React.ChangeEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (isPending) {
                return;
            }

            setError(null);
            startTransition(async () => {
                const result = await addFeed({ feedUrl: url.trim() });
                if (result.status !== "SUCCESS") {
                    setError(result.message);
                    return;
                }
                setUrl("");
                onFeedAdded();
            });
        }
    );

    return (
        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
            <div className="flex gap-2">
                <Input
                    aria-describedby={error ? "add-feed-error" : undefined}
                    aria-invalid={error ? true : undefined}
                    aria-label="Feed URL"
                    autoFocus
                    className="flex-1"
                    onChange={handleChange}
                    placeholder="Paste feed URL"
                    required
                    type="url"
                    value={url}
                />
                <Button isLoading={isPending} type="submit">
                    Add feed
                </Button>
            </div>
            {error ? (
                <ErrorMessage className="pt-2" id="add-feed-error">
                    {error}
                </ErrorMessage>
            ) : null}
        </form>
    );
}
