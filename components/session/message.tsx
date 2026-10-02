"use client";

import { sanitizeUrl } from "@braintree/sanitize-url";
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
                    <BubbleContent>{text}</BubbleContent>
                </Bubble>
                <ThreadMessageTimestamp createdAt={createdAt} />
            </div>
        );
    }

    return (
        <div className="group flex min-w-0 flex-col gap-2">
            <Streamdown className="text-sm leading-6">{text}</Streamdown>
            <div className="flex flex-wrap items-center gap-1">
                {sources && sources.length > 0 ? (
                    <ThreadMessageSources sources={sources} />
                ) : null}
                <CopyResponseButton value={text} />
                <ReadAloudResponseButton value={text} />
                <ThreadMessageTimestamp createdAt={createdAt} />
            </div>
        </div>
    );
}

interface ThreadMessageTimestampProps {
    createdAt: Date;
}

function ThreadMessageTimestamp({ createdAt }: ThreadMessageTimestampProps) {
    return (
        <time
            className="text-muted-foreground/50 text-xs opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
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

interface ThreadMessageSourcesProps {
    sources: ThreadSource[];
}

function ThreadMessageSources({ sources }: ThreadMessageSourcesProps) {
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
