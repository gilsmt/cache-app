import { T } from "gt-next";
import { MessageSquare } from "lucide-react";
import type { ItemCommentWithItem } from "@/lib/comment/service";
import { FALLBACK_URL } from "@/lib/common/constants";
import { parseDisplayUrl, toValidUrl } from "@/lib/common/url";
import { getSourceIcon } from "@/lib/integrations/support";

interface CommentsListProps {
    comments: ItemCommentWithItem[];
}

export function CommentsList({ comments }: CommentsListProps) {
    if (comments.length === 0) {
        return (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-muted/50 p-8 text-center">
                <p className="font-medium text-foreground text-sm">
                    <T>No comments yet</T>
                </p>
                <p className="text-muted-foreground text-xs">
                    <T>
                        Add a comment to any saved item and it will show up
                        here.
                    </T>
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3">
            {comments.map((comment) => (
                <CommentRow comment={comment} key={comment.id} />
            ))}
        </div>
    );
}

interface CommentRowProps {
    comment: ItemCommentWithItem;
}

function CommentRow({ comment }: CommentRowProps) {
    const href = toValidUrl(comment.item.url);
    if (href === FALLBACK_URL) {
        return (
            <div className="flex items-start gap-4 rounded-2xl bg-muted/60 p-4">
                <CommentRowContent comment={comment} />
            </div>
        );
    }

    return (
        <a
            className="flex items-start gap-4 rounded-2xl bg-muted/60 p-4 transition-colors hover:bg-muted"
            href={href}
            rel="noopener noreferrer"
            target="_blank"
        >
            <CommentRowContent comment={comment} />
        </a>
    );
}

interface CommentRowContentProps {
    comment: ItemCommentWithItem;
}

function CommentRowContent({ comment }: CommentRowContentProps) {
    const SourceIcon = getSourceIcon(comment.item.source) ?? MessageSquare;
    const displayUrl = parseDisplayUrl(comment.item.url);
    const title = comment.item.caption?.trim() || displayUrl;

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
