import "server-only";

import { isTextUIPart, type UIMessage } from "ai";
import * as z from "zod";
import { PRISMA_UNIQUE_CONSTRAINT_ERROR } from "@/lib/common/constants";
import { createLogger } from "@/lib/common/logs/console/logger";
import type { AutomationAgentSource } from "@/lib/intelligence/tools/agent-tools";
import { prisma } from "@/prisma";
import { Prisma } from "@/prisma/client/client";
import { AutomationRunStatus, ChatMessageRole } from "@/prisma/client/enums";
import { CHAT_LIST_LIMIT_DEFAULT, CHAT_LIST_LIMIT_MAX } from "./constants";
import { ChatError } from "./error";

const log = createLogger("chats:service");

const ChatSourceSchema = z.discriminatedUnion("type", [
    z.object({
        id: z.string(),
        title: z.string(),
        type: z.literal("library_item"),
        url: z.string(),
    }),
    z.object({
        title: z.string().optional(),
        type: z.literal("web"),
        url: z.string(),
    }),
]);

export interface ChatListItem {
    automationRunId: string | null;
    createdAt: Date;
    id: string;
    runStatus: AutomationRunStatus | null;
    title: string;
    updatedAt: Date;
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
    sources: AutomationAgentSource[];
    status: AutomationRunStatus;
    summaryMarkdown: string | null;
}

export interface ChatDetail {
    automationRunId: string | null;
    createdAt: Date;
    id: string;
    messages: ChatMessageItem[];
    run: ChatRunContext | null;
    title: string;
    updatedAt: Date;
}

export async function listChats(args: {
    limit?: number;
    userId: string;
}): Promise<ChatListItem[]> {
    const chats = await prisma.chat.findMany({
        include: {
            automationRun: {
                select: { status: true },
            },
        },
        orderBy: { updatedAt: "desc" },
        take: Math.min(
            args.limit ?? CHAT_LIST_LIMIT_DEFAULT,
            CHAT_LIST_LIMIT_MAX
        ),
        where: { userId: args.userId },
    });

    return chats.map((chat) => ({
        automationRunId: chat.automationRunId,
        createdAt: chat.createdAt,
        id: chat.id,
        runStatus: chat.automationRun?.status ?? null,
        title: chat.title,
        updatedAt: chat.updatedAt,
    }));
}

export async function getChat(args: {
    chatId: string;
    userId: string;
}): Promise<ChatDetail> {
    const chat = await prisma.chat.findFirst({
        include: {
            automationRun: {
                include: {
                    automation: {
                        select: { id: true, title: true },
                    },
                },
            },
            messages: {
                orderBy: { createdAt: "asc" },
                select: {
                    content: true,
                    createdAt: true,
                    id: true,
                    role: true,
                },
            },
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

    const run = chat.automationRun;
    if (!run) {
        return {
            automationRunId: null,
            createdAt: chat.createdAt,
            id: chat.id,
            messages: chat.messages,
            run: null,
            title: chat.title,
            updatedAt: chat.updatedAt,
        };
    }

    return {
        automationRunId: run.id,
        createdAt: chat.createdAt,
        id: chat.id,
        messages: chat.messages,
        run: {
            automationId: run.automation.id,
            automationTitle: run.automation.title,
            createdAt: run.createdAt,
            errorMessage: run.errorMessage,
            promptSnapshot: run.promptSnapshot,
            runId: run.id,
            scheduledForUtc: run.scheduledForUtc,
            sources: parseChatSources(run.sources, run.id),
            status: run.status,
            summaryMarkdown: run.summaryMarkdown,
        },
        title: chat.title,
        updatedAt: chat.updatedAt,
    };
}

export async function ensureChatForAutomationRun(args: {
    runId: string;
    userId: string;
}): Promise<{ id: string }> {
    const run = await prisma.automationRun.findFirst({
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
            operation: "ensureChatForAutomationRun",
        });
    }

    const openingMessage = getRunOpeningMessage(run);
    if (!openingMessage) {
        throw new ChatError({
            code: "invalid_run_state",
            message: "Wait until the run finishes before opening its chat.",
            operation: "ensureChatForAutomationRun",
        });
    }

    try {
        return await prisma.chat.upsert({
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
    } catch (error) {
        if (
            !(
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === PRISMA_UNIQUE_CONSTRAINT_ERROR
            )
        ) {
            throw error;
        }

        const existing = await prisma.chat.findUnique({
            select: { id: true },
            where: { automationRunId: run.id },
        });
        if (existing) {
            return existing;
        }
        throw error;
    }
}

export async function appendChatMessages(args: {
    chatId: string;
    messages: Array<{ content: string; role: ChatMessageRole }>;
    userId: string;
}): Promise<void> {
    const chat = await prisma.chat.findFirst({
        select: { id: true },
        where: { id: args.chatId, userId: args.userId },
    });

    if (!chat) {
        throw new ChatError({
            code: "not_found",
            message: "That chat is no longer available.",
            operation: "appendChatMessages",
        });
    }

    if (args.messages.length === 0) {
        return;
    }

    await prisma.$transaction([
        prisma.chatMessage.createMany({
            data: args.messages.map((message) => ({
                chatId: chat.id,
                content: message.content,
                role: message.role,
            })),
        }),
        prisma.chat.update({
            data: { updatedAt: new Date() },
            where: { id: chat.id },
        }),
    ]);
}

export function toUIMessages(
    messages: Array<{ content: string; id: string; role: ChatMessageRole }>
): UIMessage[] {
    return messages.map((message) => ({
        id: message.id,
        parts: [{ text: message.content, type: "text" }],
        role: message.role === ChatMessageRole.assistant ? "assistant" : "user",
    }));
}

export function getUIMessageText(message: UIMessage): string {
    return message.parts
        .filter(isTextUIPart)
        .map((part) => part.text)
        .join("");
}

function getRunOpeningMessage(run: {
    errorMessage: string | null;
    status: AutomationRunStatus;
    summaryMarkdown: string | null;
}): string | null {
    if (run.status === AutomationRunStatus.succeeded) {
        return (
            run.summaryMarkdown ??
            "The automation finished without a text summary."
        );
    }
    if (run.status === AutomationRunStatus.failed) {
        return (
            run.errorMessage ??
            run.summaryMarkdown ??
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

function parseChatSources(
    value: unknown,
    runId: string
): AutomationAgentSource[] {
    const parsed = z.array(ChatSourceSchema).safeParse(value);
    if (parsed.success) {
        return parsed.data;
    }
    if (value !== null && value !== undefined) {
        log.warn("Ignoring malformed automation run sources", { runId });
    }
    return [];
}
