import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const StripeError = TaggedError.create(
    "StripeError",
    z.object({
        message: z.string(),
        operation: z.string(),
    })
);
