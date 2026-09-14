import { describe, expect, test } from "bun:test";
import { readBodyText } from "@/lib/common/security/fetch";
import { isLocalhostAlias } from "@/lib/common/security/hostname";

function responseWith(chunks: Uint8Array[]): Response {
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (const chunk of chunks) {
                controller.enqueue(chunk);
            }
            controller.close();
        },
    });
    return new Response(stream);
}

describe("readBodyText", () => {
    test("returns the full text when the body fits the cap", async () => {
        const response = responseWith([
            new TextEncoder().encode("hello "),
            new TextEncoder().encode("world"),
        ]);
        const result = await readBodyText(response, { maxChars: 100 });
        expect(result).toEqual({ text: "hello world", truncated: false });
    });

    test("returns empty text for a bodyless response", async () => {
        const result = await readBodyText(new Response(null), {
            maxChars: 10,
        });
        expect(result).toEqual({ text: "", truncated: false });
    });

    test("truncates and flags a body past the cap", async () => {
        const encoder = new TextEncoder();
        const response = responseWith([
            encoder.encode("a".repeat(60)),
            encoder.encode("b".repeat(60)),
        ]);
        const result = await readBodyText(response, { maxChars: 100 });
        expect(result.truncated).toBe(true);
        expect(result.text.length).toBe(100);
        expect(result.text.startsWith("a".repeat(60))).toBe(true);
    });

    test("treats a body exactly at the cap as complete", async () => {
        const response = responseWith([new TextEncoder().encode("abcde")]);
        const result = await readBodyText(response, { maxChars: 5 });
        expect(result).toEqual({ text: "abcde", truncated: false });
    });

    test("flags the flush replacement character as truncated", async () => {
        // "abcde" fills the cap exactly; the trailing incomplete 4-byte
        // sequence decodes to one U+FFFD on the final flush. The replacement
        // counts toward the cap, so the body exceeds it.
        const response = responseWith([
            new TextEncoder().encode("abcde"),
            new Uint8Array([0xf0, 0x9f, 0x98]),
        ]);
        const result = await readBodyText(response, { maxChars: 5 });
        expect(result).toEqual({ text: "abcde", truncated: true });
    });

    test("does not truncate mid-codepoint (never emits a lone surrogate)", async () => {
        const encoder = new TextEncoder();
        // "ab" then U+1F600 (a 4-byte / 2-code-unit emoji) then "cd".
        const full = "ab\u{1F600}cd";
        const response = responseWith([encoder.encode(full)]);
        const result = await readBodyText(response, { maxChars: 3 });
        expect(result.truncated).toBe(true);
        // A 3-code-unit cut lands inside the emoji's surrogate pair; the pair
        // must be dropped whole rather than sliced into a lone surrogate.
        expect(result.text).toBe("ab");
    });

    test("does not corrupt multi-byte sequences split across chunks", async () => {
        // U+1F600 occupies 4 bytes; split it across two chunks mid-sequence.
        const emoji = new TextEncoder().encode("\u{1F600}");
        expect(emoji.length).toBe(4);
        const tail = new TextEncoder().encode("!");
        const response = responseWith([
            emoji.slice(0, 2),
            new Uint8Array([...emoji.slice(2), ...tail]),
        ]);
        const result = await readBodyText(response, { maxChars: 10 });
        expect(result.text).toBe("\u{1F600}!");
        expect(result.truncated).toBe(false);
    });
});

describe("isLocalhostAlias", () => {
    test("blocks exact local aliases", () => {
        expect(isLocalhostAlias("localhost")).toBe(true);
        expect(isLocalhostAlias("0.0.0.0")).toBe(true);
        expect(isLocalhostAlias("::1")).toBe(true);
        expect(isLocalhostAlias("[::1]")).toBe(true);
    });

    test("blocks local suffixes case-insensitively with trailing dots", () => {
        expect(isLocalhostAlias("api.localhost")).toBe(true);
        expect(isLocalhostAlias("API.LOCALHOST.")).toBe(true);
        expect(isLocalhostAlias("printer.local")).toBe(true);
        expect(isLocalhostAlias("Printer.Local")).toBe(true);
        expect(isLocalhostAlias("db.internal")).toBe(true);
    });

    test("allows public hostnames", () => {
        expect(isLocalhostAlias("example.com")).toBe(false);
        expect(isLocalhostAlias("notlocalhost")).toBe(false);
        expect(isLocalhostAlias("local.example.com")).toBe(false);
    });
});
