import { beforeEach, describe, expect, mock, test } from "bun:test";

type SessionResult = { user: { id: string } } | null;

const TRANSPORT_ERROR = new Error(
    "Client network socket disconnected before secure TLS connection was established"
);
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

    test("rejects once the retry budget is exhausted", async () => {
        getSessionImpl = () => Promise.reject(TRANSPORT_ERROR);

        await expect(getServerSession()).rejects.toThrow(
            TRANSPORT_ERROR.message
        );
        expect(getSessionCalls).toBe(3);
    });
});
