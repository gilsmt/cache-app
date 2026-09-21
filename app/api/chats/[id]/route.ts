import {
    convertToModelMessages,
    createUIMessageStreamResponse,
    isStepCount,
    streamText,
    toUIMessageStream,
    type UIMessage,
    validateUIMessages,
} from "ai";
import { requireRouteUserId } from "@/lib/auth/session";
import {
    CHAT_FOLLOWUP_MESSAGE_MAX_LENGTH,
    CHAT_FOLLOWUP_OUTPUT_TOKEN_LIMIT,
} from "@/lib/chats/constants";
import { ChatError } from "@/lib/chats/error";
import {
    appendChatMessages,
    getChat,
    getUIMessageText,
    toUIMessages,
} from "@/lib/chats/service";
import { createLogger } from "@/lib/common/logs/console/logger";
import { isGenAILimitError } from "@/lib/intelligence/protection";
import { DEFAULT_REGISTERED_MODEL } from "@/lib/intelligence/providers/model-registry";
import { resolveRegisteredModel } from "@/lib/intelligence/providers/model-resolver";
import { createAutomationAgentTools } from "@/lib/intelligence/tools/agent-tools";
import { estimateTokens } from "@/lib/intelligence/usage";
import { ChatMessageRole } from "@/prisma/client/enums";

const log = createLogger("api:chats");

export const maxDuration = 30;

interface ChatRouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: ChatRouteParams) {
    const { id: chatId } = await params;

    const auth = await requireRouteUserId();
    if (auth instanceof Response) {
        return auth;
    }
    const { userId } = auth;

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const incoming = (body as { message?: unknown })?.message;
    if (!incoming || typeof incoming !== "object") {
        return Response.json({ error: "Invalid message." }, { status: 400 });
    }

    let chat: Awaited<ReturnType<typeof getChat>>;
    try {
        chat = await getChat({ chatId, userId });
    } catch (error) {
        if (ChatError.isInstance(error) && error.data.code === "not_found") {
            return Response.json(
                { error: error.data.message },
                { status: 404 }
            );
        }
        log.error("Failed to load chat", { chatId, error, userId });
        return Response.json(
            { error: "We couldn't load this chat." },
            { status: 500 }
        );
    }

    const tools = chat.automationRunId
        ? createAutomationAgentTools({ runId: chat.automationRunId }).tools
        : {};

    const history = toUIMessages(chat.messages);
    let messages: UIMessage[];
    try {
        messages = await validateUIMessages({
            messages: [...history, incoming],
            tools,
        });
    } catch {
        return Response.json({ error: "Invalid message." }, { status: 400 });
    }

    const lastMessage = messages.at(-1);
    if (!lastMessage) {
        return Response.json({ error: "Invalid message." }, { status: 400 });
    }
    const lastUserText = getUIMessageText(lastMessage);
    if (!lastUserText.trim()) {
        return Response.json({ error: "Invalid message." }, { status: 400 });
    }
    if (lastUserText.length > CHAT_FOLLOWUP_MESSAGE_MAX_LENGTH) {
        return Response.json(
            { error: "Message is too long." },
            { status: 400 }
        );
    }

    const system = buildFollowupSystemPrompt(chat);

    try {
        const { protectGenAiRequest } = await import(
            "@/lib/intelligence/protection"
        );
        await protectGenAiRequest({
            feature: "chat_followup",
            request,
            requestedTokens: estimateTokens(
                `${system}\n\n${lastUserText}`,
                CHAT_FOLLOWUP_OUTPUT_TOKEN_LIMIT
            ),
            userId,
        });
    } catch (error) {
        if (isGenAILimitError(error)) {
            return Response.json(
                { error: error.data.message },
                { status: 429 }
            );
        }
        log.error("Failed to protect chat follow-up request", {
            chatId,
            error,
            userId,
        });
        return Response.json(
            { error: "We couldn't process this message." },
            { status: 500 }
        );
    }

    const result = streamText({
        abortSignal: request.signal,
        maxOutputTokens: CHAT_FOLLOWUP_OUTPUT_TOKEN_LIMIT,
        messages: await convertToModelMessages(messages),
        model: resolveRegisteredModel(
            DEFAULT_REGISTERED_MODEL,
            "chat_followup"
        ),
        stopWhen: isStepCount(6),
        system,
        tools,
    });

    return createUIMessageStreamResponse({
        stream: toUIMessageStream({
            onEnd: ({ messages: finishedMessages }) =>
                persistFollowup({
                    chatId: chat.id,
                    finishedMessages,
                    originalCount: history.length,
                    userId,
                }),
            onError: () => "Something went wrong. Please try again.",
            originalMessages: messages,
            stream: result.stream,
        }),
    });
}

function buildFollowupSystemPrompt(
    chat: Awaited<ReturnType<typeof getChat>>
): string {
    const run = chat.run;
    if (!run) {
        return [
            "You are Cache's assistant.",
            "Answer follow-up questions concisely in markdown.",
            "Use web_search and web_fetch only when current public context is useful.",
        ].join("\n");
    }
    const summary =
        run.summaryMarkdown ?? run.errorMessage ?? "No output recorded.";
    return [
        "You are Cache's assistant answering follow-ups about a scheduled automation run.",
        `Automation: ${run.automationTitle}`,
        `Original request: ${run.promptSnapshot}`,
        `Run output:\n${summary}`,
        "Use the payload tools to inspect saved items when the question needs specifics. Do not claim to inspect items you did not retrieve.",
        "Use web_search and web_fetch only when current public context is useful.",
        "Answer concisely in markdown.",
    ].join("\n");
}

async function persistFollowup(args: {
    chatId: string;
    finishedMessages: UIMessage[];
    originalCount: number;
    userId: string;
}): Promise<void> {
    const fresh = args.finishedMessages.slice(args.originalCount);
    const rows = fresh
        .map((message) => ({
            content: getUIMessageText(message),
            role:
                message.role === "assistant"
                    ? ChatMessageRole.assistant
                    : ChatMessageRole.user,
        }))
        .filter(
            (row): row is { content: string; role: ChatMessageRole } =>
                row.content.trim().length > 0 &&
                (row.role === ChatMessageRole.assistant ||
                    row.role === ChatMessageRole.user)
        );
    if (rows.length === 0) {
        return;
    }
    try {
        await appendChatMessages({
            chatId: args.chatId,
            messages: rows,
            userId: args.userId,
        });
    } catch (error) {
        log.warn("Failed to persist chat follow-up", {
            chatId: args.chatId,
            error: error instanceof Error ? error.message : String(error),
        });
    }
}
