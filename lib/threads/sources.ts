import * as z from "zod";

const ThreadSourceSchema = z.discriminatedUnion("type", [
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

const ThreadSourcesSchema = z.array(ThreadSourceSchema);

const ThreadSourcesEnvelopeSchema = z.object({
    sources: ThreadSourcesSchema,
});

export type ThreadSource = z.infer<typeof ThreadSourceSchema>;

export interface ParsedThreadSources {
    isValid: boolean;
    sources: ThreadSource[];
}

export function parseThreadSources(value: unknown): ParsedThreadSources {
    const envelope = ThreadSourcesEnvelopeSchema.safeParse(value);
    if (envelope.success) {
        return { isValid: true, sources: envelope.data.sources };
    }

    const legacy = ThreadSourcesSchema.safeParse(value);
    if (legacy.success) {
        return { isValid: true, sources: legacy.data };
    }

    return { isValid: false, sources: [] };
}
