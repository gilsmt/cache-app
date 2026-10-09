"use client";

import type { UIMessage } from "ai";
import * as React from "react";
import { Streamdown } from "streamdown";
import {
    CopyResponseButton,
    ReadAloudResponseButton,
} from "@/components/session/composer";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { CollapsibleListHorizontal } from "@/components/ui/collapsible-list";
import { dayjs } from "@/lib/common/dayjs";
import { uses24HourClock } from "@/lib/common/time";
import { isHttpUrl, normalizeURL } from "@/lib/common/url";
import { getMessageCreatedAt, getMessageText } from "@/lib/threads/messages";
import type { ThreadSource } from "@/lib/threads/sources";

interface ThreadMessageProps {
    message: UIMessage;
    sources?: ThreadSource[];
}

export function ThreadMessage({ message, sources }: ThreadMessageProps) {
    const [renderedAt] = React.useState(() => new Date());

    const createdAt = getMessageCreatedAt(message) ?? renderedAt;
    const text = getMessageText(message);

    if (message.role === "user") {
        return (
            <div className="group flex flex-col items-end gap-2">
                <Bubble align="end" variant="muted">
                    <BubbleContent>
                        <Streamdown>{text}</Streamdown>
                    </BubbleContent>
                </Bubble>
                <ThreadMessageTimestamp>{createdAt}</ThreadMessageTimestamp>
            </div>
        );
    }

    const displaySources = sources?.filter((source) => isHttpUrl(source.url));
    if (text.length === 0 && (!displaySources || displaySources.length === 0)) {
        return null;
    }

    const hasText = text.length > 0;
    const hasSources = !!displaySources && displaySources.length > 0;

    return (
        <div className="group min-w-0">
            <AssistantMessageBody>
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
    if (!isHttpUrl(source.url)) {
        return null;
    }

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
