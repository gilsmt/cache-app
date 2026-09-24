import * as z from "zod";

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

const ChatSourcesSchema = z.array(ChatSourceSchema);

const ChatSourcesEnvelopeSchema = z.object({ sources: ChatSourcesSchema });

export type ChatSource = z.infer<typeof ChatSourceSchema>;

export interface ParsedChatSources {
    isValid: boolean;
    sources: ChatSource[];
}

export function parseChatSources(value: unknown): ParsedChatSources {
    const envelope = ChatSourcesEnvelopeSchema.safeParse(value);
    if (envelope.success) {
        return { isValid: true, sources: envelope.data.sources };
    }

    const legacy = ChatSourcesSchema.safeParse(value);
    if (legacy.success) {
        return { isValid: true, sources: legacy.data };
    }

    return { isValid: false, sources: [] };
}
