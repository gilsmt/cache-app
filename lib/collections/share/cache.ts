import "server-only";

import { updateTag } from "next/cache";

export function publicCollectionShareMetadataTag(shareId: string): string {
    return `public-collection-share-meta:${shareId}`;
}

export function invalidateShareMetadataCache(shareId: string): void {
    updateTag(publicCollectionShareMetadataTag(shareId));
}
