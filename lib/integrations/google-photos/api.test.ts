import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { IntegrationApiError } from "@/lib/integrations/error";

mock.module("server-only", () => ({}));

const { getPickerSession } = await import("./api");

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    mock.restore();
});

/** Capture the deadline timer fetchWithTimeout arms, then never settle fetch until it fires. */
function armPendingFetch() {
    const deadlines: Array<() => void> = [];
    spyOn(globalThis, "setTimeout").mockImplementation(((
        handler: () => void,
        timeout?: number
    ) => {
        if (timeout === 30_000) {
            deadlines.push(handler);
        }
        return 0;
    }) as unknown as typeof setTimeout);

    const fetchSpy = spyOn(globalThis, "fetch");
    fetchSpy.mockImplementation(
        ((_input: URL | RequestInfo, options?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                options?.signal?.addEventListener("abort", () => {
                    reject(
                        options.signal?.reason ??
                            new DOMException("Aborted", "AbortError")
                    );
                });
            })) as unknown as typeof fetch
    );

    return { deadlines, fetchSpy };
}

describe("pickerFetch", () => {
    test("bounds the request with a deadline and rejects with a typed error", async () => {
        const { deadlines, fetchSpy } = armPendingFetch();

        const pending = getPickerSession("token", "session-1");
        expect(deadlines.length).toBe(1);
        deadlines[0]?.();

        await expect(pending).rejects.toBeInstanceOf(IntegrationApiError);
        expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    });

    test("parses the picker session from a successful response", async () => {
        spyOn(globalThis, "fetch").mockResolvedValue(
            Response.json({ id: "session-1", pickerUri: "https://photos" })
        );

        const session = await getPickerSession("token", "session-1");
        expect(session.id).toBe("session-1");
    });
});
