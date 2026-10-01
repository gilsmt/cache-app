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
import { ChatMessage } from "@/components/session/message";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatSource } from "@/lib/chats/sources";

const CHAT_SCROLL_STICK_DISTANCE_PX = 80;

function createChatTransport(chatId: string) {
    return new DefaultChatTransport({
        api: `/api/chats/${chatId}`,
        prepareSendMessagesRequest: ({ messages }) => ({
            body: { message: messages.at(-1) },
        }),
    });
}

interface ChatThreadProps {
    chatId: string;
    initialMessages: UIMessage[];
    sources: ChatSource[];
}

export function ChatThread({
    chatId,
    initialMessages,
    sources,
}: ChatThreadProps) {
    const gt = useGT();
    const animationFrame = useAnimationFrame();
    const { error, messages, sendMessage, status, stop } = useChat({
        id: chatId,
        messages: initialMessages,
        transport: createChatTransport(chatId),
    });
    const scrollViewportRef = React.useRef<HTMLDivElement | null>(null);
    const shouldStickRef = React.useRef(true);
    const [isAwayFromBottom, setIsAwayFromBottom] = React.useState(false);

    const isBusy = status === "submitted" || status === "streaming";
    const lastMessageId = messages.at(-1)?.id;
    const lastMessageText = messages
        .at(-1)
        ?.parts.map((part) => (part.type === "text" ? part.text : ""))
        .join("");

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

    const handleViewportScroll = useStableCallback(
        (event: React.UIEvent<HTMLDivElement>) => {
            const viewport = event.currentTarget;
            shouldStickRef.current = isScrolledToBottom(viewport);
            setIsAwayFromBottom(!shouldStickRef.current);
        }
    );

    const handleScrollToBottom = useStableCallback(() => {
        const viewport = scrollViewportRef.current;
        if (!viewport) {
            return;
        }
        shouldStickRef.current = true;
        viewport.scrollTo({ behavior: "smooth", top: viewport.scrollHeight });
        setIsAwayFromBottom(false);
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
                    onScroll={handleViewportScroll}
                    ref={scrollViewportRef}
                >
                    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
                        {messages.map((message, index) => (
                            <ChatMessage
                                key={message.id}
                                message={message}
                                sources={index === 0 ? sources : undefined}
                            />
                        ))}
                        {status === "submitted" ? (
                            <div className="flex items-center gap-2 px-1 py-1">
                                <ThinkingOrb size={20} state="shaping" />
                                <span className="text-muted-foreground text-sm">
                                    {gt("Thinking…")}
                                </span>
                            </div>
                        ) : null}
                    </div>
                </div>
                {isAwayFromBottom ? (
                    <Button
                        aria-label={gt("Scroll to bottom")}
                        className="absolute bottom-4 left-1/2 -translate-x-1/2 shadow-md/5"
                        onClick={handleScrollToBottom}
                        size="icon-sm"
                        variant="secondary"
                    >
                        <ArrowDown aria-hidden focusable="false" />
                    </Button>
                ) : null}
            </div>
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-6 pb-6">
                {error ? (
                    <Alert variant="error">
                        <AlertTitle>{gt("Request failed")}</AlertTitle>
                        <AlertDescription>
                            {getChatErrorMessage(error)}
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

function getChatErrorMessage(error: Error): string {
    try {
        const parsed: unknown = JSON.parse(error.message);
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            "error" in parsed &&
            typeof parsed.error === "string" &&
            parsed.error.length > 0
        ) {
            return parsed.error;
        }
    } catch {
        // Non-JSON message; use the raw message below.
    }
    return error.message;
}

function isScrolledToBottom(viewport: HTMLElement): boolean {
    return (
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <
        CHAT_SCROLL_STICK_DISTANCE_PX
    );
}
