import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const ExtensionClipError = TaggedError.create(
    "ExtensionClipError",
    z.object({
        code: z.enum(["invalid_collections", "invalid_url", "upsert_failed"]),
        message: z.string(),
        operation: z.string(),
    })
);
