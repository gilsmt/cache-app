import * as z from "zod";

export const THREAD_ATTACHMENT_ACCEPT =
    "image/png,image/jpeg,image/webp,image/gif,text/plain,application/pdf";
export const THREAD_ATTACHMENT_MAX_COUNT = 5;
export const THREAD_ATTACHMENT_MAX_SIZE_BYTES = 3 * 1024 * 1024;

const BASE64_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BASE64_INVALID_CHARACTER = /[^A-Za-z0-9+/]/u;

export const ThreadAttachmentsSchema = z
    .array(
        z.strictObject({
            filename: z.string().max(255).optional(),
            mediaType: z.enum([
                "image/png",
                "image/jpeg",
                "image/webp",
                "image/gif",
                "text/plain",
                "application/pdf",
            ]),
            type: z.literal("file"),
            url: z.string(),
        })
    )
    .max(THREAD_ATTACHMENT_MAX_COUNT)
    .superRefine((attachments, context) => {
        let totalBytes = 0;
        for (const [index, attachment] of attachments.entries()) {
            const prefix = `data:${attachment.mediaType};base64,`;
            if (!attachment.url.startsWith(prefix)) {
                context.addIssue({
                    code: "custom",
                    message:
                        "Use a base64 data URL with the file's media type.",
                    path: [index, "url"],
                });
                continue;
            }

            const base64 = attachment.url.slice(prefix.length);
            const padding = base64.endsWith("==")
                ? 2
                : Number(base64.endsWith("="));
            const content = base64.slice(0, base64.length - padding);
            // Unused bits in the last sextet must be zero for canonical base64.
            const hasCanonicalPadding =
                padding === 0 ||
                BASE64_ALPHABET.indexOf(content.at(-1) ?? "=") %
                    (padding === 2 ? 16 : 4) ===
                    0;
            if (
                base64.length % 4 !== 0 ||
                BASE64_INVALID_CHARACTER.test(content) ||
                !hasCanonicalPadding
            ) {
                context.addIssue({
                    code: "custom",
                    message: "Use canonical base64 file data.",
                    path: [index, "url"],
                });
                continue;
            }

            totalBytes += (base64.length / 4) * 3 - padding;
        }

        if (totalBytes > THREAD_ATTACHMENT_MAX_SIZE_BYTES) {
            context.addIssue({
                code: "custom",
                message: "Files must total 3 MiB or less.",
            });
        }
    });

export type ThreadAttachment = z.infer<typeof ThreadAttachmentsSchema>[number];
