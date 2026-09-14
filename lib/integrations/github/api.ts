import "server-only";

import * as z from "zod";
import { IntegrationApiError } from "@/lib/integrations/error";
import type { Prisma } from "@/prisma/client/client";

const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const GITHUB_PAGE_SIZE = 100;
const MAX_GITHUB_STARRED_PAGES = 20;

interface GitHubImportableRepository {
    readonly caption: string | null;
    readonly externalId: string;
    readonly postedAt: Date | null;
    readonly sourceMetadata: Prisma.InputJsonObject;
    readonly url: string;
}

interface GitHubAuthenticatedUser {
    readonly avatarUrl: string | null;
    readonly id: string;
    readonly login: string | null;
    readonly name: string | null;
}

const GitHubApiErrorSchema = z.object({
    message: z.string().optional(),
});

const GitHubUserSchema = z.object({
    avatar_url: z.string().optional(),
    id: z.number(),
    login: z.string().optional(),
    name: z.string().optional(),
});

const GitHubOwnerSchema = z.object({
    avatar_url: z.string().optional(),
    id: z.number(),
    login: z.string().optional(),
});

const GitHubRepositorySchema = z.object({
    default_branch: z.string().optional(),
    description: z.string().optional(),
    fork: z.boolean().optional(),
    full_name: z.string().optional(),
    html_url: z.string(),
    id: z.number(),
    language: z.string().optional(),
    owner: GitHubOwnerSchema.optional(),
    private: z.boolean().optional(),
    stargazers_count: z.number().optional(),
    topics: z.array(z.string()).optional(),
    updated_at: z.string().optional(),
});

function parseGitHubApiError(
    payload: unknown,
    status: number
): IntegrationApiError {
    const parsed = GitHubApiErrorSchema.safeParse(payload);
    const message =
        parsed.data?.message ||
        `GitHub API request failed with status ${status}.`;

    return new IntegrationApiError({
        integrationId: "github",
        message,
        operation: "fetchGitHub",
        status,
    });
}

async function fetchGitHub(
    accessToken: string,
    path: string,
    searchParams?: URLSearchParams
): Promise<unknown> {
    const response = await fetch(
        `${GITHUB_API_BASE_URL}${path}${searchParams ? `?${searchParams.toString()}` : ""}`,
        {
            cache: "no-store",
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${accessToken}`,
                "X-GitHub-Api-Version": GITHUB_API_VERSION,
            },
        }
    );

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw parseGitHubApiError(payload, response.status);
    }

    return payload;
}

function parseAuthenticatedUser(
    payload: unknown
): GitHubAuthenticatedUser | null {
    const parsed = GitHubUserSchema.safeParse(payload);
    if (!parsed.success) {
        return null;
    }

    return {
        avatarUrl: parsed.data.avatar_url ?? null,
        id: String(parsed.data.id),
        login: parsed.data.login ?? null,
        name: parsed.data.name ?? null,
    };
}

function parseRepository(
    candidate: unknown
): GitHubImportableRepository | null {
    const parsed = GitHubRepositorySchema.safeParse(candidate);
    if (!parsed.success) {
        return null;
    }

    const record = parsed.data;
    const { owner } = record;
    const fullName = record.full_name ?? null;
    const language = record.language ?? null;
    const topics = record.topics ?? [];

    return {
        caption: record.description ?? fullName,
        externalId: String(record.id),
        postedAt: record.updated_at ? new Date(record.updated_at) : null,
        sourceMetadata: {
            github: {
                defaultBranch: record.default_branch ?? null,
                fork: record.fork ?? false,
                fullName,
                language,
                owner: {
                    avatarUrl: owner?.avatar_url ?? null,
                    id: owner?.id ?? null,
                    login: owner?.login ?? null,
                },
                private: record.private ?? false,
                stargazersCount: record.stargazers_count ?? null,
                topics,
            },
        },
        url: record.html_url,
    };
}

export async function getGitHubAuthenticatedUser(
    accessToken: string
): Promise<GitHubAuthenticatedUser> {
    const payload = await fetchGitHub(accessToken, "/user");
    const user = parseAuthenticatedUser(payload);

    if (!user) {
        throw new IntegrationApiError({
            integrationId: "github",
            message: "GitHub did not return a valid user.",
            operation: "getGitHubAuthenticatedUser",
            status: 502,
        });
    }

    return user;
}

export async function listGitHubStarredRepositories(
    accessToken: string
): Promise<{
    /** True only when a short page ended the walk; a page-cap stop leaves the fetched set partial. */
    complete: boolean;
    repositories: GitHubImportableRepository[];
    /** True when the page cap stopped pagination before the list ended. */
    truncated: boolean;
}> {
    const repositories: GitHubImportableRepository[] = [];
    let complete = false;

    for (let page = 1; page <= MAX_GITHUB_STARRED_PAGES; page += 1) {
        const payload = await fetchGitHub(
            accessToken,
            "/user/starred",
            new URLSearchParams({
                page: String(page),
                per_page: String(GITHUB_PAGE_SIZE),
            })
        );
        const rows = Array.isArray(payload) ? payload : [];
        const repositoriesPage = rows.flatMap((row) => {
            const repository = parseRepository(row);
            return repository ? [repository] : [];
        });

        repositories.push(...repositoriesPage);
        if (rows.length < GITHUB_PAGE_SIZE) {
            complete = true;
            break;
        }
    }

    // A full final page at the cap may or may not have more stars behind it;
    // reporting truncated (instead of guessing from page arithmetic) keeps
    // the snapshot prune from treating unfetched items as deleted and only
    // costs the UI suffix in the rare exact-multiple case.
    return { complete, repositories, truncated: !complete };
}
