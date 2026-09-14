import * as z from "zod";
import { NamedError } from "@/lib/common/error";

export const CommentError = NamedError.create(
    "CommentError",
    z.object({
        code: z.enum(["invalid_kind", "not_found", "too_long"]),
        message: z.string(),
        operation: z.string(),
    })
);
