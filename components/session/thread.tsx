"use client";

import { useChat } from "@ai-sdk/react";
import { useAnimationFrame } from "@base-ui/utils/useAnimationFrame";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useGT } from "gt-next";
import { ArrowDown } from "lucide-react";
import * as React from "react";
import { ThinkingOrb } from "thinking-orbs";
import {
    Composer,
    ComposerInput,
    ComposerSubmitButton,
} from "@/components/session/composer";
import { ThreadMessage } from "@/components/session/message";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { ToBottomButton } from "@/components/ui/to-bottom-button";
import { getErrorMessage } from "@/lib/common/error";
import { getMessageText } from "@/lib/threads/messages";
import type { ThreadSource } from "@/lib/threads/sources";

function createThreadTransport(threadId: string) {
    return new DefaultChatTransport({
        api: `/api/threads/${threadId}`,
        prepareSendMessagesRequest: ({ messages }) => ({
            body: { message: messages.at(-1) },
        }),
    });
}

interface ThreadProps {
    initialMessages: UIMessage[];
    sources: ThreadSource[];
    threadId: string;
}

export function Thread({ initialMessages, sources, threadId }: ThreadProps) {
    const gt = useGT();
    const animationFrame = useAnimationFrame();
    const { error, messages, sendMessage, status, stop } = useChat({
        id: threadId,
        messages: initialMessages,
        transport: createThreadTransport(threadId),
    });
    const scrollViewportRef = React.useRef<HTMLDivElement | null>(null);
    const shouldStickRef = React.useRef(true);

    const isBusy = status === "submitted" || status === "streaming";
    const lastMessage = messages.at(-1);
    const lastMessageId = lastMessage?.id;
    const lastMessageText = lastMessage ? getMessageText(lastMessage) : "";
    const isAwaitingFirstToken =
        isBusy &&
        lastMessage?.role === "assistant" &&
        lastMessageText.length === 0;

    // biome-ignore lint/correctness/useExhaustiveDependencies: streamed text must trigger the effect so the viewport follows each new chunk; the effect only reads refs.
    React.useEffect(() => {
        if (!shouldStickRef.current) {
            return;
        }

        animationFrame.request(() => {
            const viewport = scrollViewportRef.current;
            if (viewport && shouldStickRef.current) {
                viewport.scrollTop = viewport.scrollHeight;
            }
        });

        return animationFrame.cancel;
    }, [animationFrame, lastMessageId, lastMessageText, status]);

    const handleStickChange = useStableCallback((shouldStick: boolean) => {
        shouldStickRef.current = shouldStick;
    });

    const handleSubmit = useStableCallback((text: string) => {
        shouldStickRef.current = true;
        sendMessage({
            metadata: { createdAt: new Date().toISOString() },
            text,
        });
    });

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
                <div
                    className="h-full min-h-0 overflow-y-auto overscroll-contain"
                    ref={scrollViewportRef}
                >
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
                        {messages.map((message, index) => (
                            <ThreadMessage
                                key={message.id}
                                message={message}
                                sources={index === 0 ? sources : undefined}
                            />
                        ))}
                        {status === "submitted" || isAwaitingFirstToken ? (
                            <div className="flex items-center gap-2 px-1 py-1">
                                <ThinkingOrb size={20} state="shaping" />
                                <span className="text-muted-foreground text-sm">
                                    {gt("Thinking…")}
                                </span>
                            </div>
                        ) : null}
                    </div>
                </div>
                <ToBottomButton
                    aria-label={gt("Scroll to bottom")}
                    onStickChange={handleStickChange}
                    viewportRef={scrollViewportRef}
                >
                    <ArrowDown aria-hidden focusable="false" />
                </ToBottomButton>
            </div>
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-6">
                {error ? (
                    <Alert variant="error">
                        <AlertTitle>{gt("Request failed")}</AlertTitle>
                        <AlertDescription>
                            {getThreadErrorMessage(error)}
                        </AlertDescription>
                    </Alert>
                ) : null}
                <Composer isBusy={isBusy} onStop={stop} onSubmit={handleSubmit}>
                    <ComposerInput
                        openOnInputClick={false}
                        render={
                            <Textarea
                                aria-label={gt("Chat message")}
                                className="block w-full text-base sm:text-sm"
                                isUnstyled
                                placeholder={gt("Ask a follow-up")}
                                size="sm"
                                style={{ minHeight: "2.5rem" }}
                            />
                        }
                        submitOnEnter
                    >
                        <ComposerSubmitButton />
                    </ComposerInput>
                </Composer>
            </div>
        </div>
    );
}

function getThreadErrorMessage(error: Error): string {
    try {
        // AI SDK surfaces the response body as Error.message.
        return getErrorMessage(JSON.parse(error.message), error.message);
    } catch {
        // Non-JSON message; use the raw message below.
    }
    return error.message;
}
