/**
 * Server-safe integration registry
 *
 * Presentation (icons, labels) lives in `resolver.ts`, which resolves them
 * from these definitions by ID.
 *
 * Each definition states one `direction`, the `actions` a user can trigger
 * in that direction, and the `connectedWhen` signals that tell whether the
 * user has a live connection. A signal reads the record that owns the
 * connection: a linked provider account, an `RssFeed`, a `MarkdownImport`.
 * The extension-pushed sources have no record of their own, so they are
 * connected while they hold imported items.
 *
 * OAuth `linked-provider` signals reference better-auth provider IDs
 * (`lib/auth/server.ts`), which do not always equal the integration ID
 * (e.g. `google-photos` listens on provider `google`). `lib/auth/server.ts`
 * asserts both sides agree at boot, and `registry.test.ts` asserts the
 * registry agrees with itself. Treat a shipped integration ID as immutable.
 */
import { msg } from "gt-next";

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
      }
    | {
          kind: "markdown-import";
      }
    | {
          kind: "rss-feed";
      };

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
}

export interface OAuthLinkConnectBehavior {
    callbackURL: string;
    errorCallbackURL: string;
    kind: "oauth-link";
    providerId: string;
}

export interface SocialSignInConnectBehavior {
    callbackURL: string;
    errorCallbackURL: string;
    kind: "social-sign-in";
    provider: string;
}

export interface RssManageConnectBehavior {
    kind: "rss-manage";
}

interface SyncBehaviorBase {
    /**
     * Optional notice shown when the run reports partial failures. The
     * route reports them in an `errors` array.
     */
    failureMessage?: string;
    /**
     * ICU template rendered with the imported count, for example
     * `"Imported {count, plural, one {# pin} other {# pins}}."`.
     */
    successMessage: string;
}

export interface RouteSyncBehavior extends SyncBehaviorBase {
    errorMessage: string;
    kind: "route";
    method: "POST";
    path: string;
}

export interface GooglePhotosPickerSyncBehavior extends SyncBehaviorBase {
    kind: "google-photos-picker";
}

export interface CopyPromptBehavior {
    kind: "copy-prompt";
    path: string;
}

export interface MarkdownImportBehavior {
    kind: "markdown-import";
}

export type IntegrationBehavior =
    | CopyPromptBehavior
    | ExtensionOpenBehavior
    | GooglePhotosPickerSyncBehavior
    | MarkdownImportBehavior
    | OAuthLinkConnectBehavior
    | RssManageConnectBehavior
    | RouteSyncBehavior
    | SocialSignInConnectBehavior;

/**
 * Behavior kinds that can serve each action role. The mapping is total, so
 * a behavior never repeats the role it already implies.
 */
interface IntegrationBehaviorKindByRole {
    connect: "oauth-link" | "rss-manage" | "social-sign-in";
    copy: "copy-prompt";
    import: "markdown-import";
    open: "extension-entry";
    sync: "google-photos-picker" | "route";
}

type IntegrationBehaviorForRole<TRole extends IntegrationActionRole> = Extract<
    IntegrationBehavior,
    { kind: IntegrationBehaviorKindByRole[TRole] }
>;

/**
 * One user-triggerable action. The behavior travels with the action, so an
 * action without an executable behavior is not representable.
 */
export type IntegrationAction = {
    [TRole in IntegrationActionRole]: {
        behavior: IntegrationBehaviorForRole<TRole>;
        label?: string;
        role: TRole;
        visibleWhen?: "always" | "connected" | "disconnected";
    };
}[IntegrationActionRole];

export interface IntegrationDefinition {
    actions: readonly IntegrationAction[];
    /**
     * Any-of: connected when at least one signal matches. An empty list
     * means the integration never holds a connection.
     */
    connectedWhen: readonly IntegrationConnectionSignal[];
    description: string;
    direction: IntegrationDirection;
    hint: string;
    hintImage?: string;
    id: string;
    label: string;
    libraryItemSources: readonly LibraryItemSource[];
    /**
     * The source can be synced, either through a sync action or through the
     * browser extension.
     */
    syncable: boolean;
}

export interface IntegrationConnectionContext {
    hasMarkdownImports: boolean;
    hasRssFeeds: boolean;
    libraryItemSources: Iterable<LibraryItemSource>;
    linkedProviderIds: Iterable<string>;
}

const LIBRARY_CALLBACK_URL = "/library";

/**
 * Notices appended to a sync result. They are shared because they describe
 * the import pipeline, not the provider.
 */
export const SYNC_NOTICE_MESSAGES = {
    pruneAborted: msg("Some deletions were held for safety."),
    truncated: msg("Some items couldn't be fetched this run."),
} as const;

/**
 * Array order is display order (landing slices, list rendering): append
 * new entries at the end unless placement is deliberate.
 */
export const INTEGRATION_DEFINITIONS = [
    {
        actions: [
            {
                behavior: {
                    callbackURL: LIBRARY_CALLBACK_URL,
                    errorCallbackURL: LIBRARY_CALLBACK_URL,
                    kind: "oauth-link",
                    providerId: "x",
                },
                role: "connect",
            },
            {
                behavior: {
                    errorMessage: msg("Could not import bookmarks from X."),
                    kind: "route",
                    method: "POST",
                    path: "/api/integrations/x/import",
                    successMessage: msg(
                        "Imported {count, plural, one {# bookmark} other {# bookmarks}}."
                    ),
                },
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        connectedWhen: [
            {
                kind: "linked-provider",
                providerId: "x",
            },
        ],
        description: msg("Posts you save to Bookmarks"),
        direction: "source",
        hint: msg("Import your X Bookmarks into Cache."),
        id: "x",
        label: "X",
        libraryItemSources: [LibraryItemSource.x_bookmarks],
        syncable: true,
    },
    {
        actions: [
            {
                behavior: {
                    installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                    kind: "extension-entry",
                    openURL: CACHE_EXTENSION_DOWNLOAD_URL,
                },
                role: "open",
            },
        ],
        connectedWhen: [
            {
                kind: "library-item-source",
                source: LibraryItemSource.chrome_bookmarks,
            },
        ],
        description: msg("Bookmarks you save in your browser"),
        direction: "source",
        hint: msg(
            'Open the Cache extension popup and mark "Sync" under Browser bookmarks.'
        ),
        id: "chrome",
        label: "Chrome",
        libraryItemSources: [LibraryItemSource.chrome_bookmarks],
        syncable: true,
    },
    {
        actions: [
            {
                behavior: {
                    autoSync: true,
                    installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                    kind: "extension-entry",
                    openURL: "https://www.youtube.com/playlist?list=WL",
                },
                role: "open",
            },
        ],
        connectedWhen: [
            {
                kind: "library-item-source",
                source: LibraryItemSource.youtube_watch_later,
            },
        ],
        description: msg("Videos you save to playlists"),
        direction: "source",
        hint: msg(
            'Go to your Watch Later playlist, open the Cache extension popup, and press "Import page" to import the videos.'
        ),
        id: "youtube",
        label: "YouTube",
        libraryItemSources: [LibraryItemSource.youtube_watch_later],
        syncable: true,
    },
    {
        actions: [
            {
                behavior: {
                    autoSync: true,
                    installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                    kind: "extension-entry",
                    openURL: "https://www.instagram.com/explore/saved/",
                },
                role: "open",
            },
        ],
        connectedWhen: [
            {
                kind: "library-item-source",
                source: LibraryItemSource.instagram,
            },
        ],
        description: msg("Posts you save to Favorites"),
        direction: "source",
        hint: msg(
            'Go to your saved posts, open the Cache extension popup, and press "Import page" to import them.'
        ),
        id: "instagram",
        label: "Instagram",
        libraryItemSources: [LibraryItemSource.instagram],
        syncable: true,
    },
    {
        actions: [
            {
                behavior: {
                    autoSync: true,
                    installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                    kind: "extension-entry",
                    openURL: "https://www.tiktok.com/profile",
                },
                role: "open",
            },
        ],
        connectedWhen: [
            {
                kind: "library-item-source",
                source: LibraryItemSource.tiktok,
            },
        ],
        description: msg("Videos you save to Favorites"),
        direction: "source",
        hint: msg(
            'Go to your favorites, open the Cache extension popup, and press "Import page" to import them.'
        ),
        id: "tiktok",
        label: "TikTok",
        libraryItemSources: [LibraryItemSource.tiktok],
        syncable: true,
    },
    {
        actions: [
            {
                behavior: {
                    callbackURL: LIBRARY_CALLBACK_URL,
                    errorCallbackURL: LIBRARY_CALLBACK_URL,
                    kind: "social-sign-in",
                    provider: "google",
                },
                role: "connect",
            },
            {
                behavior: {
                    kind: "google-photos-picker",
                    successMessage: msg(
                        "Imported {count, plural, one {# item} other {# items}}."
                    ),
                },
                label: msg("Open"),
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        connectedWhen: [
            {
                kind: "linked-provider",
                providerId: "google",
            },
        ],
        description: msg("Photos and albums you star"),
        direction: "source",
        hint: msg("Import your favorite photos and albums from Google Photos."),
        id: "google-photos",
        label: "Google Photos",
        libraryItemSources: [LibraryItemSource.google_photos],
        syncable: true,
    },
    {
        actions: [
            {
                behavior: {
                    callbackURL: LIBRARY_CALLBACK_URL,
                    errorCallbackURL: LIBRARY_CALLBACK_URL,
                    kind: "oauth-link",
                    providerId: "pinterest",
                },
                role: "connect",
            },
            {
                behavior: {
                    errorMessage: msg("Could not import pins from Pinterest."),
                    kind: "route",
                    method: "POST",
                    path: "/api/integrations/pinterest/import",
                    successMessage: msg(
                        "Imported {count, plural, one {# pin} other {# pins}}."
                    ),
                },
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        connectedWhen: [
            {
                kind: "linked-provider",
                providerId: "pinterest",
            },
        ],
        description: msg("Pins you save to boards"),
        direction: "source",
        hint: msg("Import pins from your Pinterest boards."),
        id: "pinterest",
        label: "Pinterest",
        libraryItemSources: [LibraryItemSource.pinterest],
        syncable: true,
    },
    {
        actions: [
            {
                behavior: {
                    callbackURL: LIBRARY_CALLBACK_URL,
                    errorCallbackURL: LIBRARY_CALLBACK_URL,
                    kind: "oauth-link",
                    providerId: "reddit",
                },
                role: "connect",
            },
            {
                behavior: {
                    errorMessage: msg(
                        "Could not import saved posts from Reddit."
                    ),
                    kind: "route",
                    method: "POST",
                    path: "/api/integrations/reddit/import",
                    successMessage: msg(
                        "Imported {count, plural, one {# saved item} other {# saved items}}."
                    ),
                },
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        connectedWhen: [
            {
                kind: "linked-provider",
                providerId: "reddit",
            },
        ],
        description: msg("Posts and comments you save"),
        direction: "source",
        hint: msg(
            "Import posts and comments you saved on Reddit. Reddit only serves about the 1,000 most recent saves, so older ones are never fetched."
        ),
        id: "reddit",
        label: "Reddit",
        libraryItemSources: [LibraryItemSource.reddit_saved],
        syncable: true,
    },
    {
        actions: [
            {
                behavior: {
                    callbackURL: LIBRARY_CALLBACK_URL,
                    errorCallbackURL: LIBRARY_CALLBACK_URL,
                    kind: "oauth-link",
                    providerId: "github",
                },
                role: "connect",
            },
            {
                behavior: {
                    errorMessage: msg(
                        "Could not import starred repositories from GitHub."
                    ),
                    kind: "route",
                    method: "POST",
                    path: "/api/integrations/github/import",
                    successMessage: msg(
                        "Imported {count, plural, one {# repository} other {# repositories}}."
                    ),
                },
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        connectedWhen: [
            {
                kind: "linked-provider",
                providerId: "github",
            },
        ],
        description: msg("Repositories you star"),
        direction: "source",
        hint: msg("Import repositories you've starred on GitHub."),
        id: "github",
        label: "GitHub",
        libraryItemSources: [LibraryItemSource.github_starred_repositories],
        syncable: true,
    },
    {
        actions: [
            {
                behavior: {
                    callbackURL: LIBRARY_CALLBACK_URL,
                    errorCallbackURL: LIBRARY_CALLBACK_URL,
                    kind: "oauth-link",
                    providerId: "notion",
                },
                role: "connect",
            },
        ],
        connectedWhen: [
            {
                kind: "linked-provider",
                providerId: "notion",
            },
        ],
        description: msg("Pages you export from Cache"),
        direction: "destination",
        hint: msg(
            "Connect Notion to send Cache notes and collections into your workspace."
        ),
        id: "notion",
        label: "Notion",
        libraryItemSources: [],
        syncable: false,
    },
    {
        actions: [
            {
                behavior: {
                    kind: "rss-manage",
                },
                label: msg("Add feed"),
                role: "connect",
                visibleWhen: "disconnected",
            },
            {
                behavior: {
                    kind: "rss-manage",
                },
                label: msg("Manage"),
                role: "connect",
                visibleWhen: "connected",
            },
            {
                behavior: {
                    errorMessage: msg("Could not refresh RSS feeds."),
                    failureMessage: msg("Some feeds could not be refreshed."),
                    kind: "route",
                    method: "POST",
                    path: "/api/integrations/rss/check",
                    successMessage: msg(
                        "Imported {count, plural, one {# entry} other {# entries}}."
                    ),
                },
                role: "sync",
                visibleWhen: "connected",
            },
        ],
        connectedWhen: [
            {
                kind: "rss-feed",
            },
        ],
        description: msg("Feeds you follow"),
        direction: "source",
        hint: msg(
            "Add RSS feeds to import new entries into your library automatically."
        ),
        id: "rss",
        label: "RSS",
        libraryItemSources: [LibraryItemSource.rss_feed],
        syncable: true,
    },
    {
        actions: [
            {
                behavior: {
                    kind: "copy-prompt",
                    path: "/mcp/prompt",
                },
                label: msg("Copy setup prompt"),
                role: "copy",
            },
        ],
        connectedWhen: [],
        description: msg("Agent access to your library"),
        direction: "destination",
        hint: msg(
            "Give AI agents access to your library via the Model Context Protocol."
        ),
        id: "mcp",
        label: "MCP",
        libraryItemSources: [],
        syncable: false,
    },
    {
        actions: [
            {
                behavior: {
                    kind: "markdown-import",
                },
                role: "import",
                visibleWhen: "always",
            },
        ],
        connectedWhen: [
            {
                kind: "markdown-import",
            },
        ],
        description: msg("Markdown files on your computer"),
        direction: "source",
        hint: msg(
            "Import Markdown files from Obsidian, Bear, Apple Notes exports, or hand-authored folders on your computer."
        ),
        id: "markdown",
        label: "Markdown",
        libraryItemSources: [LibraryItemSource.markdown_import],
        syncable: false,
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
export type Integration = IntegrationDefinition & { id: IntegrationId };

const INTEGRATION_ID_SET: ReadonlySet<string> = new Set(
    INTEGRATION_DEFINITIONS.map((definition) => definition.id)
);

const INTEGRATION_BY_ID = new Map(
    INTEGRATION_DEFINITIONS.map((definition) => [definition.id, definition])
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

export function filterToIntegrationIds(values: string[]): IntegrationId[] {
    return values.filter(isIntegrationId);
}

export function recordHasIntegrationId<K extends string>(
    record: Record<K, unknown>,
    key: K
): record is Record<K, IntegrationId> & typeof record {
    return isIntegrationId(record[key]);
}

/**
 * Returns the integration registered under the ID. The ID comes from the
 * catalog itself, so a missing entry means the catalog was edited wrongly.
 */
export function getIntegration(id: IntegrationId): Integration {
    const integration = INTEGRATION_BY_ID.get(id);
    if (!integration) {
        throw new TypeError(`Missing integration definition for id: ${id}`);
    }
    return integration;
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

/**
 * Returns the sources that can be synced, either through a sync action or
 * through the browser extension.
 */
export function listSyncableIntegrations(): Integration[] {
    return listIntegrations(
        (integration) =>
            integration.direction === "source" && integration.syncable
    );
}

export function integrationOwnsLibraryItemSource(
    id: IntegrationId,
    source: LibraryItemSource
): boolean {
    return getIntegration(id).libraryItemSources.includes(source);
}

/**
 * Reports whether an action is shown for the current connection state.
 *
 * The rule lives with the action model, so the integrations list and the
 * registry contract agree on which actions are visible.
 */
export function isIntegrationActionVisible(
    action: IntegrationAction,
    isConnected: boolean
): boolean {
    if (action.visibleWhen === "connected") {
        return isConnected;
    }
    if (action.visibleWhen === "disconnected") {
        return !isConnected;
    }
    return true;
}

/**
 * Returns the better-auth provider ID that the integration connects
 * through, read from the connect action so the provider never has to be
 * repeated at the call site.
 */
export function getIntegrationAuthProviderId(id: IntegrationId): string {
    const definition = getIntegration(id);

    for (const action of definition.actions) {
        if (action.role !== "connect") {
            continue;
        }
        const { behavior } = action;
        if (behavior.kind === "oauth-link") {
            return behavior.providerId;
        }
        if (behavior.kind === "social-sign-in") {
            return behavior.provider;
        }
    }

    throw new TypeError(`Integration ${id} has no connect behavior.`);
}

const INTEGRATION_ACCOUNT_PROVIDER_IDS: readonly string[] =
    collectAccountProviderIds();

function collectAccountProviderIds(): string[] {
    const providerIds = new Set<string>();
    for (const definition of INTEGRATION_DEFINITIONS) {
        for (const signal of definition.connectedWhen) {
            if (signal.kind === "linked-provider") {
                providerIds.add(signal.providerId);
            }
        }
    }
    return [...providerIds];
}

export function listIntegrationAccountProviderIds(): string[] {
    return [...INTEGRATION_ACCOUNT_PROVIDER_IDS];
}

interface ConnectionMatchContext {
    hasMarkdownImports: boolean;
    hasRssFeeds: boolean;
    libraryItemSources: Set<LibraryItemSource>;
    linkedProviderIds: Set<string>;
}

function buildConnectionMatchContext(
    context: IntegrationConnectionContext
): ConnectionMatchContext {
    return {
        hasMarkdownImports: context.hasMarkdownImports,
        hasRssFeeds: context.hasRssFeeds,
        libraryItemSources: new Set(context.libraryItemSources),
        linkedProviderIds: new Set(context.linkedProviderIds),
    };
}

function connectionMatchesSignal(
    signal: IntegrationConnectionSignal,
    context: ConnectionMatchContext
): boolean {
    switch (signal.kind) {
        case "library-item-source":
            return context.libraryItemSources.has(signal.source);
        case "linked-provider":
            return context.linkedProviderIds.has(signal.providerId);
        case "markdown-import":
            return context.hasMarkdownImports;
        case "rss-feed":
            return context.hasRssFeeds;
        default:
            throw new Error(
                `Unhandled connection signal: ${signal satisfies never}.`
            );
    }
}

export function listConnectedIntegrationIds(
    context: IntegrationConnectionContext
): IntegrationId[] {
    const matchContext = buildConnectionMatchContext(context);
    const connectedIds: IntegrationId[] = [];

    for (const definition of INTEGRATION_DEFINITIONS) {
        const isConnected = definition.connectedWhen.some((signal) =>
            connectionMatchesSignal(signal, matchContext)
        );
        if (isConnected) {
            connectedIds.push(definition.id);
        }
    }

    return connectedIds;
}
