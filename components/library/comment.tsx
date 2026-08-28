"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useValueAsRef } from "@base-ui/utils/useValueAsRef";
import { T, useGT } from "gt-next";
import * as React from "react";
import useSWR from "swr";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave } from "@/hooks/use-autosave";
import type { LibraryItemWithCollections } from "@/lib/collections/utils";
import {
    getLibraryItemComment,
    updateLibraryItemComment,
} from "@/lib/comments/actions";
import {
    COMMENT_TEXT_MAX_LENGTH,
    normalizeCommentText,
} from "@/lib/comments/utils";
import { ACTION_STATUS } from "@/lib/common/constants";
import { stopPropagationForMenuTextInputKeys } from "@/lib/common/dom";

const COMMENT_SWR_KEY_PREFIX = "library-item-comment";

async function fetchItemComment([
    _commentSwrKeyPrefix,
    libraryItemId,
]: readonly [string, string]): Promise<string | null> {
    const result = await getLibraryItemComment(libraryItemId);

    if (result.status !== ACTION_STATUS.SUCCESS) {
        throw new Error(result.message);
    }

    return result.contentText;
}

function getCommentKey(
    itemId: string,
    isOpen: boolean
): readonly [string, string] | null {
    return isOpen ? [COMMENT_SWR_KEY_PREFIX, itemId] : null;
}

interface CommentTextareaProps {
    isOpen: boolean;
    item: LibraryItemWithCollections;
}

/**
 * keyed by `item.id` here rather than left to callers
 * since a surviving mount would save one item's draft onto another.
 */
export function CommentTextarea(props: CommentTextareaProps) {
    return <ItemCommentTextarea key={props.item.id} {...props} />;
}

interface ItemCommentTextareaProps {
    isOpen: boolean;
    item: LibraryItemWithCollections;
}

function ItemCommentTextarea({ isOpen, item }: ItemCommentTextareaProps) {
    const gt = useGT();

    const { data, error, isLoading, mutate } = useSWR(
        getCommentKey(item.id, isOpen),
        fetchItemComment,
        { keepPreviousData: true }
    );

    const [hasOpened, setHasOpened] = React.useState(false);
    if (isOpen && !hasOpened) {
        setHasOpened(true);
    }

    const savedContent = data ?? "";
    const [content, setContent] = React.useState(savedContent);

    const contentRef = useValueAsRef(content);
    const hasBeenEditedRef = React.useRef(false);
    const editVersionRef = React.useRef(0);

    const [prevSavedContent, setPrevSavedContent] =
        React.useState(savedContent);
    if (prevSavedContent !== savedContent) {
        setPrevSavedContent(savedContent);
        if (!hasBeenEditedRef.current) {
            setContent(savedContent);
        }
    }

    const handleSave = useStableCallback(async () => {
        const saveVersion = editVersionRef.current;
        const next = normalizeCommentText(contentRef.current) ?? "";
        const result = await updateLibraryItemComment({
            contentText: next,
            libraryItemId: item.id,
        });
        if (result.status !== ACTION_STATUS.SUCCESS) {
            return false;
        }

        await mutate(result.contentText, { revalidate: false });

        if (editVersionRef.current === saveVersion) {
            hasBeenEditedRef.current = false;
        }
        return true;
    });

    const handleChange = useStableCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            editVersionRef.current += 1;
            hasBeenEditedRef.current = true;
            setContent(event.currentTarget.value);
        }
    );

    const { saveStatus } = useAutosave({
        content,
        enabled: hasOpened && !isLoading,
        onSave: handleSave,
        savedContent,
    });

    if (error && data === undefined) {
        return (
            <div className="flex h-20 min-h-16 items-center rounded-lg bg-muted px-2.5 py-2 text-muted-foreground text-xs">
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
