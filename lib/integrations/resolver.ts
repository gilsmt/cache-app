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
    RedditIcon,
    TikTokIcon,
    XSocialIcon,
    YouTubeIcon,
} from "@/components/ui/icons";
import { LibraryItemSource } from "@/prisma/client/enums";
import type { Integration, IntegrationId } from "./registry";
import { INTEGRATION_DEFINITIONS } from "./registry";

type IntegrationIcon = ComponentType<SVGProps<SVGSVGElement>>;

const INTEGRATION_ICONS: Record<IntegrationId, IntegrationIcon> = {
    chrome: ChromeIcon,
    github: GithubIcon,
    "google-photos": PhotosIcon,
    instagram: InstagramIcon,
    markdown: MarkdownIcon,
    mcp: Bot,
    notion: NotionIcon,
    pinterest: PinterestIcon,
    reddit: RedditIcon,
    rss: Rss,
    tiktok: TikTokIcon,
    x: XSocialIcon,
    youtube: YouTubeIcon,
};

const SOURCE_TO_LABEL: ReadonlyMap<string, string> = new Map<string, string>([
    ...INTEGRATION_DEFINITIONS.flatMap((integration: Integration) =>
        (integration.source?.libraryItemSources ?? []).map(
            (source) => [source, integration.label] as const
        )
    ),
    // Internal sources that don't belong to a specific external integration
    [LibraryItemSource.cache_note, "Notes"] as const,
    [LibraryItemSource.extension_clip, "Extension"] as const,
]);

const SOURCE_TO_ICON: ReadonlyMap<LibraryItemSource, IntegrationIcon> = new Map<
    LibraryItemSource,
    IntegrationIcon
>(
    INTEGRATION_DEFINITIONS.flatMap((integration: Integration) =>
        (integration.source?.libraryItemSources ?? []).map(
            (source) => [source, INTEGRATION_ICONS[integration.id]] as const
        )
    )
);

export function getIntegrationIcon(id: IntegrationId): IntegrationIcon {
    const icon = INTEGRATION_ICONS[id];
    if (!icon) {
        throw new TypeError(`Missing icon for integration id: ${id}`);
    }
    return icon;
}

export function getSourceLabel(source: string): string {
    return SOURCE_TO_LABEL.get(source) ?? "Other";
}

export function getSourceIcon(
    source: LibraryItemSource
): IntegrationIcon | undefined {
    return SOURCE_TO_ICON.get(source);
}
