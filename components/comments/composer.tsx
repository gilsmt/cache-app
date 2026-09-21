"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { T, useGT } from "gt-next";
import * as React from "react";
import useSWR from "swr";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";
import {
    getLibraryItemComment,
    updateLibraryItemComment,
} from "@/lib/comment/actions";
import {
    COMMENT_TEXT_MAX_LENGTH,
    normalizeCommentText,
} from "@/lib/comment/utils";
import { ACTION_STATUS } from "@/lib/common/constants";
import { stopPropagationForMenuTextInputKeys } from "@/lib/common/dom";

async function fetchItemComment([_key, libraryItemId]: readonly [
    string,
    string,
]): Promise<string | null> {
    const result = await getLibraryItemComment(libraryItemId);

    if (result.status !== ACTION_STATUS.SUCCESS) {
        throw new Error(result.message);
    }

    return result.contentText;
}

interface CommentComposerProps {
    isOpen: boolean;
    itemId: string;
}

/**
 * keyed by `libraryItemId` here rather than left to callers
 * since a surviving mount would save one item's draft onto another.
 */
export function CommentComposer(props: CommentComposerProps) {
    return <CommentComposerImpl key={props.itemId} {...props} />;
}

function CommentComposerImpl({ isOpen, itemId }: CommentComposerProps) {
    const gt = useGT();

    const { data, error, isLoading, mutate } = useSWR(
        isOpen ? (["library-item-comment", itemId] as const) : null,
        fetchItemComment,
        { keepPreviousData: true }
    );

    const savedContent = data ?? "";
    const [content, setContent] = React.useState(savedContent);

    const editVersionRef = React.useRef(0);

    const [prevSavedContent, setPrevSavedContent] =
        React.useState(savedContent);
    if (prevSavedContent !== savedContent) {
        setPrevSavedContent(savedContent);
        if (content === prevSavedContent) {
            setContent(savedContent);
        }
    }

    async function handleSave() {
        const saveVersion = editVersionRef.current;
        const next = normalizeCommentText(content) ?? "";
        const result = await updateLibraryItemComment({
            contentText: next,
            itemId,
        });
        if (result.status !== ACTION_STATUS.SUCCESS) {
            return false;
        }

        await mutate(result.contentText, { revalidate: false });

        if (editVersionRef.current === saveVersion) {
            setContent(next);
            return next;
        }
        return true;
    }

    const handleChange = useStableCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            editVersionRef.current += 1;
            setContent(event.currentTarget.value);
        }
    );

    const { saveStatus } = useAutosave({
        content,
        enabled: !isLoading,
        onSave: handleSave,
        savedContent,
    });

    if (error && data === undefined) {
        return (
            <div className="flex h-20 items-center rounded-lg bg-muted px-2.5 py-2 text-muted-foreground text-xs">
                <T>Comment unavailable</T>
            </div>
        );
    }

    return (
        <div aria-busy={isLoading} className="mt-1 mb-1.5 space-y-1 px-0.5">
            <Textarea
                aria-label={gt("Comment on this item")}
                className="dark:border-none"
                disabled={isLoading}
                maxLength={COMMENT_TEXT_MAX_LENGTH}
                onChange={handleChange}
                onKeyDown={stopPropagationForMenuTextInputKeys}
                placeholder={gt("Add a comment…")}
                rows={4}
                size="sm"
                value={content}
            />
            {saveStatus === "error" && (
                <p aria-live="polite" className="text-destructive text-xs">
                    <T>Not saved</T>
                </p>
            )}
        </div>
    );
}
