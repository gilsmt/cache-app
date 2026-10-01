"use server";

import * as z from "zod";
import { isUnauthenticated, requireActionUserId } from "@/lib/auth/session";
import {
    getValidationErrorMessage,
    handleActionError,
} from "@/lib/common/action";
import { createLogger } from "@/lib/common/logs/console/logger";
import { AutomationError } from "./error";
import * as service from "./service";

const log = createLogger("automations:actions");

const STATUS_MAP = {
    forbidden: "FORBIDDEN",
    invalid_schedule: "INVALID",
    missing_collection: "NOT_FOUND",
    not_found: "NOT_FOUND",
    quota_unavailable: "FORBIDDEN",
    start_failed: "ERROR",
    unauthorized: "UNAUTHORIZED",
} as const;

const AutomationScheduleInputSchema = z.object({
    cadence: z.enum(["daily", "weekly", "monthly"]),
    monthDay: z.int().min(1).max(31).nullable().optional(),
    timeOfDayMinutes: z.int().min(0).max(1439),
    timezone: z.string().trim().min(1),
    weekDay: z.int().min(0).max(6).nullable().optional(),
});

const AutomationInputSchema = z.object({
    collectionId: z.string().trim().min(1).nullable().optional(),
    payloadScope: z.enum(["all_library_items", "collection"]),
    prompt: z.string().trim().min(1).max(5000),
    schedule: AutomationScheduleInputSchema,
    title: z.string().trim().min(1).max(120),
});

const AutomationIdInputSchema = z.object({
    automationId: z.string().trim().min(1),
});

const AutomationResumeInputSchema = AutomationIdInputSchema.extend({
    schedule: AutomationScheduleInputSchema,
});

export type AutomationActionResult =
    | {
          automation: service.AutomationListItem;
          status: "SUCCESS";
      }
    | {
          message: string;
          status:
              | "ERROR"
              | "FORBIDDEN"
              | "INVALID"
              | "NOT_FOUND"
              | "UNAUTHORIZED";
      };

export async function listAutomations() {
    const auth = await requireActionUserId(
        "Sign in again to view automations."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    return {
        automations: await service.listAutomations({ userId: auth.userId }),
        status: "SUCCESS" as const,
    };
}

export async function listAutomationRuns(input: {
    automationId: string;
    limit?: number;
}) {
    const parsed = AutomationIdInputSchema.extend({
        limit: z.int().min(1).max(50).optional(),
    }).safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(parsed, "Choose an automation."),
            status: "INVALID" as const,
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to view run history."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        return {
            runs: await service.listAutomationRuns({
                automationId: parsed.data.automationId,
                limit: parsed.data.limit,
                userId: auth.userId,
            }),
            status: "SUCCESS" as const,
        };
    } catch (error) {
        return handleAutomationActionError(
            error,
            "We couldn't load automation runs."
        );
    }
}

export async function createAutomation(
    input: z.input<typeof AutomationInputSchema>
): Promise<AutomationActionResult> {
    const parsed = AutomationInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter valid automation details."
            ),
            status: "INVALID",
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to create automations."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        return {
            automation: await service.createAutomation({
                input: parsed.data,
                userId: auth.userId,
            }),
            status: "SUCCESS",
        };
    } catch (error) {
        return handleAutomationActionError(
            error,
            "We couldn't create this automation."
        );
    }
}

export async function updateAutomation(input: {
    automationId: string;
    automation: z.input<typeof AutomationInputSchema>;
}): Promise<AutomationActionResult> {
    const parsed = z
        .object({
            automation: AutomationInputSchema,
            automationId: z.string().trim().min(1),
        })
        .safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Enter valid automation details."
            ),
            status: "INVALID",
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to update automations."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        return {
            automation: await service.updateAutomation({
                automationId: parsed.data.automationId,
                input: parsed.data.automation,
                userId: auth.userId,
            }),
            status: "SUCCESS",
        };
    } catch (error) {
        return handleAutomationActionError(
            error,
            "We couldn't update this automation."
        );
    }
}

export async function resumeAutomation(
    input: z.input<typeof AutomationResumeInputSchema>
): Promise<AutomationActionResult> {
    const parsed = AutomationResumeInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(
                parsed,
                "Choose a valid schedule."
            ),
            status: "INVALID",
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to resume automations."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        return {
            automation: await service.resumeAutomation({
                automationId: parsed.data.automationId,
                schedule: parsed.data.schedule,
                userId: auth.userId,
            }),
            status: "SUCCESS",
        };
    } catch (error) {
        return handleAutomationActionError(
            error,
            "We couldn't resume this automation."
        );
    }
}

export async function pauseAutomation(input: {
    automationId: string;
}): Promise<AutomationActionResult> {
    return await updateStatusAction(input, service.pauseAutomation, {
        fallbackMessage: "We couldn't pause this automation.",
        unauthorizedMessage: "Sign in again to pause automations.",
    });
}

export async function deleteAutomation(input: { automationId: string }) {
    const parsed = AutomationIdInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(parsed, "Choose an automation."),
            status: "INVALID" as const,
        };
    }

    const auth = await requireActionUserId(
        "Sign in again to delete automations."
    );
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        return {
            deletedAutomation: await service.deleteAutomation({
                automationId: parsed.data.automationId,
                userId: auth.userId,
            }),
            status: "SUCCESS" as const,
        };
    } catch (error) {
        return handleAutomationActionError(
            error,
            "We couldn't delete this automation."
        );
    }
}

async function updateStatusAction(
    input: { automationId: string },
    action: (args: {
        automationId: string;
        userId: string;
    }) => Promise<service.AutomationListItem>,
    copy: {
        fallbackMessage: string;
        unauthorizedMessage: string;
    }
): Promise<AutomationActionResult> {
    const parsed = AutomationIdInputSchema.safeParse(input);
    if (!parsed.success) {
        return {
            message: getValidationErrorMessage(parsed, "Choose an automation."),
            status: "INVALID",
        };
    }

    const auth = await requireActionUserId(copy.unauthorizedMessage);
    if (isUnauthenticated(auth)) {
        return auth;
    }

    try {
        return {
            automation: await action({
                automationId: parsed.data.automationId,
                userId: auth.userId,
            }),
            status: "SUCCESS",
        };
    } catch (error) {
        return handleAutomationActionError(error, copy.fallbackMessage);
    }
}

function handleAutomationActionError(error: unknown, fallbackMessage: string) {
    return handleActionError({
        codeToStatus: STATUS_MAP,
        error,
        errorFactory: AutomationError,
        fallbackMessage,
        log,
    });
}
