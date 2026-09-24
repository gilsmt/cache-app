import "server-only";

import { AccountError } from "@/lib/account/error";
import { auth } from "@/lib/auth/server";
import { createLogger } from "@/lib/common/logs/console/logger";

const log = createLogger("account:service");

interface DeleteUserAccountResult {
    redirect: string;
}

/**
 * Hard-deletes the user through Better Auth. Its pre-delete hook cancels
 * Stripe subscriptions only after Better Auth accepts the fresh session.
 *
 * @throws {AccountError} When Better Auth rejects the deletion, billing
 * cancellation fails, or the database write fails.
 */
export async function deleteUserAccount(
    requestHeaders: Headers
): Promise<DeleteUserAccountResult> {
    try {
        await auth.api.deleteUser({
            body: {},
            headers: requestHeaders,
        });
    } catch (error) {
        const reason = extractDeleteUserError(error);

        log.error("Account deletion failed", error, {
            operation: "deleteUserAccount",
            reason,
        });

        throw new AccountError(
            {
                message: accountErrorMessage(reason),
                operation: "deleteUserAccount",
            },
            { cause: error }
        );
    }

    return { redirect: "/logout" };
}

type DeleteUserFailureReason =
    | "session_expired"
    | "unauthorized"
    | "not_enabled"
    | "unknown";

function extractDeleteUserError(error: unknown): DeleteUserFailureReason {
    if (!(error instanceof Error)) {
        return "unknown";
    }

    const bodyCode =
        readErrorField(error, "code") ?? readErrorField(error, "body.code");
    const message = (
        readErrorField(error, "message") ?? error.message
    ).toLowerCase();

    if (message.includes("session_expired") || bodyCode === "SESSION_EXPIRED") {
        return "session_expired";
    }

    if (
        message.includes("session is expired") ||
        message.includes("fresh session")
    ) {
        return "session_expired";
    }

    if (
        message.includes("unauthorized") ||
        message.includes("not authenticated")
    ) {
        return "unauthorized";
    }

    if (message.includes("delete user is disabled")) {
        return "not_enabled";
    }

    return "unknown";
}

function readErrorField(error: unknown, path: string): string | undefined {
    let cursor: unknown = error;

    for (const segment of path.split(".")) {
        if (typeof cursor !== "object" || cursor === null) {
            return;
        }
        cursor = (cursor as Record<string, unknown>)[segment];
    }

    return typeof cursor === "string" ? cursor : undefined;
}

function accountErrorMessage(reason: DeleteUserFailureReason): string {
    switch (reason) {
        case "session_expired":
            return "For your security, please sign in again before deleting your account.";
        case "unauthorized":
            return "Please sign in again to delete your account.";
        case "not_enabled":
            return "Account deletion is not available right now. Please contact support.";
        default:
            return "We couldn't delete your account. Please try again.";
    }
}
