import "server-only";

import { AccountError } from "@/lib/account/error";
import { auth } from "@/lib/auth/server";
import { cancelUserActiveSubscriptions } from "@/lib/billing/service";
import { createLogger } from "@/lib/common/logs/console/logger";

const log = createLogger("account:service");

interface DeleteUserAccountResult {
    redirect: string;
}

/**
 * Cancels any active subscription and hard-deletes the user record.
 *
 * Order matters: billing is canceled first so the subscription webhook can't
 * resurrect or modify state mid-deletion. Stripe failures are logged but do
 * not block the deletion — the user is unambiguously leaving and a stranded
 * subscription is a support problem, not a deletion problem.
 *
 * @throws {AccountError} When better-auth rejects the deletion (stale session,
 * missing user) or the database write fails.
 */
export async function deleteUserAccount(
    userId: string,
    requestHeaders: Headers
): Promise<DeleteUserAccountResult> {
    try {
        await cancelUserActiveSubscriptions(userId);
    } catch (error) {
        log.error(
            "Billing cancellation failed during account deletion; proceeding",
            error,
            { operation: "deleteUserAccount", userId }
        );
    }

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
            userId,
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
