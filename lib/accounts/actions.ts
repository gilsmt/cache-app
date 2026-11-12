"use server";

import { headers } from "next/headers";
import { deleteUserAccount } from "@/lib/accounts/service";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import { createLogger } from "@/lib/common/logs/console/logger";
import { asRecord } from "@/lib/common/object";

const log = createLogger("accounts:actions");
const DELETE_ACCOUNT_ERROR_MESSAGE =
    "We couldn't delete your account. Please try again.";

type DeleteAccountActionResult =
    | { message: ""; redirect: string; status: "success" }
    | { message: string; redirect: null; status: "error" };

export async function deleteAccountAction(): Promise<DeleteAccountActionResult> {
    const actor = await requireActionUserId(
        "Sign in again to delete your account."
    );
    if (isUnauthenticated(actor)) {
        return {
            message: actor.message,
            redirect: null,
            status: "error",
        };
    }

    try {
        await deleteUserAccount(await headers());

        return {
            message: "",
            redirect: "/signout",
            status: "success",
        };
    } catch (error) {
        log.error("Account deletion failed", error, {
            operation: "deleteAccountAction",
            userId: actor.userId,
        });

        return {
            message: getDeleteAccountErrorMessage(error),
            redirect: null,
            status: "error",
        };
    }
}

function getDeleteAccountErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
        return DELETE_ACCOUNT_ERROR_MESSAGE;
    }

    const details = asRecord(error);
    const code =
        typeof details?.code === "string"
            ? details.code
            : asRecord(details?.body)?.code;
    const message = error.message.toLowerCase();

    if (
        code === "SESSION_EXPIRED" ||
        message.includes("session_expired") ||
        message.includes("session is expired") ||
        message.includes("fresh session")
    ) {
        return "For your security, please sign in again before deleting your account.";
    }

    if (
        message.includes("unauthorized") ||
        message.includes("not authenticated")
    ) {
        return "Please sign in again to delete your account.";
    }

    if (message.includes("delete user is disabled")) {
        return "Account deletion is not available right now. Please contact support.";
    }

    return DELETE_ACCOUNT_ERROR_MESSAGE;
}
