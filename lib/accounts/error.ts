import * as z from "zod";
import { NamedError } from "@/lib/common/error";

export const AccountError = NamedError.create(
    "AccountError",
    z.object({
        message: z.string(),
        operation: z.string(),
    })
);
