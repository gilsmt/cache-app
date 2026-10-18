import { tool } from "ai";
import * as z from "zod";

export const askUser = tool({
    description:
        "Ask the user clarifying questions when their request is ambiguous. Provide one or more questions, each with exactly 3 short, distinct answer choices. The user can also answer in their own words.",
    inputSchema: z.object({
        questions: z
            .array(
                z.object({
                    choices: z
                        .array(z.string())
                        .length(3)
                        .describe("Exactly three short answer choices"),
                    question: z.string().describe("The question to ask"),
                })
            )
            .min(1)
            .describe("The questions to ask the user"),
    }),
    outputSchema: z
        .array(z.object({ answer: z.string(), question: z.string() }))
        .describe("The user's answer to each question"),
});
