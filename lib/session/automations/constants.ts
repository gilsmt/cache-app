import type {
    AutomationCadence,
    AutomationTemplateKey,
} from "@/prisma/client/enums";

export const AUTOMATION_DUE_BATCH_LIMIT = 10;
export const AUTOMATION_INSPECTED_ITEM_COUNT_MAX = 120;
export const AUTOMATION_ITEM_PAGE_LIMIT_DEFAULT = 20;
export const AUTOMATION_ITEM_PAGE_LIMIT_MAX = 50;
export const AUTOMATION_LEASE_DURATION_MS = 10 * 60 * 1000;
export const AUTOMATION_RUNNING_TIMEOUT_MS = 45 * 60 * 1000;
export const AUTOMATION_TEXT_PREVIEW_LENGTH_MAX = 1200;
export const AUTOMATION_WEB_FETCH_BODY_LENGTH_MAX = 12_000;
export const AUTOMATION_WEB_FETCH_TIMEOUT_MS = 15_000;
export const AUTOMATION_WEB_FETCH_RETRY_ATTEMPTS = 3;
export const AUTOMATION_WEB_FETCH_RETRY_BASE_DELAY_MS = 1000;
export const AUTOMATION_WEB_FETCH_TOTAL_TIMEOUT_MS = 30_000;

export interface AutomationTemplateDefinition {
    defaultCadence: AutomationCadence;
    prompt: string;
    summary: string;
    title: string;
}

export interface AutomationTemplate extends AutomationTemplateDefinition {
    templateKey: AutomationTemplateKey;
}

// First-party automation templates available to every user. The catalog is the
// source of truth for suggestions; an Automation row exists only after the user
// adds a template or creates a custom automation. Smart collections is
// intentionally not here: it is a per-user library preference backed by the
// event-driven classifier, not a scheduled automation.
export const AUTOMATION_TEMPLATE_DEFINITIONS = {
    collection_brief: {
        defaultCadence: "weekly",
        prompt: "Write a share-ready brief for the collection this automation is scoped to. If it is not scoped to a collection, pick the collection with the most recent saves and say which one. State the audience you are writing for in one line (for example, a collaborator unfamiliar with the collection). Lead with 3 themes in the collection, then list at most 6 standout items with a one-line reason and a link. End with 3 questions a new reader would ask. Do not quote private notes verbatim; paraphrase or omit them. If the collection has too few items, say so.",
        summary:
            "A share-ready brief of one collection's themes and standout items.",
        title: "Collection Brief",
    },
    collection_health: {
        defaultCadence: "monthly",
        prompt: "Audit the collections represented in the items you inspect. Report: the 3 collections with the most recent activity, up to 3 collections that have gone quiet for more than 90 days, and up to 3 items that look misfiled based on their caption and collection names. Use counts from the items you actually inspected and state the sample size. End with 3 concrete cleanup suggestions. Do not claim a collection is empty or neglected unless the inspected items support it. Do not propose deleting anything.",
        summary:
            "A sample audit of collection activity, misfiled items, and quiet collections.",
        title: "Collection Health",
    },
    daily_digest: {
        defaultCadence: "daily",
        prompt: "Review the items saved in the last 24 hours. Pick at most 5 that are worth attention today, ranked by usefulness. For each, write one line on what it is and one line on why it matters now, with a link. Group closely related saves under one heading instead of repeating them. End with one thing to do today. If nothing clears the bar, say 'Quiet day: N saved, none worth your attention.' Do not pad.",
        summary:
            "A short, ranked digest of what you saved today and what deserves attention now.",
        title: "Daily Digest",
    },
    decision_memo: {
        defaultCadence: "monthly",
        prompt: "Use the items available to this run to write a decision memo. If the run is scoped to a collection, treat it as the decision context; otherwise pick the collection with the most recent saves and say which one. State the decision the saves point to. Then give a small criteria table with the options as rows, the criteria as columns, and 'unknown' where the saves do not say. List the evidence for each option with links. Recommend one option and state the one fact that would change the recommendation. If the saves do not support a decision, say so and name what is missing.",
        summary:
            "A criteria table and recommendation for a collection of competing options.",
        title: "Decision Memo",
    },
    duplicate_radar: {
        defaultCadence: "monthly",
        prompt: "Look for duplicate saves among the items you inspect. Check exact URL matches first, then near-identical titles from the same source. Report at most 5 groups. For each group, list the items with links and say 'exact URL match' or 'probable duplicate' with the evidence. Recommend which copy to keep and why, and ask the reader to verify before deleting anything. If you find no duplicates, say so. If the sample is partial, say so.",
        summary:
            "Exact and probable duplicate saves, with the evidence and which copy to keep.",
        title: "Duplicate Radar",
    },
    expiring_soon: {
        defaultCadence: "weekly",
        prompt: "Find saved items with an explicit deadline in the next 30 days: events, tickets, sales, applications, renewals, or reservations. Only include an item when its caption or note states a date or an explicit time-sensitive phrase. Quote the date or phrase. Do not infer a deadline from a URL, domain, or guess. For each, give the deadline, what to do, and a link. Rank by urgency and return at most 5. End with the one deadline to handle first. If no explicit dates are found, say so.",
        summary:
            "Saved items with explicit deadlines in the next 30 days, ranked by urgency.",
        title: "Expiring Soon",
    },
    learning_path: {
        defaultCadence: "monthly",
        prompt: "Use the items available to this run to build a four-week learning path. Pick one skill or topic that the saves cluster around. Sequence at most 6 saved resources from foundations to practice, with a one-line reason for each and a link. Add one small deliverable per week. Check prerequisites and mark any gap where a resource is missing. Do not add resources that are not in the payload. If the saves do not support a plan, say so and name what is missing.",
        summary: "A four-week plan with one deliverable per week.",
        title: "Learning Path",
    },
    monthly_recap: {
        defaultCadence: "monthly",
        prompt: "Review the items saved in the last 30 days. Write a one-page recap with four parts: the 5 strongest saves and why they stood out; 3 themes that recur across the month; one number that describes the month (items saved, sources, or annotated saves); and one change to make next month. Link every item you name. If the month has too few items for a recap, say so with the count and stop. Do not present metrics without an interpretation.",
        summary:
            "The month's strongest saves, recurring themes, and one change for next month.",
        title: "Monthly Recap",
    },
    next_actions: {
        defaultCadence: "weekly",
        prompt: "Scan items saved in the last 14 days, including notes. Extract concrete next actions the saves imply: things to read, try, reply to, buy, book, or decide. Group by theme and rank by impact or urgency. For each action, name the item that prompted it and link to it. Return at most 8 actions. Skip vague intentions and anything already done. End with the one action to do first. If there are no real actions, say so.",
        summary:
            "Turn recent saves and notes into a ranked list of concrete next actions.",
        title: "Next Actions",
    },
    open_questions: {
        defaultCadence: "weekly",
        prompt: "Scan saves and notes from the last 30 days for unresolved questions: claims you saved but did not verify, decisions you deferred, and 'I should look into this' moments. Pick at most 5. For each, quote the source text that raises the question, state the question, why it matters, the item it came from with a link, and the smallest next step to answer it. Rank by how much the answer would change what you do. End with the one question to answer first. If there are no real open questions, say so.",
        summary:
            "Unresolved questions in your saves, ranked by what is worth answering first.",
        title: "Open Questions",
    },
    research_digest: {
        defaultCadence: "weekly",
        prompt: "Use the items available to this run, focusing on the last 30 days. Write a research digest with four sections: What is known (3-5 findings with the items behind them), What changed (what the newest saves add), What is contested or missing, and What to read next (at most 3 sources). Cite library items with links. Use web search only to fill a specific gap, and put outside sources in a separate labeled list. If the sample is partial, say so. If there is not enough material for a digest, say so and name the closest cluster.",
        summary:
            "What is known, what changed, what is contested, and what to read next.",
        title: "Research Digest",
    },
    story_follow_up: {
        defaultCadence: "weekly",
        prompt: "Pick one developing story or ongoing topic that appears in at least 2 saved items. Summarize what you saved about it, in order, with links. Then use web search to find what changed since the newest save. Write two clearly separate sections: 'From your library' and 'What changed outside'. Put at most 3 outside links, each labeled as not from your library. End with one thing to watch next. If you find no meaningful update, say so. If no story has enough saved material, say so.",
        summary:
            "What changed since you saved a developing story, with sources.",
        title: "Story Follow-up",
    },
    theme_thread: {
        defaultCadence: "weekly",
        prompt: "Find one specific theme that appears in at least 3 items saved in the last 60 days, from at least 2 sources or collections. Trace it: where it first appears, how it develops, and what the newest saves add. Use search to pull one older item that extends or challenges the theme. Cite at least 4 items with links. End with one claim or implication you can use. Avoid generic themes like 'AI' or 'productivity'; the theme must be specific enough to name in one sentence. If no theme has enough evidence, say so.",
        summary: "One specific theme traced across recent and older saves.",
        title: "Theme Thread",
    },
    unsorted_triage: {
        defaultCadence: "weekly",
        prompt: "Find items saved in the last 14 days that have no collection and no note. Pick at most 8. For each, recommend one existing collection to file it in, or say 'new collection' if none fits, and one next step: read, act, or archive. Group items that belong together. Link every item. End with the one item to file now. If everything is already sorted, say so. Recommend at most 2 new collections.",
        summary: "Group unsorted saves and propose where each one belongs.",
        title: "Unsorted Saves",
    },
    worth_revisiting: {
        defaultCadence: "weekly",
        prompt: "Find items saved more than 30 days ago that still deserve attention. Prefer unfinished, high-value, or easy-to-act-on saves. Pick at most 6. For each, explain why it is worth revisiting now and give one concrete next step, with a link. Skip anything that has clearly gone stale. End with the one item to revisit first. If the inspected sample does not reach items older than 30 days, say so and work with the oldest items you can see. If nothing is worth resurfacing, say so in one line.",
        summary:
            "Older saves that still deserve a second look, each with a next step.",
        title: "Worth Revisiting",
    },
} as const satisfies Record<
    AutomationTemplateKey,
    AutomationTemplateDefinition
>;

export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = (
    Object.entries(AUTOMATION_TEMPLATE_DEFINITIONS) as [
        AutomationTemplateKey,
        AutomationTemplateDefinition,
    ][]
).map(([templateKey, definition]) => ({ ...definition, templateKey }));
