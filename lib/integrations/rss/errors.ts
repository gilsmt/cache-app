import * as z from "zod";
import { TaggedError } from "@/lib/common/error";

export const RssFeedError = TaggedError.create(
    "RssFeedError",
    z.object({
        feedId: z.string().optional(),
        kind: z.enum([
            "already_exists",
            "fetch_failed",
            "invalid_url",
            "not_found",
            "parse_failed",
        ]),
        message: z.string(),
    })
);
export type RssFeedError = InstanceType<typeof RssFeedError>;
