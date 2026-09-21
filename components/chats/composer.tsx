"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { useGT } from "gt-next";
import { ArrowUp, Square } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatComposerProps {
    isBusy: boolean;
    onStop: () => void;
    onSubmit: (text: string) => void;
}

export function ChatComposer({ isBusy, onStop, onSubmit }: ChatComposerProps) {
    const gt = useGT();
    const [input, setInput] = React.useState("");

    const handleSubmit = useStableCallback((event?: React.FormEvent) => {
        event?.preventDefault();
        const text = input.trim();
        if (!text || isBusy) {
            return;
        }
        onSubmit(text);
        setInput("");
    });

    const handleInputChange = useStableCallback(
        (event: React.ChangeEvent<HTMLTextAreaElement>) => {
            setInput(event.target.value);
        }
    );

    const handleInputKeyDown = useStableCallback(
        (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
            ) {
                event.preventDefault();
                handleSubmit();
            }
        }
    );

    return (
        <form className="flex items-end gap-2" onSubmit={handleSubmit}>
            <Textarea
                aria-label={gt("Chat message")}
                className="flex-1"
                onChange={handleInputChange}
                onKeyDown={handleInputKeyDown}
                placeholder={gt("Ask a follow-up…")}
                value={input}
            />
            {isBusy ? (
                <Button
                    aria-label={gt("Stop generating")}
                    onClick={onStop}
                    size="icon"
                    type="button"
                    variant="outline"
                >
                    <Square aria-hidden focusable="false" />
                </Button>
            ) : (
                <Button
                    aria-label={gt("Send message")}
                    disabled={!input.trim()}
                    size="icon"
                    type="submit"
                >
                    <ArrowUp aria-hidden focusable="false" />
                </Button>
            )}
        </form>
    );
}
