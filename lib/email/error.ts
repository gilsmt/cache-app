import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const EmailError = TaggedError.create(
    "EmailError",
    z.object({
        message: z.string(),
        operation: z.string(),
    })
);
