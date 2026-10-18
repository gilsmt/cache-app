import { afterEach, describe, expect, jest, test } from "bun:test";
import { resolveCobaltDownloadUrl } from "@/lib/integrations/cobalt/service";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
});

describe("resolveCobaltDownloadUrl", () => {
    test("aborts the resolver call when the timeout deadline fires", async () => {
        const deadlines: Array<{ fire: () => void; delay: number }> = [];
        const fakeSetTimeout = ((callback: TimerHandler, delay?: number) => {
            deadlines.push({
                delay: Number(delay),
                fire: () => {
                    if (typeof callback === "function") {
                        callback();
                    }
                },
            });
            return 0 as unknown as ReturnType<typeof setTimeout>;
        }) as unknown as typeof setTimeout;
        jest.spyOn(globalThis, "setTimeout").mockImplementation(fakeSetTimeout);

        let receivedSignal: AbortSignal | null = null;
        globalThis.fetch = ((
            _input: RequestInfo | URL,
            options?: RequestInit
        ) => {
            receivedSignal = options?.signal ?? null;
            return new Promise<Response>((_resolve, reject) => {
                options?.signal?.addEventListener("abort", () => {
                    reject(
                        options.signal?.reason ??
                            new DOMException("Aborted", "AbortError")
                    );
                });
            });
        }) as typeof fetch;

        const pending = resolveCobaltDownloadUrl(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        );

        const deadline = deadlines.find((entry) => entry.delay === 10_000);
        expect(deadline).toBeDefined();
        deadline?.fire();

        const result = await pending;

        expect(receivedSignal).toBeInstanceOf(AbortSignal);
        expect(result).toEqual({
            message: "The media resolver took too long to respond.",
            status: "ERROR",
        });
    });

    test("returns the resolved download URL on success", async () => {
        globalThis.fetch = (() =>
            Promise.resolve(
                Response.json({
                    status: "tunnel",
                    url: "https://cdn.example.test/video.mp4",
                })
            )) as unknown as typeof fetch;

        const result = await resolveCobaltDownloadUrl(
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        );

        expect(result).toEqual({
            downloadUrl: "https://cdn.example.test/video.mp4",
            status: "SUCCESS",
        });
    });
});
