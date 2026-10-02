import "server-only";

import type { UIMessage } from "ai";
import { createLogger } from "@/lib/common/logs/console/logger";
import { normalizeWhitespace, truncateText } from "@/lib/common/string";
import { prisma } from "@/prisma";
import type { Prisma } from "@/prisma/client/client";
import { AutomationRunStatus, ChatMessageRole } from "@/prisma/client/enums";
import {
    THREAD_LIST_MAX_ITEMS,
    THREAD_STANDALONE_MARKDOWN_MAX_LENGTH,
    THREAD_STANDALONE_PROMPT_MAX_LENGTH,
    THREAD_TITLE_MAX_LENGTH,
    THREAD_TURN_LEASE_DURATION_MS,
} from "./constants";
import { ThreadError } from "./error";
import { parseThreadSources, type ThreadSource } from "./sources";

const log = createLogger("threads:service");

const THREAD_LIST_SELECT = {
    archivedAt: true,
    automationRun: {
        select: { status: true },
    },
    id: true,
    title: true,
    updatedAt: true,
} satisfies Prisma.ChatSelect;

const THREAD_RUN_CONTEXT_SELECT = {
    automationRun: {
        select: {
            automation: {
                select: { id: true, title: true },
            },
            createdAt: true,
            errorMessage: true,
            id: true,
            promptSnapshot: true,
            scheduledForUtc: true,
            sources: true,
            status: true,
            summaryMarkdown: true,
        },
    },
    automationRunId: true,
    id: true,
} satisfies Prisma.ChatSelect;

type ThreadListRecord = Prisma.ChatGetPayload<{
    select: typeof THREAD_LIST_SELECT;
}>;

type ThreadRunContextRecord = Prisma.ChatGetPayload<{
    select: typeof THREAD_RUN_CONTEXT_SELECT;
}>;

export interface ThreadListItem {
    id: string;
    isArchived: boolean;
    runStatus: AutomationRunStatus | null;
    title: string;
    updatedAt: Date;
}

export interface ThreadMessageItem {
    content: string;
    createdAt: Date;
    id: string;
    role: ChatMessageRole;
}

export interface ThreadRunContext {
    automationId: string;
    automationTitle: string;
    createdAt: Date;
    errorMessage: string | null;
    promptSnapshot: string;
    runId: string;
    scheduledForUtc: Date;
    sources: ThreadSource[];
    status: AutomationRunStatus;
    summaryMarkdown: string | null;
}

export interface ThreadFollowupContext {
    automationRunId: string | null;
    id: string;
    run: ThreadRunContext | null;
}

export interface ThreadDetail extends ThreadFollowupContext {
    createdAt: Date;
    messages: ThreadMessageItem[];
    title: string;
    updatedAt: Date;
}

export async function listThreads(args: {
    userId: string;
}): Promise<ThreadListItem[]> {
    const [active, archived] = await Promise.all([
        prisma.chat.findMany({
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            select: THREAD_LIST_SELECT,
            take: THREAD_LIST_MAX_ITEMS,
            where: { archivedAt: null, userId: args.userId },
        }),
        prisma.chat.findMany({
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            select: THREAD_LIST_SELECT,
            take: THREAD_LIST_MAX_ITEMS,
            where: { archivedAt: { not: null }, userId: args.userId },
        }),
    ]);

    const threads = [...active, ...archived].sort(compareThreadRecords);

    return threads.map(toThreadListItem);
}

function compareThreadRecords(
    a: ThreadListRecord,
    b: ThreadListRecord
): number {
    const byUpdatedAt = b.updatedAt.getTime() - a.updatedAt.getTime();
    if (byUpdatedAt !== 0) {
        return byUpdatedAt;
    }
    if (a.id === b.id) {
        return 0;
    }
    return a.id < b.id ? 1 : -1;
}

function toThreadListItem(thread: ThreadListRecord): ThreadListItem {
    return {
        id: thread.id,
        isArchived: thread.archivedAt !== null,
        runStatus: thread.automationRun?.status ?? null,
        title: thread.title,
        updatedAt: thread.updatedAt,
    };
}

export async function getThreadTitle(args: {
    threadId: string;
    userId: string;
}): Promise<{ id: string; title: string }> {
    const thread = await prisma.chat.findFirst({
        select: { id: true, title: true },
        where: { id: args.threadId, userId: args.userId },
    });

    if (!thread) {
        throw new ThreadError({
            code: "not_found",
            message: "That chat is no longer available.",
            operation: "getThreadTitle",
        });
    }

    return thread;
}

export async function getThreadForFollowup(args: {
    threadId: string;
    userId: string;
}): Promise<ThreadFollowupContext> {
    const thread = await prisma.chat.findFirst({
        select: THREAD_RUN_CONTEXT_SELECT,
        where: { id: args.threadId, userId: args.userId },
    });

    if (!thread) {
        throw new ThreadError({
            code: "not_found",
            message: "That chat is no longer available.",
            operation: "getThreadForFollowup",
        });
    }

    return toThreadFollowupContext(thread);
}

export async function getThread(args: {
    threadId: string;
    userId: string;
}): Promise<ThreadDetail> {
    const thread = await prisma.chat.findFirst({
        select: {
            ...THREAD_RUN_CONTEXT_SELECT,
            createdAt: true,
            messages: {
                orderBy: { sequence: "asc" },
                select: {
                    content: true,
                    createdAt: true,
                    id: true,
                    role: true,
                },
            },
            title: true,
            updatedAt: true,
        },
        where: { id: args.threadId, userId: args.userId },
    });

    if (!thread) {
        throw new ThreadError({
            code: "not_found",
            message: "That chat is no longer available.",
            operation: "getThread",
        });
    }

    return {
        ...toThreadFollowupContext(thread),
        createdAt: thread.createdAt,
        messages: thread.messages,
        title: thread.title,
        updatedAt: thread.updatedAt,
    };
}

function toThreadFollowupContext(
    thread: ThreadRunContextRecord
): ThreadFollowupContext {
    const run = thread.automationRun;

    return {
        automationRunId: run?.id ?? null,
        id: thread.id,
        run: run
            ? {
                  automationId: run.automation.id,
                  automationTitle: run.automation.title,
                  createdAt: run.createdAt,
                  errorMessage: run.errorMessage,
                  promptSnapshot: run.promptSnapshot,
                  runId: run.id,
                  scheduledForUtc: run.scheduledForUtc,
                  sources: parseSources(run.sources, run.id),
                  status: run.status,
                  summaryMarkdown: run.summaryMarkdown,
              }
            : null,
    };
}

export async function setThreadArchived(args: {
    isArchived: boolean;
    threadId: string;
    userId: string;
}): Promise<void> {
    const result = await prisma.chat.updateMany({
        data: { archivedAt: args.isArchived ? new Date() : null },
        where: {
            id: args.threadId,
            userId: args.userId,
        },
    });

    if (result.count === 1) {
        return;
    }

    throw new ThreadError({
        code: "not_found",
        message: "That chat is no longer available.",
        operation: "setThreadArchived",
    });
}

export async function createThreadForAutomationRun(args: {
    runId: string;
    tx: Pick<Prisma.TransactionClient, "automationRun" | "chat">;
    userId: string;
}): Promise<{ id: string }> {
    const run = await args.tx.automationRun.findFirst({
        include: {
            automation: {
                select: { title: true },
            },
        },
        where: { id: args.runId, userId: args.userId },
    });

    if (!run) {
        throw new ThreadError({
            code: "not_found",
            message: "That automation run is no longer available.",
            operation: "createThreadForAutomationRun",
        });
    }

    const openingMessage = getRunOpeningMessage(run);
    if (!openingMessage) {
        throw new ThreadError({
            code: "invalid_run_state",
            message: "Wait until the run finishes before opening its chat.",
            operation: "createThreadForAutomationRun",
        });
    }

    return await args.tx.chat.upsert({
        create: {
            automationRunId: run.id,
            messages: {
                create: {
                    content: openingMessage,
                    role: ChatMessageRole.assistant,
                },
            },
            title: run.automation.title,
            userId: args.userId,
        },
        select: { id: true },
        update: {},
        where: { automationRunId: run.id },
    });
}

export async function createStandaloneThread(args: {
    markdown: string;
    prompt: string;
    userId: string;
}): Promise<{ id: string }> {
    const prompt = args.prompt.trim();
    if (prompt.length === 0) {
        throw new ThreadError({
            code: "invalid_input",
            message: "Enter a valid prompt to continue in chat.",
            operation: "createStandaloneThread",
        });
    }
    if (prompt.length > THREAD_STANDALONE_PROMPT_MAX_LENGTH) {
        throw new ThreadError({
            code: "invalid_input",
            message: "This prompt is too long to continue in chat.",
            operation: "createStandaloneThread",
        });
    }

    const markdown = args.markdown.trim();
    if (markdown.length === 0) {
        throw new ThreadError({
            code: "invalid_input",
            message: "There is no Ask Cache answer to continue.",
            operation: "createStandaloneThread",
        });
    }
    if (markdown.length > THREAD_STANDALONE_MARKDOWN_MAX_LENGTH) {
        throw new ThreadError({
            code: "invalid_input",
            message: "This answer is too long to continue in chat.",
            operation: "createStandaloneThread",
        });
    }

    const thread = await prisma.chat.create({
        data: {
            messages: {
                create: [
                    { content: prompt, role: ChatMessageRole.user },
                    { content: markdown, role: ChatMessageRole.assistant },
                ],
            },
            title: buildStandaloneThreadTitle(prompt),
            userId: args.userId,
        },
        select: { id: true },
    });

    return thread;
}

export function buildStandaloneThreadTitle(prompt: string): string {
    const title = truncateText(
        normalizeWhitespace(prompt),
        THREAD_TITLE_MAX_LENGTH
    );
    return title.length > 0 ? title : "Ask Cache chat";
}

export async function startThreadTurn(args: {
    message: { content: string; id: string };
    now?: Date;
    threadId: string;
    userId: string;
}): Promise<ThreadMessageItem[]> {
    const now = args.now ?? new Date();
    const leaseExpiresAt = new Date(
        now.getTime() + THREAD_TURN_LEASE_DURATION_MS
    );

    return await prisma.$transaction(async (tx) => {
        const thread = await tx.chat.findFirst({
            select: { id: true, pendingMessageId: true },
            where: { id: args.threadId, userId: args.userId },
        });

        if (!thread) {
            throw new ThreadError({
                code: "not_found",
                message: "That chat is no longer available.",
                operation: "startThreadTurn",
            });
        }

        const previousPendingId = thread.pendingMessageId;

        const claimed = await tx.chat.updateMany({
            data: {
                pendingExpiresAt: leaseExpiresAt,
                pendingMessageId: args.message.id,
            },
            where: {
                id: thread.id,
                OR: [
                    { pendingMessageId: null },
                    { pendingExpiresAt: null },
                    { pendingExpiresAt: { lte: now } },
                ],
                userId: args.userId,
            },
        });
        if (claimed.count !== 1) {
            const stillExists = await tx.chat.findFirst({
                select: { id: true },
                where: { id: thread.id, userId: args.userId },
            });
            if (!stillExists) {
                throw new ThreadError({
                    code: "not_found",
                    message: "That chat is no longer available.",
                    operation: "startThreadTurn",
                });
            }
            throw new ThreadError({
                code: "turn_in_progress",
                message:
                    "Wait for the current answer before sending another message.",
                operation: "startThreadTurn",
            });
        }

        const history = await tx.chatMessage.findMany({
            orderBy: { sequence: "asc" },
            select: {
                content: true,
                createdAt: true,
                id: true,
                role: true,
            },
            where: { chatId: thread.id },
        });

        const trailing = history.at(-1);
        const orphaned =
            previousPendingId &&
            trailing?.role === ChatMessageRole.user &&
            trailing.id === previousPendingId
                ? trailing
                : null;
        if (orphaned) {
            await tx.chatMessage.deleteMany({
                where: { chatId: thread.id, id: orphaned.id },
            });
        }

        await tx.chatMessage.create({
            data: {
                chatId: thread.id,
                content: args.message.content,
                id: args.message.id,
                role: ChatMessageRole.user,
            },
        });

        return [
            ...(orphaned
                ? history.filter((message) => message.id !== orphaned.id)
                : history),
            {
                content: args.message.content,
                createdAt: now,
                id: args.message.id,
                role: ChatMessageRole.user,
            },
        ];
    });
}

export async function completeThreadTurn(args: {
    assistantMessage: { content: string; id: string };
    now?: Date;
    threadId: string;
    userId: string;
    userMessageId: string;
}): Promise<boolean> {
    const now = args.now ?? new Date();

    return await prisma.$transaction(async (tx) => {
        const released = await tx.chat.updateMany({
            data: {
                pendingExpiresAt: null,
                pendingMessageId: null,
                updatedAt: now,
            },
            where: {
                id: args.threadId,
                pendingMessageId: args.userMessageId,
                userId: args.userId,
            },
        });
        if (released.count !== 1) {
            return false;
        }

        await tx.chatMessage.create({
            data: {
                chatId: args.threadId,
                content: args.assistantMessage.content,
                id: args.assistantMessage.id,
                role: ChatMessageRole.assistant,
            },
        });
        return true;
    });
}

export async function releaseThreadTurn(args: {
    deleteMessage?: boolean;
    threadId: string;
    userId: string;
    userMessageId: string;
}): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const released = await tx.chat.updateMany({
            data: { pendingExpiresAt: null, pendingMessageId: null },
            where: {
                id: args.threadId,
                pendingMessageId: args.userMessageId,
                userId: args.userId,
            },
        });
        if (released.count === 1 && args.deleteMessage) {
            await tx.chatMessage.deleteMany({
                where: { chatId: args.threadId, id: args.userMessageId },
            });
        }
    });
}

export function toUIMessages(
    messages: Array<{
        content: string;
        createdAt: Date;
        id: string;
        role: ChatMessageRole;
    }>
): UIMessage[] {
    return messages.map((message) => ({
        id: message.id,
        metadata: { createdAt: message.createdAt.toISOString() },
        parts: [{ text: message.content, type: "text" }],
        role: message.role === ChatMessageRole.assistant ? "assistant" : "user",
    }));
}

function getRunOpeningMessage(run: {
    errorMessage: string | null;
    status: AutomationRunStatus;
    summaryMarkdown: string | null;
}): string | null {
    if (run.status === AutomationRunStatus.succeeded) {
        return (
            run.summaryMarkdown ||
            "The automation finished without a text summary."
        );
    }
    if (run.status === AutomationRunStatus.failed) {
        return (
            run.errorMessage ||
            run.summaryMarkdown ||
            "The automation failed without details."
        );
    }
    if (run.status === AutomationRunStatus.skipped) {
        return "This run was skipped before producing output.";
    }
    if (run.status === AutomationRunStatus.canceled) {
        return "This run was canceled before producing output.";
    }
    return null;
}

function parseSources(value: unknown, runId: string): ThreadSource[] {
    const parsed = parseThreadSources(value);
    if (!parsed.isValid && value !== null && value !== undefined) {
        log.warn("Ignoring malformed automation run sources", { runId });
    }
    return parsed.sources;
}
