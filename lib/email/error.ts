import * as z from "zod";
import { NamedError } from "@/lib/common/error";

export const EmailError = NamedError.create(
    "EmailError",
    z.object({
        message: z.string(),
        operation: z.string(),
    })
);
