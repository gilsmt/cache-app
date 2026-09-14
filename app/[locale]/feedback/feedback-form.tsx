"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { T } from "gt-next";
import { CircleCheck } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createPublicFeedback } from "@/lib/feedback/actions";
import {
    FEEDBACK_PAGE_CONTEXT,
    type FeedbackActionState,
    HONEYPOT_FIELD,
} from "@/lib/feedback/schema";

const INITIAL_PUBLIC_FEEDBACK_STATE = {
    message: "",
    status: "idle",
} satisfies FeedbackActionState;

const FEEDBACK_PAGE_PATH = "/feedback";
const MESSAGE_MAX_LENGTH = 1000;

interface FeedbackFormProps {
    initialEmail?: string;
}

export function FeedbackForm({ initialEmail }: FeedbackFormProps) {
    const formRef = React.useRef<HTMLFormElement>(null);
    const [message, setMessage] = React.useState("");

    const submitPublicFeedback = useStableCallback(
        async (
            previousState: FeedbackActionState,
            formData: FormData
        ): Promise<FeedbackActionState> => {
            const result = await createPublicFeedback(previousState, formData);
            if (result.status !== "success") {
                return result;
            }
            formRef.current?.reset();
            setMessage("");
            return result;
        }
    );

    const [state, formAction, isPending] = React.useActionState(
        submitPublicFeedback,
        INITIAL_PUBLIC_FEEDBACK_STATE
    );

    const handleMessageChange = useStableCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            setMessage(event.target.value);
        }
    );

    if (state.status === "success") {
        return <FeedbackSuccess message={state.message} />;
    }

    const isMessageEmpty = message.trim().length === 0;

    return (
        <form
            action={formAction}
            aria-busy={isPending}
            className="flex w-full flex-col gap-4"
            ref={formRef}
        >
            <input name="context" type="hidden" value={FEEDBACK_PAGE_CONTEXT} />
            <input name="pagePath" type="hidden" value={FEEDBACK_PAGE_PATH} />
            <input name="email" type="hidden" value={initialEmail ?? ""} />
            <input
                aria-hidden="true"
                autoComplete="off"
                className="absolute -left-[9999px] h-0 w-0 opacity-0"
                name={HONEYPOT_FIELD}
                tabIndex={-1}
                type="text"
            />
            <label className="sr-only" htmlFor="public-feedback-message">
                <T>Feedback message</T>
            </label>
            <Textarea
                aria-describedby={
                    state.status === "idle"
                        ? undefined
                        : "public-feedback-status"
                }
                autoFocus
                disabled={isPending}
                id="public-feedback-message"
                maxLength={MESSAGE_MAX_LENGTH}
                name="message"
                onChange={handleMessageChange}
                placeholder="What could Cache do better?"
                required
                rows={4}
                value={message}
            />
            <p
                aria-atomic="true"
                aria-live="polite"
                className={cn(
                    "min-h-5 text-center text-xs",
                    state.status === "error"
                        ? "text-destructive"
                        : "text-muted-foreground"
                )}
                id="public-feedback-status"
                role={state.status === "idle" ? undefined : "status"}
            >
                {state.message}
            </p>
            <Button
                className="w-full"
                disabled={isMessageEmpty}
                isLoading={isPending}
                type="submit"
            >
                <T>Send feedback</T>
            </Button>
        </form>
    );
}

interface FeedbackSuccessProps {
    message: string;
}

function FeedbackSuccess({ message }: FeedbackSuccessProps) {
    return (
        <div className="flex w-full flex-col items-center gap-2 text-center">
            <CircleCheck
                aria-hidden
                className="size-8 text-emerald-500"
                focusable="false"
            />
            <p className="font-medium text-primary text-sm" role="status">
                {message}
            </p>
            <p className="text-muted-foreground text-xs">
                <T>Your feedback helps make Cache better.</T>
            </p>
        </div>
    );
}
