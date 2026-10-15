import "server-only";

import * as z from "zod";
import { isAbortError } from "@/lib/common/abort";
import { createLogger } from "@/lib/common/logs/console/logger";

const log = createLogger("intelligence:github-repo");

const GITHUB_REPO_TIMEOUT_MS = 5000;
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_USER_AGENT = "CacheApp/1.0 (+https://www.cachd.app)";

const GitHubRepoPayloadSchema = z.object({
    description: z.string().nullable().optional(),
    forks_count: z.number().optional(),
    full_name: z.string().optional(),
    html_url: z.string().optional(),
    language: z.string().nullable().optional(),
    open_issues_count: z.number().optional(),
    stargazers_count: z.number().optional(),
});

export async function githubRepo(args: {
    abortSignal?: AbortSignal;
    repo: string;
}) {
    "use step";

    const { abortSignal, repo } = args;
    const timeout = AbortSignal.timeout(GITHUB_REPO_TIMEOUT_MS);
    const signal = abortSignal
        ? AbortSignal.any([abortSignal, timeout])
        : timeout;

    try {
        const res = await fetch(`https://api.github.com/repos/${repo}`, {
            headers: {
                accept: "application/vnd.github+json",
                "User-Agent": GITHUB_USER_AGENT,
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
            signal,
        });
        if (!res.ok) {
            return { error: `Could not find repository ${repo}.`, ok: false };
        }
        const parsedPayload = GitHubRepoPayloadSchema.safeParse(
            await res.json().catch(() => null)
        );
        if (!parsedPayload.success) {
            return {
                error: `GitHub returned an unexpected response for ${repo}.`,
                ok: false,
            };
        }

        const payload = parsedPayload.data;
        return {
            description: payload.description ?? "",
            forks: payload.forks_count ?? 0,
            language: payload.language ?? "Unknown",
            ok: true,
            openIssues: payload.open_issues_count ?? 0,
            repo: payload.full_name ?? repo,
            stars: payload.stargazers_count ?? 0,
            url: payload.html_url ?? `https://github.com/${repo}`,
        };
    } catch (error) {
        if (isAbortError(error)) {
            if (timeout.aborted) {
                return {
                    error: `GitHub request for ${repo} timed out.`,
                    ok: false,
                };
            }
            log.info("GitHub repo fetch aborted", { repo });
            return {
                error: `GitHub request for ${repo} was aborted.`,
                ok: false,
            };
        }
        log.warn("GitHub repo fetch failed", {
            error: error instanceof Error ? error.message : String(error),
            repo,
        });
        return { error: `Could not reach GitHub for ${repo}.`, ok: false };
    }
}
