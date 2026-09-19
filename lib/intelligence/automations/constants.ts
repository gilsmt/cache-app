import type { AutomationTemplateKey } from "@/prisma/client/enums";

export const AUTOMATION_AGENT_MODEL_DEFAULT = "openai/gpt-5.6-luna";
export const AUTOMATION_DUE_BATCH_LIMIT = 10;
export const AUTOMATION_INSPECTED_ITEM_COUNT_MAX = 120;
export const AUTOMATION_ITEM_PAGE_LIMIT_DEFAULT = 20;
export const AUTOMATION_ITEM_PAGE_LIMIT_MAX = 50;
export const AUTOMATION_LEASE_DURATION_MS = 10 * 60 * 1000;
export const AUTOMATION_RUNNING_TIMEOUT_MS = 45 * 60 * 1000;
// The scheduler that ticks the automations cron runs at least once a day, so
// a due run waits under a day plus one tick of slack. A longer wait means the
// scheduler stopped claiming runs.
export const AUTOMATION_SCHEDULER_STALL_TOLERANCE_MS = 26 * 60 * 60 * 1000;
export const AUTOMATION_TEXT_PREVIEW_LENGTH_MAX = 1200;
export const AUTOMATION_WEB_FETCH_BODY_LENGTH_MAX = 12_000;
export const AUTOMATION_WEB_FETCH_TIMEOUT_MS = 15_000;
export const AUTOMATION_WEB_FETCH_RETRY_ATTEMPTS = 3;
export const AUTOMATION_WEB_FETCH_RETRY_BASE_DELAY_MS = 1000;
export const AUTOMATION_WEB_FETCH_TOTAL_TIMEOUT_MS = 30_000;

// Built-in automations seeded for every new user at signup time. Smart
// collections is intentionally NOT here: it is a per-user Library preference
// (`User.smartCollectionsEnabled`) backed by the event-driven classifier
// that runs on every save, not a scheduled automation.
export const AUTOMATION_TEMPLATE_DEFINITIONS = [
    {
        cadence: "daily",
        prompt: "Create a concise daily digest of the most useful items saved recently. Group related ideas, call out what deserves attention today, and include practical next steps.",
        summary:
            "A concise digest of the most useful items you saved recently.",
        templateKey: "daily_digest",
        title: "Daily Digest",
    },
    {
        cadence: "weekly",
        prompt: "Find older saved items that still deserve attention. Prefer unfinished, high-value, or easy-to-act-on saves. Explain why each is worth revisiting and suggest one concrete next step.",
        summary: "Surface older saves that still deserve a second look.",
        templateKey: "worth_revisiting",
        title: "Worth Revisiting",
    },
    {
        cadence: "weekly",
        prompt: "Scan recent saves and notes for open loops. Extract concrete next actions, group them by theme, and rank by impact or urgency. Skip fluff.",
        summary: "Extract action items from recent saves and notes.",
        templateKey: "next_actions",
        title: "Next Actions",
    },
] as const satisfies Array<{
    cadence: "daily" | "weekly" | "monthly";
    prompt: string;
    summary: string;
    templateKey: AutomationTemplateKey;
    title: string;
}>;
