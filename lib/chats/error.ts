import * as z from "zod";
import { NamedError } from "@/lib/common/error";

export const ChatError = NamedError.create(
    "ChatError",
    z.object({
        code: z.enum(["not_found", "invalid_run_state"]),
        message: z.string(),
        operation: z.string(),
    })
);
