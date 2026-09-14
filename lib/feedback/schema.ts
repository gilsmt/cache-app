import * as z from "zod";

export const FEEDBACK_PAGE_CONTEXT = "feedback-page";

export const HONEYPOT_FIELD = "website";

export const FeedbackInputSchema = z.object({
    context: z.string().trim().min(1).max(128).optional(),
    message: z.string().trim().min(1).max(1000),
    pagePath: z.string().trim().min(1).max(512),
});

export const FeedbackEmailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email());

export const PublicFeedbackInputSchema = FeedbackInputSchema.extend({
    email: FeedbackEmailSchema.optional(),
});

export interface FeedbackActionState {
    message: string;
    status: "error" | "idle" | "success";
}
