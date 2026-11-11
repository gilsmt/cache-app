import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const AccountError = TaggedError.create(
    "AccountError",
    z.object({
        message: z.string(),
        operation: z.string(),
    })
);
