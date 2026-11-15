import { isTextUIPart, type UIMessage } from "ai";

export function getMessageText(message: UIMessage): string {
    let text = "";
    for (const part of message.parts) {
        if (isTextUIPart(part)) {
            text += part.text;
        }
    }
    return text;
}

export function getMessageCreatedAt(message: UIMessage): Date | null {
    if (!isThreadMessageMetadata(message.metadata)) {
        return null;
    }
    const createdAt = new Date(message.metadata.createdAt);
    return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

interface ThreadMessageMetadata {
    createdAt: string;
}

function isThreadMessageMetadata(
    value: unknown
): value is ThreadMessageMetadata {
    return (
        typeof value === "object" &&
        value !== null &&
        "createdAt" in value &&
        typeof value.createdAt === "string"
    );
}
