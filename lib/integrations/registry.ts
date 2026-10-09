/**
 * Server-safe integration registry
 *
 * Presentation (icons, labels) lives in `resolver.ts`, which resolves them
 * from these definitions by ID.
 *
 * OAuth `linked-provider` signals reference better-auth provider IDs
 * (`lib/auth/server.ts`), which do not always equal the integration ID
 * (e.g. `google-photos` listens on provider `google`). Keep both sides
 * aligned when adding OAuth integrations, and treat a shipped
 * integration ID as immutable.
 */
import { CACHE_EXTENSION_DOWNLOAD_URL } from "@/lib/common/constants";
import { LibraryItemSource } from "@/prisma/client/enums";

export type IntegrationDirection = "destination" | "source";

export type IntegrationActionRole =
    | "connect"
    | "copy"
    | "import"
    | "open"
    | "sync";

export type IntegrationConnectionSignal =
    | {
          kind: "library-item-source";
          source: LibraryItemSource;
      }
    | {
          kind: "linked-provider";
          providerId: string;
      };

export interface IntegrationDirectionDefinition {
    /** Any-of: connected when at least one signal matches. */
    connectedWhen: readonly IntegrationConnectionSignal[];
}

export interface IntegrationSourceDefinition
    extends IntegrationDirectionDefinition {
    libraryItemSources: readonly LibraryItemSource[];
    syncable: boolean;
}

export interface IntegrationDestinationDefinition
    extends IntegrationDirectionDefinition {}

export interface SupportedIntegrationAction {
    for: IntegrationDirection;
    label?: string;
    role: IntegrationActionRole;
    visibleWhen?: "always" | "connected" | "disconnected";
}

export interface ExtensionOpenBehavior {
    /**
     * When true and the extension is installed, opening triggers the extension
     * to navigate to `openURL` in a new tab and automatically start a sync
     * for that source once the page is ready. Without this, opens just
     * navigate the user to the URL.
     */
    autoSync?: boolean;
    installURL: string;
    kind: "extension-entry";
    openURL: string;
    role: "open";
}

export interface OAuthLinkConnectBehavior {
    callbackURL: string;
    errorCallbackURL: string;
    kind: "oauth-link";
    providerId: string;
    role: "connect";
}

export interface SocialSignInConnectBehavior {
    callbackURL: string;
    errorCallbackURL: string;
    kind: "social-sign-in";
    provider: string;
    role: "connect";
}

export interface RssManageConnectBehavior {
    kind: "rss-manage";
    role: "connect";
}

export interface RouteSyncBehavior {
    errorMessage: string;
    kind: "route";
    method: "POST";
    path: string;
    role: "sync";
    successKey: string;
    successMessage?: (payload: Record<string, unknown>) => string | null;
}

export interface GooglePhotosPickerSyncBehavior {
    kind: "google-photos-picker";
    role: "sync";
}

export interface CopyPromptBehavior {
    kind: "copy-prompt";
    path: string;
    role: "copy";
}

export interface MarkdownImportBehavior {
    kind: "markdown-import";
    role: "import";
}

export type IntegrationBehavior =
    | OAuthLinkConnectBehavior
    | RssManageConnectBehavior
    | SocialSignInConnectBehavior
    | CopyPromptBehavior
    | MarkdownImportBehavior
    | ExtensionOpenBehavior
    | GooglePhotosPickerSyncBehavior
    | RouteSyncBehavior;

export interface IntegrationDefinition {
    actions: readonly SupportedIntegrationAction[];
    /**
     * At most one behavior per action role. Each
     * behavior declares the role it serves, so lookup needs no table:
     * match `behavior.role` against the action role.
     */
    behaviors: readonly IntegrationBehavior[];
    description: string;
    destination?: IntegrationDestinationDefinition;
    hint: string;
    hintImage?: string;
    id: string;
    label: string;
    source?: IntegrationSourceDefinition;
}

export interface IntegrationConnectionContext {
    libraryItemSources: Iterable<LibraryItemSource>;
    linkedProviderIds: Iterable<string>;
}

const LIBRARY_CALLBACK_URL = "/library";

function formatImportedCountMessage(
    payload: Record<string, unknown>,
    noun: string,
    plural?: string
): string | null {
    const { importedCount } = payload;
    if (typeof importedCount !== "number") {
        return null;
    }
    const base = `Imported ${importedCount} ${
        importedCount === 1 ? noun : (plural ?? `${noun}s`)
    }.`;
    const notices: string[] = [];
    if (payload.truncated === true) {
        notices.push("Some items couldn't be fetched this run.");
    }
    if (payload.pruneAborted === true) {
        notices.push("Some deletions were held for safety.");
    }
    if (notices.length === 0) {
        return base;
    }
    return `${base} ${notices.join(" ")}`;
}

/**
 * Array order is display order (landing slices, list rendering): append
 * new entries at the end unless placement is deliberate.
 */
export const INTEGRATION_DEFINITIONS = [
    {
        actions: [
            {
                for: "source",
                role: "connect",
            },
            {
                for: "source",
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        behaviors: [
            {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "oauth-link",
                providerId: "x",
                role: "connect",
            },
            {
                errorMessage: "Could not import bookmarks from X.",
                kind: "route",
                method: "POST",
                path: "/api/integrations/x/import",
                role: "sync",
                successKey: "importedCount",
                successMessage: (payload) =>
                    formatImportedCountMessage(payload, "bookmark"),
            },
        ],
        description: "Posts you save to Bookmarks",
        hint: "Import your X Bookmarks into Cache.",
        id: "x",
        label: "X",
        source: {
            connectedWhen: [
                {
                    kind: "linked-provider",
                    providerId: "x",
                },
            ],
            libraryItemSources: [LibraryItemSource.x_bookmarks],
            syncable: true,
        },
    },
    {
        actions: [
            {
                for: "source",
                role: "open",
            },
        ],
        behaviors: [
            {
                installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                kind: "extension-entry",
                openURL: CACHE_EXTENSION_DOWNLOAD_URL,
                role: "open",
            },
        ],
        description: "Bookmarks you save in your browser",
        hint: 'Open the Cache extension popup and mark "Sync" under Browser bookmarks.',
        id: "chrome",
        label: "Chrome",
        source: {
            connectedWhen: [
                {
                    kind: "library-item-source",
                    source: LibraryItemSource.chrome_bookmarks,
                },
            ],
            libraryItemSources: [LibraryItemSource.chrome_bookmarks],
            syncable: true,
        },
    },
    {
        actions: [
            {
                for: "source",
                role: "open",
            },
        ],
        behaviors: [
            {
                autoSync: true,
                installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                kind: "extension-entry",
                openURL: "https://www.youtube.com/playlist?list=WL",
                role: "open",
            },
        ],
        description: "Videos you save to playlists",
        hint: 'Go to your Watch Later playlist, open the Cache extension popup, and press "Import page" to import the videos.',
        id: "youtube",
        label: "YouTube",
        source: {
            connectedWhen: [
                {
                    kind: "library-item-source",
                    source: LibraryItemSource.youtube_watch_later,
                },
            ],
            libraryItemSources: [LibraryItemSource.youtube_watch_later],
            syncable: true,
        },
    },
    {
        actions: [
            {
                for: "source",
                role: "open",
            },
        ],
        behaviors: [
            {
                autoSync: true,
                installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                kind: "extension-entry",
                openURL: "https://www.instagram.com/explore/saved/",
                role: "open",
            },
        ],
        description: "Posts you save to Favorites",
        hint: 'Go to your saved posts, open the Cache extension popup, and press "Import page" to import them.',
        id: "instagram",
        label: "Instagram",
        source: {
            connectedWhen: [
                {
                    kind: "library-item-source",
                    source: LibraryItemSource.instagram,
                },
            ],
            libraryItemSources: [LibraryItemSource.instagram],
            syncable: true,
        },
    },
    {
        actions: [
            {
                for: "source",
                role: "open",
            },
        ],
        behaviors: [
            {
                autoSync: true,
                installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                kind: "extension-entry",
                openURL: "https://www.tiktok.com/profile",
                role: "open",
            },
        ],
        description: "Videos you save to Favorites",
        hint: 'Go to your favorites, open the Cache extension popup, and press "Import page" to import them.',
        id: "tiktok",
        label: "TikTok",
        source: {
            connectedWhen: [
                {
                    kind: "library-item-source",
                    source: LibraryItemSource.tiktok,
                },
            ],
            libraryItemSources: [LibraryItemSource.tiktok],
            syncable: true,
        },
    },
    {
        actions: [
            {
                for: "source",
                role: "connect",
                visibleWhen: "disconnected",
            },
            {
                for: "source",
                label: "Open",
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        behaviors: [
            {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "social-sign-in",
                provider: "google",
                role: "connect",
            },
            {
                kind: "google-photos-picker",
                role: "sync",
            },
        ],
        description: "Photos and albums you star",
        hint: "Import your favorite photos and albums from Google Photos.",
        id: "google-photos",
        label: "Google Photos",
        source: {
            connectedWhen: [
                {
                    kind: "linked-provider",
                    providerId: "google",
                },
            ],
            libraryItemSources: [LibraryItemSource.google_photos],
            syncable: true,
        },
    },
    {
        actions: [
            {
                for: "source",
                role: "connect",
            },
            {
                for: "source",
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        behaviors: [
            {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "oauth-link",
                providerId: "pinterest",
                role: "connect",
            },
            {
                errorMessage: "Could not import pins from Pinterest.",
                kind: "route",
                method: "POST",
                path: "/api/integrations/pinterest/import",
                role: "sync",
                successKey: "importedCount",
                successMessage: (payload) =>
                    formatImportedCountMessage(payload, "pin"),
            },
        ],
        description: "Pins you save to boards",
        hint: "Import pins from your Pinterest boards.",
        id: "pinterest",
        label: "Pinterest",
        source: {
            connectedWhen: [
                {
                    kind: "linked-provider",
                    providerId: "pinterest",
                },
            ],
            libraryItemSources: [LibraryItemSource.pinterest],
            syncable: true,
        },
    },
    {
        actions: [
            {
                for: "source",
                role: "connect",
            },
            {
                for: "source",
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        behaviors: [
            {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "oauth-link",
                providerId: "reddit",
                role: "connect",
            },
            {
                errorMessage: "Could not import saved posts from Reddit.",
                kind: "route",
                method: "POST",
                path: "/api/integrations/reddit/import",
                role: "sync",
                successKey: "importedCount",
                successMessage: (payload) =>
                    formatImportedCountMessage(payload, "saved item"),
            },
        ],
        description: "Posts and comments you save",
        hint: "Import posts and comments you saved on Reddit. Reddit only serves about the 1,000 most recent saves, so older ones are never fetched.",
        id: "reddit",
        label: "Reddit",
        source: {
            connectedWhen: [
                {
                    kind: "linked-provider",
                    providerId: "reddit",
                },
            ],
            libraryItemSources: [LibraryItemSource.reddit_saved],
            syncable: true,
        },
    },
    {
        actions: [
            {
                for: "source",
                role: "connect",
            },
            {
                for: "source",
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        behaviors: [
            {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "oauth-link",
                providerId: "github",
                role: "connect",
            },
            {
                errorMessage:
                    "Could not import starred repositories from GitHub.",
                kind: "route",
                method: "POST",
                path: "/api/integrations/github/import",
                role: "sync",
                successKey: "importedCount",
                successMessage: (payload) =>
                    formatImportedCountMessage(
                        payload,
                        "repository",
                        "repositories"
                    ),
            },
        ],
        description: "Repositories you star",
        hint: "Import repositories you've starred on GitHub.",
        id: "github",
        label: "GitHub",
        source: {
            connectedWhen: [
                {
                    kind: "linked-provider",
                    providerId: "github",
                },
            ],
            libraryItemSources: [LibraryItemSource.github_starred_repositories],
            syncable: true,
        },
    },
    {
        actions: [
            {
                for: "destination",
                role: "connect",
            },
        ],
        behaviors: [
            {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "oauth-link",
                providerId: "notion",
                role: "connect",
            },
        ],
        description: "Pages you export from Cache",
        destination: {
            connectedWhen: [
                {
                    kind: "linked-provider",
                    providerId: "notion",
                },
            ],
        },
        hint: "Connect Notion to send Cache notes and collections into your workspace.",
        id: "notion",
        label: "Notion",
    },
    {
        actions: [
            {
                for: "source",
                label: "Add feed",
                role: "connect",
                visibleWhen: "disconnected",
            },
            {
                for: "source",
                label: "Manage",
                role: "connect",
                visibleWhen: "connected",
            },
            {
                for: "source",
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        behaviors: [
            {
                kind: "rss-manage",
                role: "connect",
            },
            {
                errorMessage: "Could not refresh RSS feeds.",
                kind: "route",
                method: "POST",
                path: "/api/integrations/rss/check",
                role: "sync",
                successKey: "importedCount",
                successMessage: (payload) =>
                    formatImportedCountMessage(payload, "entry", "entries"),
            },
        ],
        description: "Feeds you follow",
        hint: "Add RSS feeds to import new entries into your library automatically.",
        id: "rss",
        label: "RSS",
        source: {
            connectedWhen: [
                {
                    kind: "library-item-source",
                    source: LibraryItemSource.rss_feed,
                },
            ],
            libraryItemSources: [LibraryItemSource.rss_feed],
            syncable: true,
        },
    },
    {
        actions: [
            {
                for: "destination",
                label: "Copy setup prompt",
                role: "copy",
            },
        ],
        behaviors: [
            {
                kind: "copy-prompt",
                path: "/mcp/prompt",
                role: "copy",
            },
        ],
        description: "Agent access to your library",
        hint: "Give AI agents access to your library via the Model Context Protocol.",
        id: "mcp",
        label: "MCP",
    },
    {
        actions: [
            {
                for: "source",
                label: "Import",
                role: "import",
                visibleWhen: "always",
            },
        ],
        behaviors: [
            {
                kind: "markdown-import",
                role: "import",
            },
        ],
        description: "Markdown files on your computer",
        hint: "Import Markdown files from Obsidian, Bear, Apple Notes exports, or hand-authored folders on your computer.",
        id: "markdown",
        label: "Markdown",
        source: {
            connectedWhen: [
                {
                    kind: "library-item-source",
                    source: LibraryItemSource.markdown_import,
                },
            ],
            libraryItemSources: [LibraryItemSource.markdown_import],
            syncable: false,
        },
    },
] as const satisfies readonly IntegrationDefinition[];

export type IntegrationId = (typeof INTEGRATION_DEFINITIONS)[number]["id"];

/**
 * Precise registry element: same shape as `IntegrationDefinition` but
 * with the literal `id` union, so `id` never widens to `string` at
 * component boundaries. Use this in signatures; use
 * `IntegrationDefinition` only as the `satisfies` constraint and for
 * internals that must accept any entry shape.
 */
export interface Integration extends IntegrationDefinition {
    id: IntegrationId;
}

const INTEGRATION_ID_SET: ReadonlySet<string> = new Set(
    INTEGRATION_DEFINITIONS.map((definition) => definition.id)
);

export function isIntegrationId(value: unknown): value is IntegrationId {
    return typeof value === "string" && INTEGRATION_ID_SET.has(value);
}

export function assertIntegrationId(value: unknown): IntegrationId {
    if (!isIntegrationId(value)) {
        throw new TypeError(
            `Expected IntegrationId, received: ${String(value)}`
        );
    }
    return value;
}

export function integrationIds(): IntegrationId[] {
    return INTEGRATION_DEFINITIONS.map((definition) => definition.id);
}

export function findBehaviorForRole(
    integration: Integration,
    role: IntegrationActionRole
): IntegrationBehavior | undefined {
    return integration.behaviors.find((behavior) => behavior.role === role);
}

export function filterToIntegrationIds(values: string[]): IntegrationId[] {
    return values.filter(isIntegrationId);
}

export function recordHasIntegrationId<K extends string>(
    record: Record<K, unknown>,
    key: K
): record is Record<K, IntegrationId> & typeof record {
    return isIntegrationId(record[key]);
}

function listDirectionDefinitions(
    definition: IntegrationDefinition
): IntegrationDirectionDefinition[] {
    const definitions: IntegrationDirectionDefinition[] = [];
    if (definition.source) {
        definitions.push(definition.source);
    }
    if (definition.destination) {
        definitions.push(definition.destination);
    }
    return definitions;
}

const INTEGRATION_ACCOUNT_PROVIDER_IDS: readonly Extract<
    IntegrationConnectionSignal,
    { kind: "linked-provider" }
>["providerId"][] = Array.from(
    new Set(
        INTEGRATION_DEFINITIONS.flatMap((definition) =>
            listDirectionDefinitions(definition).flatMap((direction) =>
                direction.connectedWhen.flatMap((signal) =>
                    signal.kind === "linked-provider" ? [signal.providerId] : []
                )
            )
        )
    )
);

export function listIntegrationAccountProviderIds(): string[] {
    return [...INTEGRATION_ACCOUNT_PROVIDER_IDS];
}

const INTEGRATION_BY_ID = new Map<IntegrationId, Integration>(
    INTEGRATION_DEFINITIONS.map((item) => [item.id, item])
);

function getDirectionDefinition(
    definition: IntegrationDefinition,
    direction: IntegrationDirection
): IntegrationDestinationDefinition | IntegrationSourceDefinition | undefined {
    return direction === "source" ? definition.source : definition.destination;
}

function buildConnectionSets(context: IntegrationConnectionContext): {
    libraryItemSources: Set<LibraryItemSource>;
    linkedProviderIds: Set<string>;
} {
    return {
        libraryItemSources:
            context.libraryItemSources instanceof Set
                ? context.libraryItemSources
                : new Set(context.libraryItemSources),
        linkedProviderIds:
            context.linkedProviderIds instanceof Set
                ? context.linkedProviderIds
                : new Set(context.linkedProviderIds),
    };
}

function integrationMatchesSignal(
    signal: IntegrationConnectionSignal,
    context: {
        libraryItemSources: Set<LibraryItemSource>;
        linkedProviderIds: Set<string>;
    }
): boolean {
    if (signal.kind === "library-item-source") {
        return context.libraryItemSources.has(signal.source);
    }

    return context.linkedProviderIds.has(signal.providerId);
}

export function getIntegration(id: IntegrationId): Integration {
    const row = INTEGRATION_BY_ID.get(id);
    if (!row) {
        throw new TypeError(`Missing integration definition for id: ${id}`);
    }
    return row;
}

export function findIntegrationById(value: unknown): Integration | undefined {
    if (!isIntegrationId(value)) {
        return;
    }
    return INTEGRATION_BY_ID.get(value);
}

export function listIntegrations(
    predicate?: (item: Integration) => boolean
): Integration[] {
    return predicate
        ? INTEGRATION_DEFINITIONS.filter(predicate)
        : [...INTEGRATION_DEFINITIONS];
}

export function listIntegrationActions(
    id: IntegrationId,
    direction: IntegrationDirection
): SupportedIntegrationAction[] {
    return getIntegration(id).actions.filter(
        (action) => action.for === direction
    );
}

export function integrationSupportsDirection(
    id: IntegrationId,
    direction: IntegrationDirection
): boolean {
    return getDirectionDefinition(getIntegration(id), direction) !== undefined;
}

export function listSyncableIntegrations(): Integration[] {
    return INTEGRATION_DEFINITIONS.filter(
        (item: IntegrationDefinition) => !!item.source?.syncable
    );
}

export function integrationOwnsLibraryItemSource(
    id: IntegrationId,
    source: LibraryItemSource
): boolean {
    const integration: IntegrationDefinition = getIntegration(id);
    const definition = integration.source;
    if (!definition) {
        return false;
    }
    return definition.libraryItemSources.includes(source);
}

export function isIntegrationConnected(
    id: IntegrationId,
    direction: IntegrationDirection,
    context: IntegrationConnectionContext
): boolean {
    const definition = getDirectionDefinition(getIntegration(id), direction);
    if (!definition) {
        return false;
    }

    const sets = buildConnectionSets(context);
    return definition.connectedWhen.some((signal) =>
        integrationMatchesSignal(signal, sets)
    );
}

export function listConnectedIntegrationIds(
    direction: IntegrationDirection,
    context: IntegrationConnectionContext
): IntegrationId[] {
    const sets = buildConnectionSets(context);
    return listIntegrations()
        .filter((integration) => {
            const definition = getDirectionDefinition(integration, direction);
            return (
                definition?.connectedWhen.some((signal) =>
                    integrationMatchesSignal(signal, sets)
                ) ?? false
            );
        })
        .map((integration) => integration.id);
}
