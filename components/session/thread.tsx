"use client";

import { useChat } from "@ai-sdk/react";
import type { BaseUIEvent } from "@base-ui/react";
import { useAnimationFrame } from "@base-ui/utils/useAnimationFrame";
import { useStableCallback } from "@base-ui/utils/useStableCallback";
import {
    DefaultChatTransport,
    getToolName,
    isToolUIPart,
    type UIMessage,
} from "ai";
import { T, useGT } from "gt-next";
import {
    ArrowDown,
    Check,
    CircleAlert,
    RotateCcw,
    TriangleAlert,
} from "lucide-react";
import { catchError, type ErrorInfo } from "next/error";
import * as React from "react";
import { Streamdown } from "streamdown";
import { ThinkingOrb } from "thinking-orbs";
import {
    Composer,
    ComposerInput,
    ComposerSubmitButton,
    CopyResponseButton,
    ReadAloudResponseButton,
    useComposerContext,
} from "@/components/session/composer";
import {
    Alert,
    AlertAction,
    AlertDescription,
    AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { CollapsibleListHorizontal } from "@/components/ui/collapsible-list";
import { Textarea } from "@/components/ui/textarea";
import { ToBottomButton } from "@/components/ui/to-bottom-button";
import { dayjs } from "@/lib/common/dayjs";
import { getErrorMessage } from "@/lib/common/error";
import { isSubmitKey } from "@/lib/common/keyboard";
import { createLogger } from "@/lib/common/logs/console/logger";
import { uses24HourClock } from "@/lib/common/time";
import { isHttpUrl, normalizeURL } from "@/lib/common/url";
import { getMessageCreatedAt, getMessageText } from "@/lib/threads/messages";
import type { ThreadSource } from "@/lib/threads/sources";

const log = createLogger("Threads");

function createThreadTransport(threadId: string) {
    return new DefaultChatTransport({
        api: `/api/threads/${threadId}`,
        prepareSendMessagesRequest: ({ messages }) => ({
            body: { message: messages.at(-1) },
        }),
    });
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

interface ThreadToolActivity {
    key: string;
    name: string;
    state: string;
}

function getThreadToolActivities(message: UIMessage): ThreadToolActivity[] {
    return message.parts.flatMap((part, index) =>
        isToolUIPart(part)
            ? [
                  {
                      // Parts only append during streaming, so the index key is stable.
                      key: `${getToolName(part)}:${index}`,
                      name: getToolName(part),
                      state: part.state ?? "input-available",
                  },
              ]
            : []
    );
}

function isActiveThreadToolState(state: string): boolean {
    // Terminal states end the activity. Unknown future states stay visible
    // so new tool behavior fails loud instead of vanishing.
    return (
        state !== "output-available" &&
        state !== "output-error" &&
        state !== "output-denied"
    );
}

interface ThreadProps {
    initialMessages: UIMessage[];
    sources: ThreadSource[];
    threadId: string;
}

export function Thread({ initialMessages, sources, threadId }: ThreadProps) {
    const gt = useGT();
    const animationFrame = useAnimationFrame();
    const { error, messages, regenerate, sendMessage, status, stop } = useChat({
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
    const lastMessageTools =
        lastMessage?.role === "assistant"
            ? getThreadToolActivities(lastMessage)
            : [];
    const hasActiveThreadTools = lastMessageTools.some((activity) =>
        isActiveThreadToolState(activity.state)
    );
    const lastMessageToolCount = lastMessageTools.length;

    // biome-ignore lint/correctness/useExhaustiveDependencies: streamed text and tool updates must trigger the effect so the viewport follows each new chunk; the effect only reads refs.
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
    }, [
        animationFrame,
        hasActiveThreadTools,
        lastMessageId,
        lastMessageText,
        lastMessageToolCount,
        status,
    ]);

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

    const handleRetry = useStableCallback(() => {
        shouldStickRef.current = true;
        regenerate();
    });

    return (
        <div className="flex min-h-0 w-full flex-1 flex-col">
            <div className="relative min-h-0 flex-1">
                <div
                    className="h-full min-h-0 overflow-y-auto overscroll-contain"
                    ref={scrollViewportRef}
                >
                    <ThreadListErrorBoundary threadId={threadId}>
                        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-6">
                            {messages.map((message, index) => (
                                <ThreadMessage
                                    key={message.id}
                                    message={message}
                                    sources={index === 0 ? sources : undefined}
                                />
                            ))}
                            {(status === "submitted" || isAwaitingFirstToken) &&
                            !hasActiveThreadTools ? (
                                <div className="flex items-center gap-2 px-1 py-1">
                                    <ThinkingOrb size={20} state="shaping" />
                                    <span className="text-muted-foreground text-sm">
                                        <T>Thinking…</T>
                                    </span>
                                </div>
                            ) : null}
                        </div>
                    </ThreadListErrorBoundary>
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
                        <AlertTitle>
                            <T>Request failed</T>
                        </AlertTitle>
                        <AlertDescription>
                            {getThreadErrorMessage(error)}
                        </AlertDescription>
                        <AlertAction>
                            <Button
                                onClick={handleRetry}
                                size="xs"
                                type="button"
                                variant="outline"
                            >
                                <RotateCcw aria-hidden focusable="false" />
                                <T>Retry</T>
                            </Button>
                        </AlertAction>
                    </Alert>
                ) : null}
                <Composer isBusy={isBusy} onStop={stop} onSubmit={handleSubmit}>
                    <ThreadComposerInput />
                </Composer>
            </div>
        </div>
    );
}

interface ThreadMessageProps {
    message: UIMessage;
    sources?: ThreadSource[];
}

export function ThreadMessage({ message, sources }: ThreadMessageProps) {
    const [renderedAt] = React.useState(() => new Date());

    const text = getMessageText(message);
    const createdAt = getMessageCreatedAt(message) ?? renderedAt;
    const toolActivities = getThreadToolActivities(message);

    if (message.role === "user") {
        return (
            <div className="group flex flex-col items-end gap-2">
                <Bubble align="end" variant="muted">
                    <BubbleContent>
                        <Streamdown mode="static">{text}</Streamdown>
                    </BubbleContent>
                </Bubble>
                <ThreadMessageTimestamp>{createdAt}</ThreadMessageTimestamp>
            </div>
        );
    }

    const displaySources = sources?.filter((source) => isHttpUrl(source.url));
    const hasText = text.length > 0;
    const hasSources = !!displaySources && displaySources.length > 0;

    if (!hasText && toolActivities.length === 0 && !hasSources) {
        return null;
    }

    return (
        <div className="group min-w-0">
            <AssistantMessageBody>
                {toolActivities.length > 0 ? (
                    <div className="flex flex-col gap-1">
                        {toolActivities.map((activity) => (
                            <ThreadToolRow
                                key={activity.key}
                                name={activity.name}
                                state={activity.state}
                            />
                        ))}
                    </div>
                ) : null}
                <Streamdown className="text-sm leading-relaxed">
                    {text}
                </Streamdown>
                <AssistantMessageActions>
                    {hasSources ? (
                        <ThreadMessageSources>
                            {displaySources?.map((source) => {
                                const key =
                                    source.type === "library_item"
                                        ? source.id
                                        : source.url;

                                return (
                                    <ThreadMessageSource
                                        key={`${source.type}:${key}`}
                                    >
                                        {source}
                                    </ThreadMessageSource>
                                );
                            })}
                        </ThreadMessageSources>
                    ) : null}
                    {hasText ? (
                        <>
                            <CopyResponseButton value={text} />
                            <ReadAloudResponseButton value={text} />
                        </>
                    ) : null}
                    <ThreadMessageTimestamp>{createdAt}</ThreadMessageTimestamp>
                </AssistantMessageActions>
            </AssistantMessageBody>
        </div>
    );
}

interface AssistantMessageBodyProps {
    children: React.ReactNode;
}

export function AssistantMessageBody({ children }: AssistantMessageBodyProps) {
    return <div className="flex min-w-0 flex-col gap-2">{children}</div>;
}

interface AssistantMessageActionsProps {
    children: React.ReactNode;
}

export function AssistantMessageActions({
    children,
}: AssistantMessageActionsProps) {
    return <div className="flex flex-wrap items-center gap-1">{children}</div>;
}

interface ThreadMessageTimestampProps {
    children: Date;
}

function ThreadMessageTimestamp({
    children: createdAt,
}: ThreadMessageTimestampProps) {
    const created = dayjs(createdAt);
    const shouldUse24HourClock = uses24HourClock();
    const label = created.isToday()
        ? created.format(shouldUse24HourClock ? "HH:mm" : "h:mm A")
        : created.format(shouldUse24HourClock ? "dddd HH:mm" : "dddd h:mm A");

    return (
        <time
            className="text-muted-foreground/50 text-xs"
            dateTime={createdAt.toISOString()}
            title={created.format("MMM DD, YYYY, h:mm A")}
        >
            {label}, {created.fromNow()}
        </time>
    );
}

interface ThreadMessageSourcesProps {
    children: React.ReactNode;
}

function ThreadMessageSources({ children }: ThreadMessageSourcesProps) {
    return (
        <CollapsibleListHorizontal maxVisible={2}>
            {children}
        </CollapsibleListHorizontal>
    );
}

interface ThreadMessageSourceProps {
    children: ThreadSource;
}

function ThreadMessageSource({ children: source }: ThreadMessageSourceProps) {
    const label = source.title?.trim() || source.url;

    return (
        <Badge
            className="max-w-48 justify-start"
            render={
                <a
                    href={normalizeURL(source.url)}
                    rel="noreferrer"
                    target="_blank"
                    title={label}
                />
            }
            variant="secondary"
        >
            <span className="min-w-0 truncate">{label}</span>
        </Badge>
    );
}

interface ThreadToolLabelProps {
    name: string;
}

function ThreadToolLabel({ name }: ThreadToolLabelProps) {
    switch (name) {
        case "getAutomationPayloadSummary":
            return <T>Run overview</T>;
        case "github_repo":
            return <T>GitHub repo</T>;
        case "listAutomationPayloadItems":
            return <T>Saved items</T>;
        case "web_fetch":
            return <T>Web page</T>;
        case "web_search":
            return <T>Web search</T>;
        default:
            return <>{name}</>;
    }
}

interface ThreadToolRowProps {
    name: string;
    state: string;
}

function ThreadToolRow({ name, state }: ThreadToolRowProps) {
    if (isActiveThreadToolState(state)) {
        return (
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <ThinkingOrb size={20} state="shaping" />
                <span>
                    <ThreadToolLabel name={name} />…
                </span>
            </div>
        );
    }

    if (state === "output-error") {
        return (
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <TriangleAlert
                    aria-hidden
                    className="size-3.5 text-destructive"
                    focusable="false"
                />
                <span className="flex items-baseline gap-1">
                    <ThreadToolLabel name={name} />
                    <T>failed</T>
                </span>
            </div>
        );
    }

    if (state === "output-denied") {
        return (
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                <ThreadToolLabel name={name} />
            </div>
        );
    }

    return (
        <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
            <Check
                aria-hidden
                className="size-3.5 text-success"
                focusable="false"
            />
            <ThreadToolLabel name={name} />
        </div>
    );
}

function ThreadComposerInput() {
    const gt = useGT();
    const { submit } = useComposerContext();

    const handleKeyDown = useStableCallback(
        (event: BaseUIEvent<React.KeyboardEvent<HTMLInputElement>>) => {
            if (event.defaultPrevented) {
                return;
            }
            if (!isSubmitKey(event)) {
                return;
            }
            event.preventDefault();
            submit();
        }
    );

    return (
        <ComposerInput
            onKeyDown={handleKeyDown}
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
        >
            <ComposerSubmitButton />
        </ComposerInput>
    );
}

interface ThreadListErrorProps {
    threadId: string;
}

function ThreadListError(
    { threadId }: ThreadListErrorProps,
    { error, retry }: ErrorInfo
) {
    // biome-ignore lint/correctness/useHookAtTopLevel: catchError fallbacks take (props, info), so the rule misreads this component
    React.useEffect(() => {
        log.error("Thread message list failed to render", {
            error: error instanceof Error ? error.message : String(error),
            threadId,
        });
    }, [error, threadId]);

    return (
        <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-6">
            <Alert variant="error">
                <CircleAlert aria-hidden focusable="false" />
                <AlertTitle>
                    <T>Something went wrong</T>
                </AlertTitle>
                <AlertDescription>
                    <T>The conversation failed to render.</T>
                </AlertDescription>
                <AlertAction>
                    <Button
                        onClick={retry}
                        size="xs"
                        type="button"
                        variant="outline"
                    >
                        <T>Try again</T>
                    </Button>
                </AlertAction>
            </Alert>
        </div>
    );
}

const ThreadListErrorBoundary = catchError(ThreadListError);
