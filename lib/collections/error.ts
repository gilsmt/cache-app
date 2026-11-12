import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const LibraryCollectionError = TaggedError.create(
    "LibraryCollectionError",
    z.object({
        code: z.enum(["duplicate_name", "not_found"]),
        message: z.string(),
        operation: z.string(),
    })
);
