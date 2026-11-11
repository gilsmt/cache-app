import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const SessionError = TaggedError.create(
    "SessionError",
    z.object({
        message: z.string(),
        operation: z.string(),
    })
);
