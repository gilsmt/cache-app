import { Bot, Rss } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import {
    ChromeIcon,
    GithubIcon,
    InstagramIcon,
    MarkdownIcon,
    NotionIcon,
    PhotosIcon,
    PinterestIcon,
    TikTokIcon,
    XSocialIcon,
    YouTubeIcon,
} from "@/components/ui/icons";
import { CACHE_EXTENSION_DOWNLOAD_URL } from "@/lib/common/constants";
import { LibraryItemSource } from "@/prisma/client/enums";

export type IntegrationCategory = "developer" | "media" | "social";

export type IntegrationDirection = "destination" | "source";

export type IntegrationIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type IntegrationId =
    | "chrome"
    | "github"
    | "google-photos"
    | "instagram"
    | "markdown"
    | "mcp"
    | "notion"
    | "pinterest"
    | "rss"
    | "tiktok"
    | "x"
    | "youtube";

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
    connectedWhen: IntegrationConnectionSignal[];
}

export interface IntegrationSourceDefinition
    extends IntegrationDirectionDefinition {
    libraryItemSources: LibraryItemSource[];
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

export interface RouteSyncBehavior {
    errorMessage: string;
    kind: "route";
    method: "POST";
    path: string;
    successKey: string;
    successMessage?: (payload: Record<string, unknown>) => string | null;
}

export interface GooglePhotosPickerSyncBehavior {
    kind: "google-photos-picker";
}

export interface CopyPromptBehavior {
    kind: "copy-prompt";
    path: string;
}

export interface MarkdownImportBehavior {
    kind: "markdown-import";
}

export interface SupportedIntegration {
    actions: SupportedIntegrationAction[];
    behaviors: {
        connect?:
            | OAuthLinkConnectBehavior
            | RssManageConnectBehavior
            | SocialSignInConnectBehavior;
        copy?: CopyPromptBehavior;
        import?: MarkdownImportBehavior;
        open?: ExtensionOpenBehavior;
        sync?: GooglePhotosPickerSyncBehavior | RouteSyncBehavior;
    };
    category: IntegrationCategory;
    description: string;
    destination?: IntegrationDestinationDefinition;
    hint: string;
    hintImage?: string;
    Icon: IntegrationIcon;
    id: IntegrationId;
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

export const INTEGRATIONS: readonly SupportedIntegration[] = [
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
        behaviors: {
            connect: {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "oauth-link",
                providerId: "x",
            },
            sync: {
                errorMessage: "Could not import bookmarks from X.",
                kind: "route",
                method: "POST",
                path: "/api/integrations/x/import",
                successKey: "importedCount",
                successMessage: (payload) =>
                    formatImportedCountMessage(payload, "bookmark"),
            },
        },
        category: "social",
        description: "Posts you save to Bookmarks",
        hint: "Import your X Bookmarks into Cache.",
        Icon: XSocialIcon,
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
        behaviors: {
            open: {
                installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                kind: "extension-entry",
                openURL: CACHE_EXTENSION_DOWNLOAD_URL,
            },
        },
        category: "social",
        description: "Bookmarks you save in your browser",
        hint: 'Open the Cache extension popup and mark "Sync" under Browser bookmarks.',
        Icon: ChromeIcon,
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
        behaviors: {
            open: {
                autoSync: true,
                installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                kind: "extension-entry",
                openURL: "https://www.youtube.com/playlist?list=WL",
            },
        },
        category: "media",
        description: "Videos you save to playlists",
        hint: 'Go to your Watch Later playlist, open the Cache extension popup, and press "Import page" to import the videos.',
        Icon: YouTubeIcon,
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
        behaviors: {
            open: {
                autoSync: true,
                installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                kind: "extension-entry",
                openURL: "https://www.instagram.com/explore/saved/",
            },
        },
        category: "social",
        description: "Posts you save to Favorites",
        hint: 'Go to your saved posts, open the Cache extension popup, and press "Import page" to import them.',
        Icon: InstagramIcon,
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
        behaviors: {
            open: {
                autoSync: true,
                installURL: CACHE_EXTENSION_DOWNLOAD_URL,
                kind: "extension-entry",
                openURL: "https://www.tiktok.com/profile",
            },
        },
        category: "social",
        description: "Videos you save to Favorites",
        hint: 'Go to your favorites, open the Cache extension popup, and press "Import page" to import them.',
        Icon: TikTokIcon,
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
        behaviors: {
            connect: {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "social-sign-in",
                provider: "google",
            },
            sync: {
                kind: "google-photos-picker",
            },
        },
        category: "media",
        description: "Photos and albums you star",
        hint: "Import your favorite photos and albums from Google Photos.",
        Icon: PhotosIcon,
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
        behaviors: {
            connect: {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "oauth-link",
                providerId: "pinterest",
            },
            sync: {
                errorMessage: "Could not import pins from Pinterest.",
                kind: "route",
                method: "POST",
                path: "/api/integrations/pinterest/import",
                successKey: "importedCount",
                successMessage: (payload) =>
                    formatImportedCountMessage(payload, "pin"),
            },
        },
        category: "social",
        description: "Pins you save to boards",
        hint: "Import pins from your Pinterest boards.",
        Icon: PinterestIcon,
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
        behaviors: {
            connect: {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "oauth-link",
                providerId: "github",
            },
            sync: {
                errorMessage:
                    "Could not import starred repositories from GitHub.",
                kind: "route",
                method: "POST",
                path: "/api/integrations/github/import",
                successKey: "importedCount",
                successMessage: (payload) =>
                    formatImportedCountMessage(
                        payload,
                        "repository",
                        "repositories"
                    ),
            },
        },
        category: "developer",
        description: "Repositories you star",
        hint: "Import repositories you've starred on GitHub.",
        Icon: GithubIcon,
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
        behaviors: {
            connect: {
                callbackURL: LIBRARY_CALLBACK_URL,
                errorCallbackURL: LIBRARY_CALLBACK_URL,
                kind: "oauth-link",
                providerId: "notion",
            },
        },
        category: "developer",
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
        Icon: NotionIcon,
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
        behaviors: {
            connect: {
                kind: "rss-manage",
            },
            sync: {
                errorMessage: "Could not refresh RSS feeds.",
                kind: "route",
                method: "POST",
                path: "/api/integrations/rss/check",
                successKey: "importedCount",
                successMessage: (payload) =>
                    formatImportedCountMessage(payload, "entry", "entries"),
            },
        },
        category: "developer",
        description: "Feeds you follow",
        hint: "Add RSS feeds to import new entries into your library automatically.",
        Icon: Rss,
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
        behaviors: {
            copy: {
                kind: "copy-prompt",
                path: "/mcp/prompt",
            },
        },
        category: "developer",
        description: "Agent access to your library",
        hint: "Give AI agents access to your library via the Model Context Protocol.",
        Icon: Bot,
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
        behaviors: {
            import: {
                kind: "markdown-import",
            },
        },
        category: "developer",
        description: "Markdown files on your computer",
        hint: "Import Markdown files from Obsidian, Bear, Apple Notes exports, or hand-authored folders on your computer.",
        Icon: MarkdownIcon,
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
] as const;

const INTEGRATION_BY_ID = new Map<IntegrationId, SupportedIntegration>(
    INTEGRATIONS.map((item) => [item.id, item])
);

const INTEGRATION_ID_SET: ReadonlySet<string> = new Set(
    INTEGRATIONS.map((item) => item.id)
);

const SOURCE_TO_LABEL = new Map<LibraryItemSource, string>(
    INTEGRATIONS.flatMap((integration) =>
        (integration.source?.libraryItemSources ?? []).map((source) => [
            source,
            integration.label,
        ])
    )
);

// Internal sources that don't belong to a specific external integration
SOURCE_TO_LABEL.set(LibraryItemSource.cache_note, "Notes");
SOURCE_TO_LABEL.set(LibraryItemSource.extension_clip, "Extension");

const SOURCE_TO_ICON = new Map<LibraryItemSource, IntegrationIcon>(
    INTEGRATIONS.flatMap((integration) =>
        (integration.source?.libraryItemSources ?? []).map((source) => [
            source,
            integration.Icon,
        ])
    )
);

const INTEGRATION_ACCOUNT_PROVIDER_IDS: readonly Extract<
    IntegrationConnectionSignal,
    { kind: "linked-provider" }
>["providerId"][] = Array.from(
    new Set(
        INTEGRATIONS.flatMap((integration) =>
            listDirectionDefinitions(integration).flatMap((definition) =>
                definition.connectedWhen.flatMap((signal) =>
                    signal.kind === "linked-provider" ? [signal.providerId] : []
                )
            )
        )
    )
);

export const LIBRARY_BOOKMARK_SYNC_INTEGRATION_IDS = INTEGRATIONS.filter(
    (item) => item.source?.syncable
).map((item) => item.id);

function listDirectionDefinitions(
    integration: SupportedIntegration
): IntegrationDirectionDefinition[] {
    const definitions: IntegrationDirectionDefinition[] = [];
    if (integration.source) {
        definitions.push(integration.source);
    }
    if (integration.destination) {
        definitions.push(integration.destination);
    }
    return definitions;
}

function getDirectionDefinition(
    integration: SupportedIntegration,
    direction: IntegrationDirection
): IntegrationDestinationDefinition | IntegrationSourceDefinition | undefined {
    return direction === "source"
        ? integration.source
        : integration.destination;
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

export function getIntegration(id: IntegrationId): SupportedIntegration {
    const row = INTEGRATION_BY_ID.get(id);
    if (!row) {
        throw new TypeError(`Missing integration definition for id: ${id}`);
    }
    return row;
}

export function findIntegrationById(
    value: unknown
): SupportedIntegration | undefined {
    if (!isIntegrationId(value)) {
        return;
    }
    return INTEGRATION_BY_ID.get(value);
}

export function listIntegrations(
    predicate?: (item: SupportedIntegration) => boolean
): SupportedIntegration[] {
    return predicate ? INTEGRATIONS.filter(predicate) : [...INTEGRATIONS];
}

export function integrationsInCategory(
    category: IntegrationCategory
): SupportedIntegration[] {
    return INTEGRATIONS.filter((item) => item.category === category);
}

export function integrationIds(): IntegrationId[] {
    return INTEGRATIONS.map((item) => item.id);
}

export function filterToIntegrationIds(values: string[]): IntegrationId[] {
    return values.filter(isIntegrationId);
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

export function listIntegrationAccountProviderIds(): string[] {
    return [...INTEGRATION_ACCOUNT_PROVIDER_IDS];
}

export function listSyncableIntegrations(): SupportedIntegration[] {
    return INTEGRATIONS.filter((item) => item.source?.syncable);
}

export function integrationOwnsLibraryItemSource(
    id: IntegrationId,
    source: LibraryItemSource
): boolean {
    const definition = getIntegration(id).source;
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

export function recordHasIntegrationId<K extends string>(
    record: Record<K, unknown>,
    key: K
): record is Record<K, IntegrationId> & typeof record {
    return isIntegrationId(record[key]);
}

export function getSourceLabel(source: LibraryItemSource): string {
    return SOURCE_TO_LABEL.get(source) ?? "Other";
}

export function getSourceIcon(
    source: LibraryItemSource
): IntegrationIcon | undefined {
    return SOURCE_TO_ICON.get(source);
}
