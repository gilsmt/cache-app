import type { UIMessage } from "ai";
import { Streamdown } from "streamdown";
import { Bubble, BubbleContent } from "@/components/ui/bubble";

function getUserMessageText(message: UIMessage): string {
    return message.parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");
}

interface ChatMessageProps {
    message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
    if (message.role === "user") {
        return (
            <div className="flex justify-end">
                <Bubble align="end" variant="muted">
                    <BubbleContent>{getUserMessageText(message)}</BubbleContent>
                </Bubble>
            </div>
        );
    }

    const text = message.parts
        .map((part) => (part.type === "text" ? part.text : ""))
        .join("");

    return (
        <div className="flex min-w-0 flex-col gap-3">
            <Streamdown className="text-sm leading-6">{text}</Streamdown>
        </div>
    );
}
