"use client";

import { useIsoLayoutEffect } from "@base-ui/utils/useIsoLayoutEffect";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useValueAsRef } from "@base-ui/utils/useValueAsRef";
import { T, useGT } from "gt-next";
import * as React from "react";
import useSWR from "swr";
import { useAutosave } from "@/components/hooks/use-autosave";
import { Textarea } from "@/components/ui/textarea";
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

    const contentRef = useValueAsRef(content);
    const savedContentRef = useValueAsRef(savedContent);
    const editVersionRef = React.useRef(0);
    // A newer edit can match an old server value.
    const synchronizedEditVersionRef = React.useRef(0);
    const pendingSaveVersionRef = React.useRef<number | null>(null);
    const previousSavedContentRef = React.useRef(savedContent);

    useIsoLayoutEffect(() => {
        if (previousSavedContentRef.current === savedContent) {
            return;
        }
        previousSavedContentRef.current = savedContent;

        if (content === savedContent) {
            synchronizedEditVersionRef.current = editVersionRef.current;
            return;
        }
        if (editVersionRef.current === synchronizedEditVersionRef.current) {
            setContent(savedContent);
        }
    }, [content, savedContent]);

    async function handleSave(contentToSave: string) {
        const saveVersion = editVersionRef.current;
        pendingSaveVersionRef.current = saveVersion;
        let didSave = false;
        try {
            const next = normalizeCommentText(contentToSave) ?? "";
            const result = await updateLibraryItemComment({
                contentText: next,
                itemId,
            });
            if (result.status !== ACTION_STATUS.SUCCESS) {
                return false;
            }
            didSave = true;

            await mutate(result.contentText, { revalidate: false });

            const saved = result.contentText ?? "";
            if (editVersionRef.current === saveVersion) {
                synchronizedEditVersionRef.current = saveVersion;
                setContent(saved);
            } else if (contentRef.current === saved) {
                synchronizedEditVersionRef.current = editVersionRef.current;
            }
            return saved;
        } finally {
            if (pendingSaveVersionRef.current === saveVersion) {
                pendingSaveVersionRef.current = null;
                if (
                    !didSave &&
                    contentRef.current === savedContentRef.current
                ) {
                    synchronizedEditVersionRef.current = editVersionRef.current;
                }
            }
        }
    }

    const handleChange = useStableCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            const nextContent = event.currentTarget.value;
            const nextEditVersion = editVersionRef.current + 1;
            editVersionRef.current = nextEditVersion;
            if (
                pendingSaveVersionRef.current === null &&
                nextContent === savedContent
            ) {
                synchronizedEditVersionRef.current = nextEditVersion;
            }
            setContent(nextContent);
        }
    );

    const { status: saveStatus } = useAutosave({
        content,
        enabled: !isLoading,
        onSave: handleSave,
        savedContent,
    });

    if (error && data === undefined) {
        return (
            <div className="bg-muted text-muted-foreground flex h-20 items-center rounded-lg px-2.5 py-2 text-xs">
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
