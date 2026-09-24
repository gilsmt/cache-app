"use client";

import { sanitizeUrl } from "@braintree/sanitize-url";
import type { UIMessage } from "ai";
import * as React from "react";
import { Streamdown } from "streamdown";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { CollapsibleListHorizontal } from "@/components/ui/collapsible-list";
import { getMessageCreatedAt, getMessageText } from "@/lib/chats/messages";
import type { ChatSource } from "@/lib/chats/sources";
import { dayjs } from "@/lib/common/dayjs";
import { uses24HourClock } from "@/lib/common/time";

interface ChatMessageProps {
    message: UIMessage;
    sources?: ChatSource[];
}

export function ChatMessage({ message, sources }: ChatMessageProps) {
    const [renderedAt] = React.useState(() => new Date());
    const createdAt = getMessageCreatedAt(message) ?? renderedAt;

    if (message.role === "user") {
        return (
            <div className="group flex flex-col items-end gap-2">
                <Bubble align="end" variant="muted">
                    <BubbleContent>{getMessageText(message)}</BubbleContent>
                </Bubble>
                <ChatMessageTimestamp createdAt={createdAt} />
            </div>
        );
    }

    return (
        <div className="group flex min-w-0 flex-col gap-2">
            <Streamdown className="text-sm leading-6">
                {getMessageText(message)}
            </Streamdown>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {sources && sources.length > 0 ? (
                    <ChatMessageSources sources={sources} />
                ) : null}
                <ChatMessageTimestamp createdAt={createdAt} />
            </div>
        </div>
    );
}

interface ChatMessageTimestampProps {
    createdAt: Date;
}

function ChatMessageTimestamp({ createdAt }: ChatMessageTimestampProps) {
    return (
        <time
            className="text-muted-foreground/50 text-xs opacity-0 group-hover:opacity-100"
            dateTime={createdAt.toISOString()}
            title={dayjs(createdAt).format("MMM DD, YYYY, h:mm A")}
        >
            {uses24HourClock()
                ? dayjs(createdAt).format("dddd HH:mm")
                : dayjs(createdAt).format("dddd h:mm A")}
            , {dayjs(createdAt).fromNow()}
        </time>
    );
}

interface ChatMessageSourcesProps {
    sources: ChatSource[];
}

function ChatMessageSources({ sources }: ChatMessageSourcesProps) {
    return (
        <CollapsibleListHorizontal maxVisible={2}>
            {sources.map((source) => {
                const key =
                    source.type === "library_item" ? source.id : source.url;
                const label = source.title ?? source.url;

                return (
                    <Badge
                        className="max-w-48 justify-start"
                        key={`${source.type}:${key}`}
                        render={
                            <a
                                href={sanitizeUrl(source.url)}
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
            })}
        </CollapsibleListHorizontal>
    );
}
