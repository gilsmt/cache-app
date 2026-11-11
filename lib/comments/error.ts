import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const CommentError = TaggedError.create(
    "CommentError",
    z.object({
        code: z.enum(["not_found", "too_long"]),
        message: z.string(),
        operation: z.string(),
    })
);
