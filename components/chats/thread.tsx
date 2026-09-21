"use client";

import { useChat } from "@ai-sdk/react";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { DefaultChatTransport, type UIMessage } from "ai";
import { T } from "gt-next";
import * as React from "react";
import { ChatComposer } from "@/components/chats/composer";
import { ChatMessage } from "@/components/chats/message";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
}

export function ChatThread({ chatId, initialMessages }: ChatThreadProps) {
    const transport = createChatTransport(chatId);
    const { error, messages, sendMessage, status, stop } = useChat({
        id: chatId,
        messages: initialMessages,
        transport,
    });
    const scrollViewportRef = React.useRef<HTMLDivElement | null>(null);
    const shouldStickRef = React.useRef(true);

    const isBusy = status === "submitted" || status === "streaming";
    const lastMessageId = messages.at(-1)?.id;

    // biome-ignore lint/correctness/useExhaustiveDependencies: status drives re-scroll for the thinking indicator and stream updates while the effect only touches refs.
    React.useEffect(() => {
        const viewport = scrollViewportRef.current;
        if (!(viewport && shouldStickRef.current)) {
            return;
        }
        viewport.scrollTop = viewport.scrollHeight;
    }, [lastMessageId, status]);

    const handleViewportScroll = useStableCallback(
        (event: React.UIEvent<HTMLDivElement>) => {
            const viewport = event.currentTarget;
            shouldStickRef.current =
                viewport.scrollHeight -
                    viewport.scrollTop -
                    viewport.clientHeight <
                CHAT_SCROLL_STICK_DISTANCE_PX;
        }
    );

    const handleSubmit = useStableCallback((text: string) => {
        shouldStickRef.current = true;
        sendMessage({ text });
    });

    const handleStop = useStableCallback(() => {
        stop();
    });

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col">
            <div
                className="min-h-0 flex-1 overflow-y-auto"
                onScroll={handleViewportScroll}
                ref={scrollViewportRef}
            >
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
                    {messages.map((message) => (
                        <ChatMessage key={message.id} message={message} />
                    ))}
                    {status === "submitted" ? (
                        <p className="px-1 text-muted-foreground text-sm">
                            <T>Thinking…</T>
                        </p>
                    ) : null}
                </div>
            </div>
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-6 pb-6">
                {error ? (
                    <Alert variant="error">
                        <AlertTitle>
                            <T>Request failed</T>
                        </AlertTitle>
                        <AlertDescription>{error.message}</AlertDescription>
                    </Alert>
                ) : null}
                <ChatComposer
                    isBusy={isBusy}
                    onStop={handleStop}
                    onSubmit={handleSubmit}
                />
            </div>
        </div>
    );
}
