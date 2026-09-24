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
        <form onSubmit={handleSubmit}>
            <div className="squircle relative rounded-3xl px-1 py-2 shadow-xs/10 dark:bg-input">
                <Textarea
                    aria-label={gt("Chat message")}
                    className="block w-full text-base sm:text-sm"
                    isUnstyled
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    placeholder={gt("Ask a follow-up")}
                    size="sm"
                    style={{ minHeight: "2.5rem" }}
                    value={input}
                />
                <div className="flex items-center justify-end px-1 pt-1">
                    {isBusy ? (
                        <Button
                            aria-label={gt("Stop generating")}
                            className="rounded-full"
                            onClick={onStop}
                            size="icon"
                            type="button"
                            variant="outline"
                        >
                            <Square
                                aria-hidden
                                className="size-4.5"
                                focusable="false"
                            />
                        </Button>
                    ) : (
                        <Button
                            aria-label={gt("Send message")}
                            className="rounded-full"
                            disabled={!input.trim()}
                            size="icon"
                            type="submit"
                        >
                            <ArrowUp
                                aria-hidden
                                className="size-4.5"
                                focusable="false"
                            />
                        </Button>
                    )}
                </div>
                <div
                    aria-hidden
                    className="squircle pointer-events-none absolute inset-0 rounded-[inherit] ring-1 ring-black/10 ring-inset dark:ring-white/10"
                />
            </div>
        </form>
    );
}
