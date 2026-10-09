"use client";

import { T } from "gt-next";
import { MessageSquare } from "lucide-react";
import * as React from "react";
import { getNoteExcerpt } from "@/lib/collections/utils";
import type { ItemCommentWithItem } from "@/lib/comment/service";
import { FALLBACK_URL, ITEM_KIND_NOTE } from "@/lib/common/constants";
import { dayjs } from "@/lib/common/dayjs";
import { parseDisplayUrl, toValidUrl } from "@/lib/common/url";
import { getSourceIcon } from "@/lib/integrations/support";

const CommentsListContext = React.createContext<ItemCommentWithItem[] | null>(
    null
);

function useCommentsListContext(): ItemCommentWithItem[] {
    const context = React.use(CommentsListContext);
    if (!context) {
        throw new Error(
            "CommentsList compound components must be used within CommentsList."
        );
    }
    return context;
}

interface CommentsListProps {
    comments: ItemCommentWithItem[];
}

export function CommentsList({ comments }: CommentsListProps) {
    return (
        <CommentsListContext value={comments}>
            <CommentsListEmpty />
            <CommentsListContent>
                {(comment) => (
                    <CommentsListItem comment={comment} key={comment.id} />
                )}
            </CommentsListContent>
        </CommentsListContext>
    );
}

interface CommentsListContentProps {
    children: (comment: ItemCommentWithItem, index: number) => React.ReactNode;
}

function CommentsListContent({ children }: CommentsListContentProps) {
    const comments = useCommentsListContext();

    if (comments.length === 0) {
        return null;
    }

    return (
        <ul className="flex list-none flex-col gap-3">
            {comments.map(children)}
        </ul>
    );
}

function CommentsListEmpty() {
    const comments = useCommentsListContext();

    if (comments.length > 0) {
        return null;
    }

    return (
        <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-2xl bg-muted/50 p-8 text-center">
            <MessageSquare
                aria-hidden
                className="size-5 text-muted-foreground"
                focusable="false"
            />
            <p className="font-medium text-foreground text-sm">
                <T>No comments yet</T>
            </p>
            <p className="text-muted-foreground text-xs">
                <T>Add a comment to any saved item and it will show up here.</T>
            </p>
        </div>
    );
}

interface CommentsListItemProps {
    comment: ItemCommentWithItem;
}

function CommentsListItem({ comment }: CommentsListItemProps) {
    const href = toValidUrl(comment.item.url);

    if (href === FALLBACK_URL) {
        return (
            <li className="list-none rounded-2xl bg-muted/60">
                <div className="flex items-start gap-4 p-4">
                    <CommentsListItemValue comment={comment} />
                </div>
            </li>
        );
    }

    return (
        <li className="list-none rounded-2xl bg-muted/60">
            <a
                className="flex items-start gap-4 rounded-2xl p-4 hover:bg-muted"
                href={href}
                rel="noopener noreferrer"
                target="_blank"
            >
                <CommentsListItemValue comment={comment} />
            </a>
        </li>
    );
}

interface CommentsListItemValueProps {
    comment: ItemCommentWithItem;
}

function CommentsListItemValue({ comment }: CommentsListItemValueProps) {
    const SourceIcon = getSourceIcon(comment.item.source) ?? MessageSquare;
    const displayUrl = parseDisplayUrl(comment.item.url);
    const title =
        comment.item.kind === ITEM_KIND_NOTE
            ? getNoteExcerpt(comment.item.noteContentText) || "Untitled note"
            : comment.item.caption?.trim() || displayUrl;

    return (
        <>
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <SourceIcon aria-hidden className="size-5" focusable="false" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="truncate font-medium text-foreground text-sm">
                    {title}
                </p>
                {displayUrl ? (
                    <p className="truncate text-muted-foreground text-xs">
                        {displayUrl}
                    </p>
                ) : null}
                <p className="wrap-break-words whitespace-pre-wrap text-foreground text-sm">
                    {comment.contentText}
                </p>
                <time
                    className="text-muted-foreground text-xs"
                    dateTime={comment.updatedAt.toISOString()}
                    suppressHydrationWarning
                    title={dayjs(comment.updatedAt).format(
                        "MMM DD, YYYY, h:mm A"
                    )}
                >
                    {comment.updatedAt.toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                    })}
                </time>
            </div>
        </>
    );
}
