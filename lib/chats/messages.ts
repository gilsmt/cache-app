import { isTextUIPart, type UIMessage } from "ai";

/** Concatenates the text parts of a UI message and ignores other part types. */
export function getMessageText(message: UIMessage): string {
    return message.parts
        .filter(isTextUIPart)
        .map((part) => part.text)
        .join("");
}

export interface ChatMessageMetadata {
    createdAt: string;
}

export function getMessageCreatedAt(message: UIMessage): Date | null {
    if (!isChatMessageMetadata(message.metadata)) {
        return null;
    }
    const createdAt = new Date(message.metadata.createdAt);
    return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

function isChatMessageMetadata(value: unknown): value is ChatMessageMetadata {
    return (
        typeof value === "object" &&
        value !== null &&
        "createdAt" in value &&
        typeof value.createdAt === "string"
    );
}
