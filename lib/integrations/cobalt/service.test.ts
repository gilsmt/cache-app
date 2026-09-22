import { describe, expect, test } from "bun:test";

process.env.COBALT_API_BASE = "";

const { classifyCobaltError, resolveCobaltDownloadUrl, resolveCobaltPreview } =
    await import("@/lib/integrations/cobalt/service");

describe("cobalt resolver without a configured base", () => {
    test("preview resolution returns a not-configured error, not a dead-host request", async () => {
        const result = await resolveCobaltPreview(
            "https://www.instagram.com/p/abc/"
        );
        expect(result.status).toBe("ERROR");
        if (result.status !== "ERROR") {
            throw new Error("expected an error result");
        }
        expect(result.errorCode).toBe("cobalt.not_configured");
    });

    test("download resolution returns a not-configured error", async () => {
        const result = await resolveCobaltDownloadUrl(
            "https://www.instagram.com/p/abc/"
        );
        expect(result.status).toBe("ERROR");
    });
});

describe("classifyCobaltError", () => {
    test("maps the not-configured code to unavailable", () => {
        expect(classifyCobaltError("cobalt.not_configured")).toBe(
            "unavailable"
        );
    });

    test("keeps the upstream categories", () => {
        expect(classifyCobaltError("error.api.rate_exceeded")).toBe(
            "rate_limited"
        );
        expect(classifyCobaltError("error.api.unreachable")).toBe(
            "fetch_failed"
        );
        expect(classifyCobaltError("error.content.not_found")).toBe(
            "not_found"
        );
    });
});
