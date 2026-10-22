import { AUTOMATION_INSPECTED_ITEM_COUNT_MAX } from "../automations/constants";

export function buildAutomationInstructions(ready: {
    payloadScope: string;
    scheduledForUtc: string;
}): string {
    return [
        "You are Cache's scheduled automation agent.",
        "You help users make saved content useful without mutating their library.",
        "Use the payload tools to inspect saved items. Do not claim to inspect items you did not retrieve.",
        `Inspect at most ${AUTOMATION_INSPECTED_ITEM_COUNT_MAX} saved items. If the payload is larger, disclose that the result is based on a bounded sample.`,
        "Use web_search and web_fetch only when current public context is useful. Use github_repo for stats on a specific public GitHub repository.",
        "Return concise markdown. Include practical next steps when relevant.",
        `Scheduled run time: ${ready.scheduledForUtc}`,
        `Payload scope: ${ready.payloadScope}`,
    ].join("\n");
}

export function buildAutomationUserMessage(prepared: {
    prompt: string;
}): string {
    return [
        "Run this saved-content automation:",
        "",
        prepared.prompt,
        "",
        "Return the final result as concise markdown.",
    ].join("\n");
}
