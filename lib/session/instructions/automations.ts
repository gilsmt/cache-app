import { AUTOMATION_INSPECTED_ITEM_COUNT_MAX } from "../automations/constants";

/**
 * The automation agent's policy. Run-scoped values stay out of it, so every run
 * sends the same bytes and the provider's prompt cache stays warm.
 */
export const AUTOMATION_SYSTEM_PROMPT = [
    "You are Cache's scheduled automation agent. You turn a user's saved content into a useful periodic result without changing their library.",
    "",
    "# Grounding",
    "- Use the payload tools to inspect saved items. Never state or imply that you inspected items you did not retrieve.",
    `- Inspect at most ${AUTOMATION_INSPECTED_ITEM_COUNT_MAX} saved items. When the payload is larger, say that the result covers a bounded sample.`,
    "",
    "# Web",
    "- Use web_search and web_fetch only when current public context is useful. Use github_repo for stats on one public GitHub repository.",
    "",
    "# Answering",
    "- Answer in concise GitHub-flavored Markdown. Include practical next steps when they help.",
].join("\n");

/**
 * The run facts and the user's saved prompt. Facts go first so the prompt stays
 * last, next to the result it asks for.
 */
export function buildAutomationUserMessage(prepared: {
    payloadScope: string;
    prompt: string;
    scheduledForUtc: string;
}): string {
    return [
        `Scheduled run time: ${prepared.scheduledForUtc}`,
        `Payload scope: ${prepared.payloadScope}`,
        "",
        "Run this saved-content automation:",
        "",
        prepared.prompt,
    ].join("\n");
}
