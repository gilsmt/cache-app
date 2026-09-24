import { getGT } from "gt-next/server";
import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { DEFAULT_OG_IMAGE, DEFAULT_OG_IMAGE_ALT } from "@/app/metadata";
import {
    PublicShareGrid,
    type PublicShareGridItem,
    PublicShareGridSkeleton,
} from "@/components/share/list";
import { BrandLogo } from "@/components/ui/brand-logo";
import { FadeIn } from "@/components/ui/fade-in";
import { publicCollectionShareMetadataTag } from "@/lib/collections/sharing/cache";
import { getPublicCollectionShareById } from "@/lib/collections/sharing/service";
import { FALLBACK_URL, ITEM_KIND_NOTE } from "@/lib/common/constants";
import { getNoteExcerpt } from "@/lib/common/string";
import { normalizeURL } from "@/lib/common/url";
import LogoIconImage from "@/public/cache-app-icon.png";

export const instant = false;

interface CollectionSharePageProps {
    params: Promise<{
        shareId: string;
    }>;
}

function getSharedItemTitle(
    item: {
        caption: string | null;
        kind: string;
        noteContentText: string | null;
        url: string;
    },
    untitledNoteLabel: string
): string {
    if (item.kind === ITEM_KIND_NOTE) {
        return getNoteExcerpt(item.noteContentText, 80) || untitledNoteLabel;
    }
    const caption = item.caption?.trim();
    return caption && caption.length > 0 ? caption : normalizeURL(item.url);
}

function getSharedItemHref(item: { kind: string; url: string }): string | null {
    const href = normalizeURL(item.url);
    return item.kind === ITEM_KIND_NOTE || href === FALLBACK_URL ? null : href;
}

function getSharedItemPreviewImageUrl(
    item: { kind: string; url: string },
    href: string | null
): string | null {
    if (item.kind === ITEM_KIND_NOTE || !href) {
        return null;
    }
    return `/api/preview?url=${encodeURIComponent(href)}`;
}

async function getCachedShareMetadata(shareId: string) {
    "use cache";
    cacheLife("hours");
    cacheTag(publicCollectionShareMetadataTag(shareId));

    const collection = await getPublicCollectionShareById(shareId);
    if (!collection) {
        return null;
    }

    return {
        description: collection.description,
        name: collection.name,
        ownerName: collection.ownerName,
    };
}

export async function generateMetadata(
    props: CollectionSharePageProps
): Promise<Metadata> {
    const { shareId } = await props.params;
    const collection = await getCachedShareMetadata(shareId);
    const gt = await getGT();
    const title = collection
        ? gt("{collectionName} shared collection", {
              collectionName: collection.name,
          })
        : gt("Shared collection");
    const fallbackDescription = collection
        ? gt("A read-only collection shared by {ownerName} on Cache.", {
              ownerName: collection.ownerName,
          })
        : gt("A shared collection on Cache.");
    const description = `${collection?.description ?? fallbackDescription} ${gt(
        "Create your own."
    )}`;
    const images = [
        {
            alt: DEFAULT_OG_IMAGE_ALT,
            height: 630,
            url: DEFAULT_OG_IMAGE,
            width: 1200,
        },
    ];

    return {
        description,
        openGraph: {
            description,
            images,
            title,
            type: "website",
        },
        robots: {
            follow: false,
            googleBot: {
                follow: false,
                index: false,
            },
            index: false,
            noarchive: true,
            noimageindex: true,
        },
        title,
        twitter: {
            card: "summary_large_image",
            description,
            images,
            title,
        },
    };
}

async function CollectionShareBody(props: CollectionSharePageProps) {
    await connection();

    const gt = await getGT();
    const { shareId } = await props.params;
    const collection = await getPublicCollectionShareById(shareId);

    if (!collection) {
        notFound();
    }

    const untitledNoteLabel = gt("Untitled note");
    const items: PublicShareGridItem[] = collection.items.map((item) => {
        const href = getSharedItemHref(item);

        return {
            href,
            id: item.id,
            kind: item.kind === "note" ? "note" : "bookmark",
            noteExcerpt:
                item.kind === "note"
                    ? getNoteExcerpt(item.noteContentText, 320)
                    : null,
            previewImageUrl: getSharedItemPreviewImageUrl(item, href),
            title: getSharedItemTitle(item, untitledNoteLabel),
        };
    });

    return (
        <FadeIn>
            <div className="flex flex-col gap-6">
                {collection.name ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground text-sm">
                        <h1 className="font-medium text-foreground text-xl">
                            {collection.name}
                        </h1>
                        <span className="tabular-nums">
                            {collection.itemCount}{" "}
                            {collection.itemCount === 1
                                ? gt("item")
                                : gt("items")}
                        </span>
                    </div>
                ) : null}
                <PublicShareGrid items={items} />
            </div>
        </FadeIn>
    );
}

export default function CollectionSharePage(props: CollectionSharePageProps) {
    return (
        <div className="flex w-full flex-1 flex-col justify-stretch gap-6 p-2 sm:px-4 sm:py-4">
            <BrandLogo
                className="mx-auto my-3 scale-80"
                href="/library"
                src={LogoIconImage}
            />
            <Suspense fallback={<PublicShareGridSkeleton />}>
                <CollectionShareBody {...props} />
            </Suspense>
        </div>
    );
}
