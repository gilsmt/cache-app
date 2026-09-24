import "server-only";

import type { UIMessage } from "ai";
import { createLogger } from "@/lib/common/logs/console/logger";
import { prisma } from "@/prisma";
import type { Prisma } from "@/prisma/client/client";
import { AutomationRunStatus, ChatMessageRole } from "@/prisma/client/enums";
import {
    CHAT_ARCHIVE_PAGE_SIZE,
    CHAT_TURN_LEASE_DURATION_MS,
} from "./constants";
import { ChatError } from "./error";
import { type ChatSource, parseChatSources } from "./sources";

const log = createLogger("chats:service");

const CHAT_LIST_INCLUDE = {
    automationRun: {
        select: { status: true },
    },
} satisfies Prisma.ChatInclude;

const CHAT_RUN_CONTEXT_SELECT = {
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

type ChatListRecord = Prisma.ChatGetPayload<{
    include: typeof CHAT_LIST_INCLUDE;
}>;

type ChatRunContextRecord = Prisma.ChatGetPayload<{
    select: typeof CHAT_RUN_CONTEXT_SELECT;
}>;

export interface ChatListItem {
    automationRunId: string | null;
    createdAt: Date;
    id: string;
    runStatus: AutomationRunStatus | null;
    title: string;
    updatedAt: Date;
}

export interface ArchivedChatListPage {
    chats: ChatListItem[];
    page: number;
    pageCount: number;
}

export interface ChatMessageItem {
    content: string;
    createdAt: Date;
    id: string;
    role: ChatMessageRole;
}

export interface ChatRunContext {
    automationId: string;
    automationTitle: string;
    createdAt: Date;
    errorMessage: string | null;
    promptSnapshot: string;
    runId: string;
    scheduledForUtc: Date;
    sources: ChatSource[];
    status: AutomationRunStatus;
    summaryMarkdown: string | null;
}

export interface ChatFollowupContext {
    automationRunId: string | null;
    id: string;
    run: ChatRunContext | null;
}

export interface ChatDetail extends ChatFollowupContext {
    createdAt: Date;
    messages: ChatMessageItem[];
    title: string;
    updatedAt: Date;
}

export async function listChats(args: {
    userId: string;
}): Promise<ChatListItem[]> {
    const chats = await prisma.chat.findMany({
        include: CHAT_LIST_INCLUDE,
        orderBy: { updatedAt: "desc" },
        where: { archivedAt: null, userId: args.userId },
    });

    return chats.map(toChatListItem);
}

export async function listArchivedChats(args: {
    page: number;
    userId: string;
}): Promise<ArchivedChatListPage> {
    const where = {
        archivedAt: { not: null },
        userId: args.userId,
    } satisfies Prisma.ChatWhereInput;
    const totalCount = await prisma.chat.count({ where });
    const pageCount = Math.max(
        1,
        Math.ceil(totalCount / CHAT_ARCHIVE_PAGE_SIZE)
    );
    const page = Math.min(args.page, pageCount);
    const chats = await prisma.chat.findMany({
        include: CHAT_LIST_INCLUDE,
        orderBy: [{ archivedAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * CHAT_ARCHIVE_PAGE_SIZE,
        take: CHAT_ARCHIVE_PAGE_SIZE,
        where,
    });

    return {
        chats: chats.map(toChatListItem),
        page,
        pageCount,
    };
}

function toChatListItem(chat: ChatListRecord): ChatListItem {
    return {
        automationRunId: chat.automationRunId,
        createdAt: chat.createdAt,
        id: chat.id,
        runStatus: chat.automationRun?.status ?? null,
        title: chat.title,
        updatedAt: chat.updatedAt,
    };
}

export async function getChatTitle(args: {
    chatId: string;
    userId: string;
}): Promise<{ id: string; title: string }> {
    const chat = await prisma.chat.findFirst({
        select: { id: true, title: true },
        where: { id: args.chatId, userId: args.userId },
    });

    if (!chat) {
        throw new ChatError({
            code: "not_found",
            message: "That chat is no longer available.",
            operation: "getChatTitle",
        });
    }

    return chat;
}

export async function getChatForFollowup(args: {
    chatId: string;
    userId: string;
}): Promise<ChatFollowupContext> {
    const chat = await prisma.chat.findFirst({
        select: CHAT_RUN_CONTEXT_SELECT,
        where: { id: args.chatId, userId: args.userId },
    });

    if (!chat) {
        throw new ChatError({
            code: "not_found",
            message: "That chat is no longer available.",
            operation: "getChatForFollowup",
        });
    }

    return toChatFollowupContext(chat);
}

export async function getChat(args: {
    chatId: string;
    userId: string;
}): Promise<ChatDetail> {
    const chat = await prisma.chat.findFirst({
        select: {
            ...CHAT_RUN_CONTEXT_SELECT,
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
        where: { id: args.chatId, userId: args.userId },
    });

    if (!chat) {
        throw new ChatError({
            code: "not_found",
            message: "That chat is no longer available.",
            operation: "getChat",
        });
    }

    return {
        ...toChatFollowupContext(chat),
        createdAt: chat.createdAt,
        messages: chat.messages,
        title: chat.title,
        updatedAt: chat.updatedAt,
    };
}

function toChatFollowupContext(
    chat: ChatRunContextRecord
): ChatFollowupContext {
    const run = chat.automationRun;

    return {
        automationRunId: run?.id ?? null,
        id: chat.id,
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

export async function setChatArchived(args: {
    chatId: string;
    isArchived: boolean;
    userId: string;
}): Promise<void> {
    const result = await prisma.chat.updateMany({
        data: { archivedAt: args.isArchived ? new Date() : null },
        where: {
            id: args.chatId,
            userId: args.userId,
        },
    });

    if (result.count === 1) {
        return;
    }

    throw new ChatError({
        code: "not_found",
        message: "That chat is no longer available.",
        operation: "setChatArchived",
    });
}

export async function createChatForAutomationRun(args: {
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
        throw new ChatError({
            code: "not_found",
            message: "That automation run is no longer available.",
            operation: "createChatForAutomationRun",
        });
    }

    const openingMessage = getRunOpeningMessage(run);
    if (!openingMessage) {
        throw new ChatError({
            code: "invalid_run_state",
            message: "Wait until the run finishes before opening its chat.",
            operation: "createChatForAutomationRun",
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

export async function startChatTurn(args: {
    chatId: string;
    message: { content: string; id: string };
    now?: Date;
    userId: string;
}): Promise<ChatMessageItem[]> {
    const now = args.now ?? new Date();
    const leaseExpiresAt = new Date(
        now.getTime() + CHAT_TURN_LEASE_DURATION_MS
    );

    return await prisma.$transaction(async (tx) => {
        const chat = await tx.chat.findFirst({
            select: { id: true, pendingMessageId: true },
            where: { id: args.chatId, userId: args.userId },
        });

        if (!chat) {
            throw new ChatError({
                code: "not_found",
                message: "That chat is no longer available.",
                operation: "startChatTurn",
            });
        }

        const previousPendingId = chat.pendingMessageId;

        const claimed = await tx.chat.updateMany({
            data: {
                pendingExpiresAt: leaseExpiresAt,
                pendingMessageId: args.message.id,
            },
            where: {
                id: chat.id,
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
                where: { id: chat.id, userId: args.userId },
            });
            if (!stillExists) {
                throw new ChatError({
                    code: "not_found",
                    message: "That chat is no longer available.",
                    operation: "startChatTurn",
                });
            }
            throw new ChatError({
                code: "turn_in_progress",
                message:
                    "Wait for the current answer before sending another message.",
                operation: "startChatTurn",
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
            where: { chatId: chat.id },
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
                where: { chatId: chat.id, id: orphaned.id },
            });
        }

        await tx.chatMessage.create({
            data: {
                chatId: chat.id,
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

export async function completeChatTurn(args: {
    assistantMessage: { content: string; id: string };
    chatId: string;
    now?: Date;
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
                id: args.chatId,
                pendingMessageId: args.userMessageId,
                userId: args.userId,
            },
        });
        if (released.count !== 1) {
            return false;
        }

        await tx.chatMessage.create({
            data: {
                chatId: args.chatId,
                content: args.assistantMessage.content,
                id: args.assistantMessage.id,
                role: ChatMessageRole.assistant,
            },
        });
        return true;
    });
}

export async function releaseChatTurn(args: {
    chatId: string;
    deleteMessage?: boolean;
    userId: string;
    userMessageId: string;
}): Promise<void> {
    await prisma.$transaction(async (tx) => {
        const released = await tx.chat.updateMany({
            data: { pendingExpiresAt: null, pendingMessageId: null },
            where: {
                id: args.chatId,
                pendingMessageId: args.userMessageId,
                userId: args.userId,
            },
        });
        if (released.count === 1 && args.deleteMessage) {
            await tx.chatMessage.deleteMany({
                where: { chatId: args.chatId, id: args.userMessageId },
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

function parseSources(value: unknown, runId: string): ChatSource[] {
    const parsed = parseChatSources(value);
    if (!parsed.isValid && value !== null && value !== undefined) {
        log.warn("Ignoring malformed automation run sources", { runId });
    }
    return parsed.sources;
}
