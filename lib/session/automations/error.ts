import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

type AutomationErrorCode =
    | "forbidden"
    | "invalid_schedule"
    | "missing_collection"
    | "not_found"
    | "quota_unavailable"
    | "start_failed"
    | "unauthorized";

export const AutomationError = TaggedError.create(
    "AutomationError",
    z.object({
        code: z.enum([
            "forbidden",
            "invalid_schedule",
            "missing_collection",
            "not_found",
            "quota_unavailable",
            "start_failed",
            "unauthorized",
        ]),
        message: z.string(),
        operation: z.string(),
    })
);

export function createAutomationError(args: {
    code: AutomationErrorCode;
    message: string;
    operation: string;
}): InstanceType<typeof AutomationError> {
    return new AutomationError(args);
}
