import * as z from "zod";
import { isHttpUrl } from "@/lib/common/url";
import { AUTOMATION_ITEM_PAGE_LIMIT_MAX } from "./constants";

export const AUTOMATION_WEB_SEARCH_TIME_RANGES = [
    "year",
    "month",
    "week",
    "day",
    "y",
    "m",
    "w",
    "d",
] as const;

export const EmptyAutomationToolInputSchema = z.object({});

export const AutomationPayloadItemsInputSchema = z.object({
    cursor: z.string().trim().min(1).optional(),
    limit: z.int().min(1).max(AUTOMATION_ITEM_PAGE_LIMIT_MAX).optional(),
    search: z.string().trim().max(200).optional(),
});

export const AutomationWebFetchInputSchema = z.object({
    // z.url() fails at WorkflowAgent tool schema compilation with unknown format "uri".
    // Use a plain string with a runtime check instead.
    url: z
        .string()
        .trim()
        .min(1)
        .max(4096)
        .refine(isHttpUrl, { error: "URL must be an http(s) URL." })
        .describe("Absolute http(s) URL, e.g. https://example.com/article."),
});

export const AutomationWebSearchInputSchema = z.object({
    query: z.string().trim().min(1).max(500),
    timeRange: z.enum(AUTOMATION_WEB_SEARCH_TIME_RANGES).optional(),
});

export type AutomationWebSearchTimeRange =
    (typeof AUTOMATION_WEB_SEARCH_TIME_RANGES)[number];
