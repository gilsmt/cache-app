import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const PickerNotReadyError = TaggedError.create(
    "PickerNotReadyError",
    z.object({
        pollIntervalMs: z.number(),
    })
);
