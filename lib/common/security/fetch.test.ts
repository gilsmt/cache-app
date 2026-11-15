import { describe, expect, test } from "bun:test";
import {
    isUpstreamRefusal,
    readResponseText,
} from "@/lib/common/security/fetch";
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

describe("readResponseText", () => {
    test("returns complete text at the byte limit across split UTF-8 sequences", async () => {
        const bytes = new TextEncoder().encode("hello \u{1F600}!");
        const response = responseWith([bytes.slice(0, 8), bytes.slice(8)]);
        expect(
            await readResponseText(response, { maxBytes: bytes.byteLength })
        ).toBe("hello \u{1F600}!");
        expect(response.body?.locked).toBe(false);
    });

    test("returns empty text for a bodyless response", async () => {
        expect(
            await readResponseText(new Response(null), { maxBytes: 10 })
        ).toBe("");
    });

    test("rejects oversized streamed bodies and cancels the stream", async () => {
        let isCancelled = false;
        const encoder = new TextEncoder();
        const chunks = [encoder.encode("abc"), encoder.encode("\u{1F600}")];
        const response = new Response(
            new ReadableStream<Uint8Array>({
                cancel() {
                    isCancelled = true;
                },
                pull(controller) {
                    const chunk = chunks.shift();
                    if (chunk) {
                        controller.enqueue(chunk);
                        return;
                    }
                    controller.close();
                },
            })
        );
        await expect(
            readResponseText(response, { maxBytes: 6 })
        ).rejects.toThrow("Response body exceeds the 6 byte limit.");
        expect(isCancelled).toBe(true);
        expect(response.body?.locked).toBe(false);
    });

    test("flushes an incomplete UTF-8 sequence at the end of the body", async () => {
        const response = responseWith([new Uint8Array([0xf0, 0x9f, 0x98])]);
        expect(await readResponseText(response, { maxBytes: 3 })).toBe(
            "\uFFFD"
        );
    });

    test("propagates read failures and releases the reader", async () => {
        const error = new Error("Connection closed");
        const response = new Response(
            new ReadableStream<Uint8Array>({
                pull(controller) {
                    controller.error(error);
                },
            })
        );
        await expect(
            readResponseText(response, { maxBytes: 100 })
        ).rejects.toBe(error);
        expect(response.body?.locked).toBe(false);
    });
});

describe("isUpstreamRefusal", () => {
    test("treats bot protection, rate limits, and server errors as refusals", () => {
        expect(isUpstreamRefusal(401)).toBe(true);
        expect(isUpstreamRefusal(403)).toBe(true);
        expect(isUpstreamRefusal(406)).toBe(true);
        expect(isUpstreamRefusal(429)).toBe(true);
        expect(isUpstreamRefusal(500)).toBe(true);
        expect(isUpstreamRefusal(503)).toBe(true);
    });

    test("treats a served or missing resource as no refusal", () => {
        expect(isUpstreamRefusal(200)).toBe(false);
        expect(isUpstreamRefusal(301)).toBe(false);
        expect(isUpstreamRefusal(404)).toBe(false);
        expect(isUpstreamRefusal(410)).toBe(false);
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
