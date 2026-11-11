import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const CollectionShareError = TaggedError.create(
    "CollectionShareError",
    z.object({
        code: z.enum([
            "not_found",
            "share_generation_failed",
            "subscription_required",
        ]),
        message: z.string(),
        operation: z.string(),
    })
);
