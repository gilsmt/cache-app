import { beforeEach, describe, expect, mock, test } from "bun:test";
import { HttpError } from "@/lib/common/http";

type SessionResult = { user: { id: string } } | null;

/** The driver reset Prisma wraps in a known-request error, keeping the code. */
const TRANSPORT_ERROR = Object.assign(
    new Error(
        "Client network socket disconnected before secure TLS connection was established"
    ),
    { code: "ECONNRESET" }
);
const NETWORK_ERROR = new TypeError("fetch failed");
const DETERMINISTIC_ERROR = new Error("Inconsistent column data");
const SESSION: SessionResult = { user: { id: "user_1" } };

let getSessionImpl: () => Promise<SessionResult> = () => Promise.resolve(null);
let getSessionCalls = 0;

mock.module("server-only", () => ({}));
mock.module("next/headers", () => ({
    headers: () => new Headers(),
}));
mock.module("@/lib/auth/server", () => ({
    auth: {
        $Infer: { Session: {} },
        api: {
            getSession: () => {
                getSessionCalls += 1;
                return getSessionImpl();
            },
        },
    },
}));

const { getServerSession } = await import("@/lib/auth/session");

beforeEach(() => {
    getSessionCalls = 0;
    getSessionImpl = () => Promise.resolve(null);
});

describe("getServerSession", () => {
    test("retries a transient database transport failure and returns the session", async () => {
        let attempts = 0;
        getSessionImpl = () => {
            attempts += 1;
            return attempts === 1
                ? Promise.reject(TRANSPORT_ERROR)
                : Promise.resolve(SESSION);
        };

        const session = await getServerSession();
        expect(session?.user?.id).toBe(SESSION.user.id);
        expect(getSessionCalls).toBe(2);
    });

    test("retries a network failure and a retryable HTTP failure", async () => {
        let attempts = 0;
        getSessionImpl = () => {
            attempts += 1;
            if (attempts === 1) {
                return Promise.reject(NETWORK_ERROR);
            }
            return attempts === 2
                ? Promise.reject(new HttpError(503))
                : Promise.resolve(SESSION);
        };

        const session = await getServerSession();
        expect(session?.user?.id).toBe(SESSION.user.id);
        expect(getSessionCalls).toBe(3);
    });

    test("rejects once the retry budget is exhausted", async () => {
        getSessionImpl = () => Promise.reject(TRANSPORT_ERROR);

        await expect(getServerSession()).rejects.toThrow(
            TRANSPORT_ERROR.message
        );
        expect(getSessionCalls).toBe(3);
    });

    test("does not retry a deterministic error", async () => {
        getSessionImpl = () => Promise.reject(DETERMINISTIC_ERROR);

        await expect(getServerSession()).rejects.toThrow(
            DETERMINISTIC_ERROR.message
        );
        expect(getSessionCalls).toBe(1);
    });

    test("does not retry a non-retryable HTTP failure", async () => {
        getSessionImpl = () => Promise.reject(new HttpError(400));

        await expect(getServerSession()).rejects.toThrow("HTTP 400");
        expect(getSessionCalls).toBe(1);
    });
});
