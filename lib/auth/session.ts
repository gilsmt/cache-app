import "server-only";

import { headers } from "next/headers";
import { cache } from "react";
import { SessionError } from "@/lib/auth/error";
import { auth } from "@/lib/auth/server";
import { ACTION_STATUS } from "@/lib/common/constants";
import { getErrorMessage } from "@/lib/common/error";
import { createLogger } from "@/lib/common/logs/console/logger";
import { withRetry } from "@/lib/common/retry";

const log = createLogger("Auth:session");

export type Session = typeof auth.$Infer.Session;

/**
 * A session read is idempotent, so a transient database transport failure is
 * retried instead of surfacing as a 500. The backoff is jittered so instances
 * that fail together do not reconnect in lockstep.
 */
export const getServerSession = cache(async () => {
    const requestHeaders = await headers();
    return withRetry(() => auth.api.getSession({ headers: requestHeaders }), {
        randomize: true,
    });
});

export const getSessionUserId = cache(async (): Promise<string | null> => {
    const session = await getServerSession();
    return session?.user?.id ?? null;
});

type WithSessionCallback<T> = (session: Session | null) => Promise<T> | T;

/**
 * Executes a callback with the current session, normalizing failures to a named error.
 */
export async function withSession<T>(
    callback: WithSessionCallback<T>
): Promise<T> {
    try {
        return await callback(await getServerSession());
    } catch (error) {
        log.error("Session operation failed", error);

        if (SessionError.isInstance(error)) {
            throw error;
        }

        throw new SessionError(
            {
                message: getErrorMessage(error),
                operation: "auth::withSession",
            },
            { cause: error }
        );
    }
}

interface UnauthorizedActionResult {
    message: string;
    status: typeof ACTION_STATUS.UNAUTHORIZED;
}

interface AuthorizedActionResult {
    userId: string;
}

type ActionAuthResult = UnauthorizedActionResult | AuthorizedActionResult;

/**
 * Narrows the serializable auth result used by Server Actions.
 */
export function isUnauthenticated(
    result: ActionAuthResult
): result is UnauthorizedActionResult {
    return "status" in result && result.status === ACTION_STATUS.UNAUTHORIZED;
}

/**
 * Resolves the current session user id for Server Actions.
 */
export async function requireActionUserId(
    unauthorizedMessage = "Sign in to continue."
): Promise<ActionAuthResult> {
    const userId = await getSessionUserId();

    if (!userId) {
        return {
            message: unauthorizedMessage,
            status: ACTION_STATUS.UNAUTHORIZED,
        };
    }

    return { userId };
}

/**
 * Resolves the current session user id for API route handlers.
 * Session always comes from Next.js request cookies via `headers()`.
 * `unauthorizedResponseHeaders` attach only to the 401 response (e.g. CORS).
 */
export async function requireRouteUserId(args?: {
    unauthorizedResponseHeaders?: HeadersInit;
}): Promise<{ userId: string } | Response> {
    const userId = await getSessionUserId();

    if (!userId) {
        return Response.json(
            { error: "Unauthorized" },
            {
                headers: args?.unauthorizedResponseHeaders,
                status: 401,
            }
        );
    }

    return { userId };
}
