import "server-only";

import { createLogger } from "@/lib/common/logs/console/logger";
import { prisma } from "@/prisma";
import { FeedbackError } from "./error";

const log = createLogger("feedback:submit");

interface SubmitFeedbackInput {
    context: string | null;
    email: string | null;
    message: string;
    pagePath: string;
    userId: string | null;
}

export async function submitFeedback({
    message,
    pagePath,
    context,
    email,
    userId,
}: SubmitFeedbackInput): Promise<void> {
    try {
        await prisma.feedback.create({
            data: {
                context,
                email,
                message,
                pagePath,
                userId,
            },
        });

        log.info("Feedback saved", {
            context,
            pagePath,
            userId,
        });
    } catch (error) {
        log.error("Failed to save feedback", error, {
            pagePath,
            userId,
        });

        throw new FeedbackError(
            {
                message: "Could not save feedback right now.",
                operation: "submit",
            },
            { cause: error }
        );
    }
}
