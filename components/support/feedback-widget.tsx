"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { Send } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { stopPropagationForPrintableKeys } from "@/lib/common/dom";
import { createFeedback } from "@/lib/feedback/actions";
import type { FeedbackActionState } from "@/lib/feedback/schema";

const INITIAL_FEEDBACK_ACTION_STATE = {
    message: "",
    status: "idle",
} satisfies FeedbackActionState;

interface FeedbackWidgetProps
    extends React.ComponentProps<typeof PopoverTrigger> {
    context: string;
}

export function FeedbackWidget({
    context,
    openOnHover = true,
    ...props
}: FeedbackWidgetProps) {
    const pathname = usePathname();
    const formRef = React.useRef<HTMLFormElement>(null);

    const submitFeedback = useStableCallback(
        async (
            previousState: FeedbackActionState,
            formData: FormData
        ): Promise<FeedbackActionState> => {
            const result = await createFeedback(previousState, formData);
            if (result.status !== "success") {
                return result;
            }
            // Clear form state
            formRef.current?.reset();
            return result;
        }
    );

    const [state, formAction, isPending] = React.useActionState(
        submitFeedback,
        INITIAL_FEEDBACK_ACTION_STATE
    );

    return (
        <Popover>
            <PopoverTrigger {...props} openOnHover={openOnHover} />
            <PopoverPopup
                align="start"
                className="*:p-2"
                positionMethod="fixed"
                side="right"
            >
                <div className="space-y-3">
                    <form
                        action={formAction}
                        aria-busy={isPending}
                        className="space-y-4"
                        ref={formRef}
                    >
                        <input name="context" type="hidden" value={context} />
                        <input name="pagePath" type="hidden" value={pathname} />
                        <label className="sr-only" htmlFor="feedback-message">
                            Feedback message
                        </label>
                        <Textarea
                            aria-describedby={
                                state.status === "idle"
                                    ? undefined
                                    : "feedback-status"
                            }
                            autoFocus
                            className="min-h-24"
                            disabled={isPending}
                            id="feedback-message"
                            name="message"
                            onKeyDown={stopPropagationForPrintableKeys}
                            placeholder="Cache updates regularly with your suggestions. Have an idea to improve this page? Tell the Cache team"
                            required
                        />
                        <div className="flex items-center justify-between gap-3">
                            <p
                                aria-atomic="true"
                                aria-live="polite"
                                className={cn(
                                    "min-h-5 text-xs",
                                    state.status === "error"
                                        ? "text-destructive"
                                        : "text-muted-foreground"
                                )}
                                id="feedback-status"
                                role={
                                    state.status === "idle"
                                        ? undefined
                                        : "status"
                                }
                            >
                                {state.message}
                            </p>
                            <Button
                                isLoading={isPending}
                                size="sm"
                                type="submit"
                            >
                                <Send
                                    aria-hidden
                                    className="inline-block size-4 shrink-0"
                                    focusable="false"
                                />
                                Send
                            </Button>
                        </div>
                    </form>
                </div>
            </PopoverPopup>
        </Popover>
    );
}
