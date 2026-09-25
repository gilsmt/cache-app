import * as z from "zod";
import { NamedError } from "@/lib/common/error";

export const ChatError = NamedError.create(
    "ChatError",
    z.object({
        code: z.enum([
            "invalid_input",
            "invalid_run_state",
            "not_found",
            "turn_in_progress",
        ]),
        message: z.string(),
        operation: z.string(),
    })
);
