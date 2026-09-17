import { useStableCallback } from "@base-ui/utils/useStableCallback";
import * as React from "react";
import { canUseDOM } from "@/lib/common/dom";
import { createLogger } from "@/lib/common/logs/console/logger";

const SPEECH_CHUNK_MAX_LENGTH = 220;
const SENTENCE_BOUNDARY_PATTERN = /(?<=[.!?;:\n])\s+/;
const WORD_SEPARATOR_PATTERN = /\s+/;

interface UseSpeechSynthesisResult {
    isSpeaking: boolean;
    isSupported: boolean;
    speak: (text: string) => void;
    stop: () => void;
    toggle: (text: string) => void;
}

const log = createLogger("speech:synthesis");

function getSpeechSynthesis(): SpeechSynthesis | null {
    if (
        !(
            canUseDOM &&
            "speechSynthesis" in globalThis.window &&
            "SpeechSynthesisUtterance" in globalThis.window
        )
    ) {
        return null;
    }
    return globalThis.window.speechSynthesis;
}

export function splitTextIntoSpeechChunks(value: string): string[] {
    const normalizedText = value.replace(/\s+/g, " ").trim();
    if (normalizedText === "") {
        return [];
    }

    const chunks: string[] = [];
    let currentChunk = "";

    const pushCurrentChunk = () => {
        const trimmedChunk = currentChunk.trim();
        if (trimmedChunk !== "") {
            chunks.push(trimmedChunk);
        }
        currentChunk = "";
    };

    const appendWords = (text: string) => {
        for (const word of text.split(WORD_SEPARATOR_PATTERN)) {
            if (word === "") {
                continue;
            }
            if (word.length > SPEECH_CHUNK_MAX_LENGTH) {
                pushCurrentChunk();
                for (
                    let offset = 0;
                    offset < word.length;
                    offset += SPEECH_CHUNK_MAX_LENGTH
                ) {
                    chunks.push(
                        word.slice(offset, offset + SPEECH_CHUNK_MAX_LENGTH)
                    );
                }
                continue;
            }
            const candidateChunk =
                currentChunk === "" ? word : `${currentChunk} ${word}`;
            if (candidateChunk.length > SPEECH_CHUNK_MAX_LENGTH) {
                pushCurrentChunk();
                currentChunk = word;
            } else {
                currentChunk = candidateChunk;
            }
        }
    };

    for (const sentence of normalizedText.split(SENTENCE_BOUNDARY_PATTERN)) {
        const trimmedSentence = sentence.trim();
        if (trimmedSentence === "") {
            continue;
        }
        const candidateChunk =
            currentChunk === ""
                ? trimmedSentence
                : `${currentChunk} ${trimmedSentence}`;
        if (candidateChunk.length <= SPEECH_CHUNK_MAX_LENGTH) {
            currentChunk = candidateChunk;
            continue;
        }
        pushCurrentChunk();
        appendWords(trimmedSentence);
    }
    pushCurrentChunk();

    return chunks;
}

export function useSpeechSynthesis(): UseSpeechSynthesisResult {
    const [isSupported, setIsSupported] = React.useState(false);
    const [isSpeaking, setIsSpeaking] = React.useState(false);
    const generationRef = React.useRef(0);

    React.useEffect(() => {
        setIsSupported(getSpeechSynthesis() !== null);
        return () => {
            generationRef.current += 1;
            getSpeechSynthesis()?.cancel();
        };
    }, []);

    const stop = useStableCallback(() => {
        generationRef.current += 1;
        getSpeechSynthesis()?.cancel();
        setIsSpeaking(false);
    });

    const speak = useStableCallback((text: string) => {
        const synthesis = getSpeechSynthesis();
        const trimmedText = text.trim();
        if (synthesis === null || trimmedText === "") {
            return;
        }

        const generation = generationRef.current + 1;
        generationRef.current = generation;
        // Clear queued utterances so responses never stack behind each other.
        synthesis.cancel();
        const chunks = splitTextIntoSpeechChunks(trimmedText);
        setIsSpeaking(true);

        // Small utterances speak reliably everywhere. Long utterances stall
        // partway on Chrome, so chain short chunks through onend instead.
        const speakChunkAtIndex = (index: number): void => {
            if (generationRef.current !== generation) {
                return;
            }
            const chunk = chunks[index];
            if (chunk === undefined) {
                return;
            }
            const utterance = new globalThis.window.SpeechSynthesisUtterance(
                chunk
            );
            utterance.lang = globalThis.window.navigator.language;
            utterance.onend = () => {
                if (generationRef.current !== generation) {
                    return;
                }
                if (index + 1 < chunks.length) {
                    speakChunkAtIndex(index + 1);
                    return;
                }
                setIsSpeaking(false);
            };
            utterance.onerror = (event) => {
                if (generationRef.current !== generation) {
                    return;
                }
                generationRef.current += 1;
                getSpeechSynthesis()?.cancel();
                setIsSpeaking(false);
                log.error("Speech synthesis playback failed", event.error, {
                    chunkIndex: index,
                });
            };
            synthesis.speak(utterance);
        };

        speakChunkAtIndex(0);
    });

    const toggle = useStableCallback((text: string) => {
        if (isSpeaking) {
            stop();
            return;
        }
        speak(text);
    });

    return { isSpeaking, isSupported, speak, stop, toggle };
}
