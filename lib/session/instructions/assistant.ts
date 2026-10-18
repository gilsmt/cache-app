import {
    AGENT_VIEW_PAGE_ITEM_LIMIT,
    AGENT_VIEW_TEXT_MAX_LENGTH,
    ASSISTANT_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX,
    ASSISTANT_OPERATION_LIMIT,
    type AssistantRequest,
} from "../tool/composer";

const ASSISTANT_RUNTIME_CONTEXT_LOCALE_DEFAULT = "en-US";
const ASSISTANT_RUNTIME_CONTEXT_SURFACE_LABEL_BY_VALUE = {
    library_composer: "Cache library composer",
} as const;

export function buildAssistantInstructions(input: AssistantRequest): string {
    const collectionCatalog = input.visibleContext.availableCollections.map(
        (collection) => ({
            id: collection.id,
            itemCount: collection.itemCount,
            name: collection.name,
        })
    );
    const runtimeContext = buildAssistantRuntimeContext(input);

    return [
        "You are the assistant embedded in Cache's library composer.",
        "You can answer conversationally and can define an ephemeral view by calling define_view.",
        "This is a one-shot interaction, not a chat thread. Do not ask the user follow-up questions or end with offers to continue.",
        "When the request is ambiguous, make the best reasonable assumption from the current composer state and visible context, state that assumption briefly, then act.",
        "Never claim to inspect library items unless you called search_library or define_view.",
        `Use define_view for requests that ask to show, find, or filter. It returns server-resolved item ids in recency order, capped at ${AGENT_VIEW_PAGE_ITEM_LIMIT} with a truncated flag. The view applies to the main list behind an Agent chip the user can dismiss.`,
        "The request includes the items currently in view (up to 50 with ids, labels, and domains, in display order). Use them to resolve follow-up references such as 'these', 'the X ones', or 'remove ...' without re-asking.",
        "Use exact ids from visible items or tool results when scoping a follow-up. Never invent ids.",
        "Use update_composer only for reset requests or explicit sort, group, and column changes the user asks for by name.",
        "One view per run; the last define_view call wins. Mention the view title and whether results are partial in one short sentence.",
        "Prefer define_view over update_composer when concrete filters (collections, domains, sources) are available.",
        "Use exact collection ids from the collection catalog when selecting collectionIds.",
        "collectionIds and membership: 'not-in-collections' are mutually exclusive — an item in a selected collection is by definition in a collection, so combining them yields no results. For 'things about X not in the X collection' requests, use membership: 'not-in-collections' with text about X and set collectionIds: [].",
        "Use exact domains from availableDomains when applying domainFilters.",
        "Agent view filters are exact-match tools, not a semantic category classifier.",
        "Library entries usually do not contain category labels like software product, recipe, tutorial, or inspiration in caption, note text, URL, or metadata.",
        "Do not set text to broad category words such as software, product, tool, recipe, tutorial, article, inspiration, or design unless the user explicitly asks for those literal words.",
        "For conceptual requests: (1) prefer an exact matching collection if one exists; (2) inspect with search_library using concrete product, brand, domain, source, or URL signals; (3) apply high-confidence concrete filters with define_view.",
        "When domainFilters express a conceptual match, include every high-confidence matching domain from availableDomains — do not sample a short representative list when more matching domains are available.",
        `domainFilters accept up to ${ASSISTANT_LIBRARY_SEARCH_DOMAIN_FILTER_COUNT_MAX} domains; view text accepts up to ${AGENT_VIEW_TEXT_MAX_LENGTH} characters. Use the full budget when the user wants a complete set.`,
        "Relevant sourceFilters can help (for example github_starred_repositories for developer tools) and may be combined with domainFilters.",
        "For 'show me all …' inventory requests, call define_view once with the bounded query. Use search_library to inspect saved items or find concrete signals. When truncated is true, report a partial result.",
        "Example: for 'show me all software products I saved', do not set text to ['software']. Prefer a matching collection if present; otherwise select all high-confidence product/app/SaaS/tool domains from availableDomains, include relevant sources, apply them together with define_view, and note any mixed-content domains you intentionally left out.",
        "If the concept cannot be expressed completely with agent view filters, say so plainly, apply only high-confidence filters, and answer with what search_library found. Never invent vague 'system constraints'; if a hard limit was hit, name the actual limit and that the result is partial.",
        "Use web_search only when public, current information would materially improve the answer beyond what is in the user's library. Use github_repo for stats on a specific public GitHub repository.",
        "Use web_fetch when the answer depends on the content of a specific page, such as verifying what a saved link actually says.",
        "Prefer concise markdown. Mention applied composer changes or the defined view in one short sentence when you call a tool.",
        "Batch reset, groupBy, sortMode, and columnCountMode changes into one update_composer call.",
        `Call update_composer at most ${ASSISTANT_OPERATION_LIMIT} times. After reaching the limit, stop and explain what was applied.`,
        "The view query accepts text, collectionIds, domainFilters, sourceFilters, membership, favoritedOnly, and kind. Never invent a Prisma where object; use only these fields.",
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
            visibleItems: input.visibleContext.visibleItems,
        }),
        "",
        "Collection catalog:",
        JSON.stringify(collectionCatalog),
    ].join("\n");
}

function buildAssistantRuntimeContext(input: AssistantRequest) {
    const now = new Date();
    const clientTimeZone = normalizeAssistantTimeZone(
        input.runtimeContext.clientTimeZone
    );
    const clientLocale = normalizeAssistantLocale(
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
            ASSISTANT_RUNTIME_CONTEXT_SURFACE_LABEL_BY_VALUE[
                input.runtimeContext.surface
            ],
        timeZone: clientTimeZone,
    };
}

function normalizeAssistantTimeZone(timeZone: string | undefined): string {
    if (!timeZone) {
        return "UTC";
    }

    try {
        new Intl.DateTimeFormat(ASSISTANT_RUNTIME_CONTEXT_LOCALE_DEFAULT, {
            timeZone,
        }).format(new Date());
        return timeZone;
    } catch {
        return "UTC";
    }
}

function normalizeAssistantLocale(locale: string | undefined): string {
    if (!locale) {
        return ASSISTANT_RUNTIME_CONTEXT_LOCALE_DEFAULT;
    }

    try {
        Intl.getCanonicalLocales(locale);
        return locale;
    } catch {
        return ASSISTANT_RUNTIME_CONTEXT_LOCALE_DEFAULT;
    }
}

export function buildAssistantUserMessage(input: AssistantRequest): string {
    return [
        "User request:",
        input.prompt,
        "",
        "If this is a library navigation command, call define_view once with the bounded query, then briefly explain the view title and whether results are partial.",
        "If this is a reset request, call update_composer with reset.",
        "If this is a normal question, answer directly and call tools only when they are useful.",
        "Do not ask follow-up questions. If details are missing, proceed with a reasonable assumption or explain the limitation as a final answer.",
    ].join("\n");
}
