import { BASE_URL } from "@/lib/common/constants";

function getPublicCollectionSharePath(shareId: string): string {
    return `/s/${encodeURIComponent(shareId)}`;
}

export function buildPublicCollectionShareUrl(
    shareId: string,
    baseUrl = BASE_URL
): string {
    return new URL(getPublicCollectionSharePath(shareId), baseUrl).toString();
}
