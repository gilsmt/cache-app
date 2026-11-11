import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const ThreadError = TaggedError.create(
    "ThreadError",
    z.object({
        code: z.enum([
            "invalid_input",
            "invalid_run_state",
            "not_found",
            "turn_in_progress",
        ]),
        message: z.string(),
        operation: z.string(),
        threadId: z.string().optional(),
    })
);
