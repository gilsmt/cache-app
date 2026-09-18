import {
    afterEach,
    beforeEach,
    describe,
    expect,
    mock,
    spyOn,
    test,
} from "bun:test";
import type { RuntimeName } from "@/lib/common/environment";
import { createLogger } from "@/lib/common/logs/console/logger";

const logger = createLogger("logger-test");

/**
 * The environment flags that drive the logger's environment detection. The
 * flags are computed once at import time, so each scenario is applied with
 * mock.module, which rewrites the live bindings of the already-loaded modules.
 */
interface EnvironmentFlags {
    hasWindow: boolean;
    isDevelopment: boolean;
    isProduction: boolean;
    isTest: boolean;
    runtime: RuntimeName | "";
}

/** Flags for a Node development runtime. */
const DEV_ENV_FLAGS: EnvironmentFlags = {
    hasWindow: false,
    isDevelopment: true,
    isProduction: false,
    isTest: false,
    runtime: "node",
};

function mockEnvFlags(overrides: Partial<EnvironmentFlags> = {}) {
    mock.module("@/lib/common/environment", () => ({
        ...DEV_ENV_FLAGS,
        ...overrides,
    }));
}

beforeEach(() => {
    // Development is the only config with logging enabled, so pin it to keep
    // the suite hermetic regardless of the ambient NODE_ENV.
    mockEnvFlags();
});

afterEach(() => {
    mock.restore();
});

/**
 * Log args at the given level with a silenced console spy and return the
 * formatted args, i.e. everything after the prefix and message.
 */
function formattedArgsFor(
    level: "error" | "info",
    ...args: unknown[]
): unknown[] {
    const spy = spyOn(console, level).mockImplementation(() => undefined);
    try {
        logger[level]("message", ...args);
        const [firstCall] = spy.mock.calls;
        if (firstCall === undefined) {
            throw new Error(
                `Expected logger.${level} to write to console.${level}`
            );
        }
        return firstCall.slice(2);
    } finally {
        spy.mockRestore();
    }
}

describe("Logger argument formatting", () => {
    test("passes primitives, functions, and symbols through unchanged", () => {
        const symbol = Symbol("tag");
        const transform = () => "nope";

        expect(
            formattedArgsFor(
                "info",
                "text",
                42,
                true,
                3.14,
                123n,
                transform,
                symbol
            )
        ).toEqual(["text", 42, true, 3.14, 123n, transform, symbol]);
    });

    test("leaves null and undefined untouched", () => {
        expect(formattedArgsFor("info", null, undefined)).toEqual([
            null,
            undefined,
        ]);
    });

    test("stringifies objects as pretty-printed JSON in development", () => {
        const value = { role: "admin", user: "ada" };

        expect(formattedArgsFor("info", value)[0]).toBe(
            JSON.stringify(value, null, 2)
        );
    });

    test("redacts sensitive keys inside logged objects", () => {
        const [formatted] = formattedArgsFor("info", {
            apiKey: "abc123",
            visible: "ok",
        });

        expect(JSON.parse(String(formatted))).toEqual({
            apiKey: "[REDACTED]",
            visible: "ok",
        });
    });

    test("bounds arrays to a sample before logging", () => {
        const [formatted] = formattedArgsFor("info", [1, 2, 3, 4, 5, 6]);

        expect(JSON.parse(String(formatted))).toEqual({
            length: 6,
            sample: [1, 2, 3, 4, 5],
            type: "array",
        });
    });

    test("stringifies errors with their stack in development", () => {
        const [formatted] = formattedArgsFor("error", new Error("boom"));
        const parsed: Record<string, unknown> = JSON.parse(String(formatted));

        expect(parsed).toMatchObject({ message: "boom", name: "Error" });
        expect(typeof parsed.stack).toBe("string");
    });

    test("handles circular references without throwing", () => {
        const value: Record<string, unknown> = { name: "root" };
        value.self = value;

        const [formatted] = formattedArgsFor("info", value);

        expect(JSON.parse(String(formatted))).toEqual({
            name: "root",
            self: "[Circular]",
        });
    });

    test("isolates throwing getters to their property", () => {
        const throwingGetter = {
            get boom() {
                throw new Error("boom");
            },
            visible: "ok",
        };

        expect(formattedArgsFor("info", throwingGetter)[0]).toBe(
            JSON.stringify(
                { boom: "[Unreadable property value]", visible: "ok" },
                null,
                2
            )
        );
    });

    test("preserves order and types across mixed arguments", () => {
        const [objectArg, stringArg, nullArg, undefinedArg, arrayArg] =
            formattedArgsFor(
                "info",
                { id: 1 },
                "plain",
                null,
                undefined,
                [1, 2]
            );

        expect(objectArg).toBe(JSON.stringify({ id: 1 }, null, 2));
        expect(stringArg).toBe("plain");
        expect(nullArg).toBeNull();
        expect(undefinedArg).toBeUndefined();
        expect(JSON.parse(String(arrayArg))).toEqual({
            length: 2,
            sample: [1, 2],
            type: "array",
        });
    });
});

describe("Logger environment suppression", () => {
    function logsNothingInDisabledEnvironment(setup: () => void) {
        const spies = {
            debug: spyOn(console, "debug").mockImplementation(() => undefined),
            error: spyOn(console, "error").mockImplementation(() => undefined),
            info: spyOn(console, "info").mockImplementation(() => undefined),
            log: spyOn(console, "log").mockImplementation(() => undefined),
            warn: spyOn(console, "warn").mockImplementation(() => undefined),
        };
        try {
            setup();
            logger.debug("should not appear");
            logger.info("should not appear");
            logger.warn("should not appear");
            logger.error("should not appear");
            for (const spy of Object.values(spies)) {
                expect(spy).not.toHaveBeenCalled();
            }
        } finally {
            for (const spy of Object.values(spies)) {
                spy.mockRestore();
            }
        }
    }

    test("logs nothing in the test environment", () => {
        logsNothingInDisabledEnvironment(() =>
            mockEnvFlags({ isDevelopment: false, isTest: true })
        );
    });

    test("logs only errors in the production environment", () => {
        const spies = {
            debug: spyOn(console, "debug").mockImplementation(() => undefined),
            error: spyOn(console, "error").mockImplementation(() => undefined),
            info: spyOn(console, "info").mockImplementation(() => undefined),
            warn: spyOn(console, "warn").mockImplementation(() => undefined),
        };
        try {
            mockEnvFlags({ isDevelopment: false, isProduction: true });

            logger.debug("debug message");
            logger.info("info message");
            logger.warn("warn message");
            logger.error("error message");

            expect(spies.debug).not.toHaveBeenCalled();
            expect(spies.info).not.toHaveBeenCalled();
            expect(spies.warn).not.toHaveBeenCalled();
            expect(spies.error).toHaveBeenCalledTimes(1);
        } finally {
            for (const spy of Object.values(spies)) {
                spy.mockRestore();
            }
        }
    });

    test("logs only errors when NODE_ENV is unrecognized", () => {
        const spies = {
            debug: spyOn(console, "debug").mockImplementation(() => undefined),
            error: spyOn(console, "error").mockImplementation(() => undefined),
            info: spyOn(console, "info").mockImplementation(() => undefined),
            warn: spyOn(console, "warn").mockImplementation(() => undefined),
        };
        try {
            mockEnvFlags({ isDevelopment: false });

            logger.debug("debug message");
            logger.info("info message");
            logger.warn("warn message");
            logger.error("error message");

            expect(spies.debug).not.toHaveBeenCalled();
            expect(spies.info).not.toHaveBeenCalled();
            expect(spies.warn).not.toHaveBeenCalled();
            expect(spies.error).toHaveBeenCalledTimes(1);
        } finally {
            for (const spy of Object.values(spies)) {
                spy.mockRestore();
            }
        }
    });

    test("logs nothing in the browser runtime", () => {
        logsNothingInDisabledEnvironment(() =>
            mockEnvFlags({ hasWindow: true })
        );
    });

    test("logs at every level through its corresponding console method in the development environment", () => {
        const spies = {
            debug: spyOn(console, "debug").mockImplementation(() => undefined),
            error: spyOn(console, "error").mockImplementation(() => undefined),
            info: spyOn(console, "info").mockImplementation(() => undefined),
            warn: spyOn(console, "warn").mockImplementation(() => undefined),
        };
        try {
            logger.debug("debug message");
            logger.info("info message");
            logger.warn("warn message");
            logger.error("error message");

            for (const [level, spy] of Object.entries(spies)) {
                expect(
                    spy,
                    `logger.${level} should write to console.${level}`
                ).toHaveBeenCalledTimes(1);
            }
        } finally {
            for (const spy of Object.values(spies)) {
                spy.mockRestore();
            }
        }
    });
});

describe("Logger.time", () => {
    test("logs a started event and a completed event with a duration on stop", () => {
        const spy = spyOn(console, "info").mockImplementation(() => undefined);
        try {
            const span = logger.time("sync invoices", { tenantId: "t1" });
            span.stop();

            const [started, completed] = spy.mock.calls;
            if (started === undefined || completed === undefined) {
                throw new Error(
                    "Expected logger.time to write two console.info calls"
                );
            }
            expect(JSON.parse(String(started[2]))).toEqual({
                status: "started",
                tenantId: "t1",
            });
            expect(JSON.parse(String(completed[2]))).toMatchObject({
                durationMs: expect.any(Number),
                status: "completed",
                tenantId: "t1",
            });
        } finally {
            spy.mockRestore();
        }
    });

    test("supports Symbol.dispose to stop the span", () => {
        const spy = spyOn(console, "info").mockImplementation(() => undefined);
        try {
            const span = logger.time("sync invoices");
            span[Symbol.dispose]();
            expect(spy).toHaveBeenCalledTimes(2);
        } finally {
            spy.mockRestore();
        }
    });
});
