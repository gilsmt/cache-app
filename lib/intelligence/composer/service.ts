import "server-only";

import type { ArcjetNextRequest } from "@arcjet/next";
import { isStepCount, ToolLoopAgent } from "ai";
import { createLogger } from "@/lib/common/logs/console/logger";
import { EmptyGenerationOutputError, summarizeStepUsage } from "../classify";
import { type GenerationUsage, runModelChain } from "../generation";
import { normalizeGeneratedMarkdown } from "../markdown";
import { protectGenAiRequest } from "../protection";
import type { resolveRegisteredModel } from "../providers/model-resolver";
import { createAskCacheAgentTools } from "../tools/agent-tools";
import { estimateTokens } from "../usage";
import {
    ASK_CACHE_DOMAIN_FILTER_COUNT_MAX,
    ASK_CACHE_SEARCH_TERM_COUNT_MAX,
    type AskCacheComposerPatch,
    type AskCacheRequest,
} from "./ask-cache";

const ASK_CACHE_OUTPUT_TOKEN_LIMIT = 8192;
const ASK_CACHE_MAX_STEPS = 12;
const ASK_CACHE_TIMEOUT_MS = 60_000;
const ASK_CACHE_RUNTIME_CONTEXT_LOCALE_DEFAULT = "en-US";
const ASK_CACHE_RUNTIME_CONTEXT_SURFACE_LABEL_BY_VALUE = {
    library_composer: "Cache library composer",
} as const;

const log = createLogger("intelligence:ask-cache");

interface RunAskCacheAgentInput {
    input: AskCacheRequest;
    request: ArcjetNextRequest;
    userId: string;
}

interface RunAskCacheAgentResult {
    markdown: string;
    operations: AskCacheComposerPatch[];
    usage?: GenerationUsage;
}

export async function runAskCacheAgent({
    input,
    request,
    userId,
}: RunAskCacheAgentInput): Promise<RunAskCacheAgentResult> {
    const instructions = buildAskCacheInstructions(input);
    const userMessage = buildAskCacheUserMessage(input);

    await protectGenAiRequest({
        feature: "ask_cache_agent",
        request,
        requestedTokens: estimateTokens(
            `${instructions}\n\n${userMessage}`,
            ASK_CACHE_OUTPUT_TOKEN_LIMIT
        ),
        userId,
    });

    try {
        const result = await runModelChain(
            {
                defaultErrorMessage: "We couldn't ask Cache right now.",
                feature: "ask-cache-agent",
                logContext: { userId },
                operation: "runAskCacheAgent",
            },
            (model) =>
                runAskCacheAgentModel({
                    input,
                    instructions,
                    model,
                    userId,
                    userMessage,
                })
        );
        return {
            markdown: result.output.markdown,
            operations: result.output.operations,
            usage: result.usage,
        };
    } catch (error) {
        log.error("Ask Cache agent run failed", {
            errorMessage:
                error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : undefined,
            userId,
        });
        throw error;
    }
}

async function runAskCacheAgentModel(args: {
    input: AskCacheRequest;
    instructions: string;
    model: Awaited<ReturnType<typeof resolveRegisteredModel>>;
    userMessage: string;
    userId: string;
}): Promise<{
    output: { markdown: string; operations: AskCacheComposerPatch[] };
    usage?: GenerationUsage;
}> {
    const { getOperations, getOperationSummaries, tools } =
        createAskCacheAgentTools({
            input: args.input,
            userId: args.userId,
        });

    const agent = new ToolLoopAgent({
        instructions: args.instructions,
        maxOutputTokens: ASK_CACHE_OUTPUT_TOKEN_LIMIT,
        model: args.model,
        stopWhen: isStepCount(ASK_CACHE_MAX_STEPS),
        tools,
    });

    const result = await agent.generate({
        messages: [{ content: args.userMessage, role: "user" }],
        timeout: ASK_CACHE_TIMEOUT_MS,
    });

    const markdown = getFinalMarkdown(result.steps, getOperationSummaries());
    if (!markdown) {
        throw new EmptyGenerationOutputError();
    }

    return {
        output: { markdown, operations: getOperations() },
        usage: summarizeStepUsage(result.steps),
    };
}

function buildAskCacheInstructions(input: AskCacheRequest): string {
    const collectionCatalog = input.visibleContext.availableCollections.map(
        (collection) => ({
            id: collection.id,
            itemCount: collection.itemCount,
            name: collection.name,
        })
    );
    const runtimeContext = buildAskCacheRuntimeContext(input);

    return [
        "You are Ask Cache, an assistant embedded in Cache's library composer.",
        "You can answer conversationally and can update the composer by calling update_composer.",
        "This is a one-shot interaction, not a chat thread. Do not ask the user follow-up questions or end with offers to continue.",
        "When the request is ambiguous, make the best reasonable assumption from the current composer state and visible context, state that assumption briefly, then act.",
        "Never claim to inspect library items unless you called search_library.",
        "Use update_composer for requests that ask to show, find, filter, sort, group, or reset.",
        "Prefer update_composer over setting searchTerms alone when concrete filters (collections, domains, sources) are available.",
        "Use exact collection ids from the collection catalog when selecting collection filters.",
        "selectedCollectionIds and collectionMembershipFilter: 'not-in-collections' are mutually exclusive — an item in a selected collection is by definition in a collection, so combining them always yields zero results. For 'things about X not in the X collection' requests, use collectionMembershipFilter: 'not-in-collections' with searchTerms about X, and set selectedCollectionIds: [] (omit only when none are already selected).",
        "Use exact domains from availableDomains when applying domainFilters.",
        "Composer filters are exact-match tools, not a semantic category classifier.",
        "Library entries usually do not contain category labels like software product, recipe, tutorial, or inspiration in caption, note text, URL, or metadata.",
        "Do not set searchTerms to broad category words such as software, product, tool, recipe, tutorial, article, inspiration, or design unless the user explicitly asks for those literal words.",
        "For conceptual requests: (1) prefer an exact matching collection if one exists; (2) inspect with search_library using concrete product, brand, domain, source, or URL signals; (3) apply high-confidence concrete filters.",
        "When domainFilters express a conceptual match, include every high-confidence matching domain from availableDomains — do not sample a short representative list when more matching domains are available.",
        `domainFilters accept up to ${ASK_CACHE_DOMAIN_FILTER_COUNT_MAX} domains; searchTerms accept up to ${ASK_CACHE_SEARCH_TERM_COUNT_MAX} terms. Use the full budget when the user wants a complete set.`,
        "Relevant sourceFilters can help (for example github_starred_repositories for developer tools) and may be combined with domainFilters.",
        "For 'show me all …' inventory requests, call search_library first (page with offset while truncated is true when needed), then update_composer when a useful filter exists.",
        "Example: for 'show me all software products I saved', do not set searchTerms to ['software']. Prefer a matching collection if present; otherwise select all high-confidence product/app/SaaS/tool domains from availableDomains, include relevant sources, apply them together, and note any mixed-content domains you intentionally left out.",
        "If the concept cannot be expressed completely with composer filters, say so plainly, apply only high-confidence filters, and answer with what search_library found. Never invent vague 'system constraints'; if a hard limit was hit, name the actual limit and that the result is partial.",
        "Use web_search only when public, current information would materially improve the answer beyond what is in the user's library. Use github_repo for stats on a specific public GitHub repository.",
        "Prefer concise markdown. Mention applied composer changes in one short sentence when you call update_composer.",
        "Batch multiple composer changes into one update_composer call. The patch accepts searchTerms, sourceFilters, domainFilters, selectedCollectionIds, collectionMembershipFilter, groupBy, sortMode, columnCountMode, and reset all at once.",
        "Call update_composer at most 8 times. After reaching the limit, stop and explain what was applied.",
        "Do not mutate saved items, collections, notes, or external services.",
        "",
        "Runtime context:",
        JSON.stringify(runtimeContext),
        "",
        "Current composer state:",
        JSON.stringify(input.composerState),
        "",
        "Visible context:",
        JSON.stringify({
            availableDomains: input.visibleContext.availableDomains,
            filteredItemCount: input.visibleContext.filteredItemCount,
            totalItemCount: input.visibleContext.totalItemCount,
        }),
        "",
        "Collection catalog:",
        JSON.stringify(collectionCatalog),
    ].join("\n");
}

function buildAskCacheRuntimeContext(input: AskCacheRequest) {
    const now = new Date();
    const clientTimeZone = normalizeAskCacheTimeZone(
        input.runtimeContext.clientTimeZone
    );
    const clientLocale = normalizeAskCacheLocale(
        input.runtimeContext.clientLocale
    );
    const formatter = new Intl.DateTimeFormat(clientLocale, {
        dateStyle: "full",
        timeStyle: "short",
        timeZone: clientTimeZone,
    });

    return {
        app: "Cache",
        currentDateTime: formatter.format(now),
        currentIsoDateTime: now.toISOString(),
        surface:
            ASK_CACHE_RUNTIME_CONTEXT_SURFACE_LABEL_BY_VALUE[
                input.runtimeContext.surface
            ],
        timeZone: clientTimeZone,
    };
}

function normalizeAskCacheTimeZone(timeZone: string | undefined): string {
    if (!timeZone) {
        return "UTC";
    }

    try {
        new Intl.DateTimeFormat(ASK_CACHE_RUNTIME_CONTEXT_LOCALE_DEFAULT, {
            timeZone,
        }).format(new Date());
        return timeZone;
    } catch {
        return "UTC";
    }
}

function normalizeAskCacheLocale(locale: string | undefined): string {
    if (!locale) {
        return ASK_CACHE_RUNTIME_CONTEXT_LOCALE_DEFAULT;
    }

    try {
        Intl.getCanonicalLocales(locale);
        return locale;
    } catch {
        return ASK_CACHE_RUNTIME_CONTEXT_LOCALE_DEFAULT;
    }
}

function buildAskCacheUserMessage(input: AskCacheRequest): string {
    return [
        "User request:",
        input.prompt,
        "",
        "If this is a library navigation command, call update_composer once with all state changes batched together, then briefly explain what changed.",
        "If this is a normal question, answer directly and call tools only when they are useful.",
        "Do not ask follow-up questions. If details are missing, proceed with a reasonable assumption or explain the limitation as a final answer.",
    ].join("\n");
}

/**
 * Recovers the final markdown from an agent run: the last non-empty step,
 * then aggregated step text, then operation summaries. Each candidate is
 * normalized before acceptance because providers occasionally wrap the
 * response in a JSON envelope.
 */
function getFinalMarkdown(
    steps: Array<{ text: string }>,
    operationSummaries: string[]
): string | null {
    const lastStepText = steps.findLast((step) => step.text.trim())?.text;
    const aggregatedStepText = steps
        .map((step) => step.text.trim())
        .filter((text) => text.length > 0)
        .join("\n");
    const summaryText =
        operationSummaries.length > 0
            ? operationSummaries.join("\n")
            : undefined;

    for (const candidate of [lastStepText, aggregatedStepText, summaryText]) {
        const normalized = normalizeGeneratedMarkdown(candidate);
        if (normalized) {
            return normalized;
        }
    }

    return null;
}
