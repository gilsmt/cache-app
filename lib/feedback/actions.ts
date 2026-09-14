"use server";

import {
    getSessionUserId,
    isUnauthenticated,
    requireActionUserId,
} from "@/lib/auth/session";
import { getValidationErrorMessage } from "@/lib/common/action";
import { FeedbackError } from "@/lib/feedback/error";
import {
    FEEDBACK_PAGE_CONTEXT,
    type FeedbackActionState,
    FeedbackInputSchema,
    HONEYPOT_FIELD,
    PublicFeedbackInputSchema,
} from "@/lib/feedback/schema";
import * as service from "./service";

export async function createFeedback(
    _previousState: FeedbackActionState,
    formData: FormData
): Promise<FeedbackActionState> {
    const auth = await requireActionUserId("Sign in again to submit feedback.");
    if (isUnauthenticated(auth)) {
        return { message: auth.message, status: "error" };
    }

    const parsed = FeedbackInputSchema.safeParse({
        context: getOptionalField(formData, "context"),
        message: formData.get("message"),
        pagePath: formData.get("pagePath"),
    });

    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Please enter a bit of feedback before sending."
            ),
            status: "error",
        };
    }

    try {
        await service.submitFeedback({
            ...parsed.data,
            context: parsed.data.context ?? null,
            email: null,
            userId: auth.userId,
        });

        return {
            message: "Thanks for the feedback.",
            status: "success",
        };
    } catch (error) {
        if (FeedbackError.isInstance(error)) {
            return {
                message: error.data.message,
                status: "error",
            };
        }
        return {
            message: "We couldn't save your feedback. Please try again.",
            status: "error",
        };
    }
}

const PUBLIC_FEEDBACK_SUCCESS: FeedbackActionState = {
    message: "Thanks for the feedback.",
    status: "success",
};

function getOptionalField(
    formData: FormData,
    name: string
): string | undefined {
    const raw = formData.get(name);
    return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

/**
 * Saves feedback from the public feedback page. Anonymous submissions are
 * allowed so recipients of email links can reply without signing in; the
 * session user is attached when one exists and the query email is kept as
 * contact info for triage.
 */
export async function createPublicFeedback(
    _previousState: FeedbackActionState,
    formData: FormData
): Promise<FeedbackActionState> {
    if (getOptionalField(formData, HONEYPOT_FIELD) !== undefined) {
        return PUBLIC_FEEDBACK_SUCCESS;
    }

    const parsed = PublicFeedbackInputSchema.safeParse({
        context: getOptionalField(formData, "context"),
        email: getOptionalField(formData, "email"),
        message: formData.get("message"),
        pagePath: formData.get("pagePath"),
    });

    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Please enter a bit of feedback before sending."
            ),
            status: "error",
        };
    }

    try {
        await service.submitFeedback({
            ...parsed.data,
            context: parsed.data.context ?? FEEDBACK_PAGE_CONTEXT,
            email: parsed.data.email ?? null,
            userId: await getSessionUserId(),
        });

        return PUBLIC_FEEDBACK_SUCCESS;
    } catch (error) {
        if (FeedbackError.isInstance(error)) {
            return {
                message: error.data.message,
                status: "error",
            };
        }
        return {
            message: "We couldn't save your feedback. Please try again.",
            status: "error",
        };
    }
}
