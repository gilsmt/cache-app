import { describe, expect, test } from "bun:test";
import { APICallError, LoadAPIKeyError, RetryError } from "ai";
import {
    classifyGenerationError,
    EmptyGenerationOutputError,
    summarizeStepUsage,
} from "./classify";

function apiError(
    statusCode: number | undefined,
    message: string,
    cause?: unknown
) {
    return new APICallError({
        cause,
        message,
        requestBodyValues: { prompt: "test" },
        responseBody: undefined,
        responseHeaders: undefined,
        statusCode,
        url: "https://provider.test/v1/generate",
    });
}

describe("classifyGenerationError", () => {
    test("stops the chain on quota errors", () => {
        const classification = classifyGenerationError(
            apiError(429, "Resource has been exhausted")
        );
        expect(classification.canFallback).toBe(false);
        expect(classification.status).toBe(429);
    });

    test("stops the chain on credential errors and reports a configuration failure", () => {
        for (const error of [
            apiError(401, "Unauthorized"),
            apiError(403, "Permission denied"),
            apiError(400, "API key not valid"),
            new LoadAPIKeyError({ message: "Missing API key" }),
        ]) {
            const classification = classifyGenerationError(error);
            expect(classification.canFallback).toBe(false);
            expect(classification.status).toBe(500);
            expect(classification.message).toContain("credentials");
        }
    });

    test("falls back on server errors and timeouts", () => {
        expect(
            classifyGenerationError(apiError(503, "Service unavailable"))
                .canFallback
        ).toBe(true);
        expect(
            classifyGenerationError(apiError(503, "Service unavailable")).status
        ).toBe(502);
        expect(
            classifyGenerationError(apiError(408, "Request timeout")).status
        ).toBe(408);
    });

    test("falls back on empty output", () => {
        const classification = classifyGenerationError(
            new EmptyGenerationOutputError()
        );
        expect(classification.canFallback).toBe(true);
    });

    test("unwraps retry and cause chains to reach the provider error", () => {
        const wrapped = new RetryError({
            errors: [
                new Error("transport failed", {
                    cause: apiError(429, "Quota exceeded"),
                }),
            ],
            message: "Retry limit reached",
            reason: "maxRetriesExceeded",
        });

        const classification = classifyGenerationError(wrapped);
        expect(classification.canFallback).toBe(false);
        expect(classification.status).toBe(429);
    });

    test("stops unwrapping at a provider error that carries a cause", () => {
        const classification = classifyGenerationError(
            apiError(429, "Quota exceeded", new Error("fetch failed"))
        );
        expect(classification.canFallback).toBe(false);
        expect(classification.status).toBe(429);
    });

    test("treats unknown errors as fallback-eligible failures", () => {
        const classification = classifyGenerationError(new Error("boom"));
        expect(classification.canFallback).toBe(true);
        expect(classification.status).toBe(500);
    });

    test("recognizes timeout-like messages on plain errors", () => {
        expect(
            classifyGenerationError(new Error("The operation was aborted"))
                .status
        ).toBe(408);
    });
});

describe("summarizeStepUsage", () => {
    test("returns undefined when the run has no steps", () => {
        expect(summarizeStepUsage([])).toBeUndefined();
    });

    test("sums token usage across steps", () => {
        expect(
            summarizeStepUsage([
                {
                    usage: {
                        inputTokens: 10,
                        outputTokens: 5,
                        totalTokens: 15,
                    },
                },
                {
                    usage: {
                        inputTokens: 20,
                        outputTokens: 8,
                        totalTokens: 28,
                    },
                },
                {},
            ])
        ).toEqual({ inputTokens: 30, outputTokens: 13, totalTokens: 43 });
    });
});
