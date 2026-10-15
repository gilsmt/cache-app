import * as z from "zod";

export const WEB_SEARCH_TIME_RANGES = [
    "year",
    "month",
    "week",
    "day",
    "y",
    "m",
    "w",
    "d",
] as const;

export const WebSearchInputSchema = z.object({
    query: z.string().trim().min(1).max(500),
    timeRange: z.enum(WEB_SEARCH_TIME_RANGES).optional(),
});

export type WebSearchTimeRange = (typeof WEB_SEARCH_TIME_RANGES)[number];

export const GITHUB_REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export const GitHubRepoInputSchema = z.object({
    repo: z
        .string()
        .trim()
        .regex(GITHUB_REPO_PATTERN, 'Must be in "owner/name" format.')
        .describe(
            'The repository in "owner/name" format, e.g. "vercel/next.js"'
        ),
});
