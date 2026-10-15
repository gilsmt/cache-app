import * as z from "zod";
import { NamedError } from "@/lib/common/error";

/**
 * Failures from the MCP library-item path (`addLibraryItem`).
 *
 * `message` is an enum of the four authored static strings — never
 * interpolate user input, URLs, or upstream text here. The route echoes the
 * 4xx ones back to MCP clients, so the closed enum is what keeps that echo
 * from becoming a leakage channel: anything else fails closed to the
 * generic handler, at both the type level and `isInstance` runtime check.
 */
export const McpLibraryItemError = NamedError.create(
    "McpLibraryItemError",
    z.object({
        code: z.enum([
            "conflicting_inputs",
            "invalid_url",
            "missing_input",
            "reload_failed",
        ]),
        message: z.string(),
        operation: z.string(),
        status: z.number(),
    })
);
