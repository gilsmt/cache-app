import "server-only";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUserId } from "@/lib/auth/session";
import { countRecentlyDeletedItems } from "@/lib/collections/service";

export async function RecentlyDeletedCount() {
    const userId = await getSessionUserId();

    if (!userId) {
        return null;
    }

    const count = await countRecentlyDeletedItems({ userId });

    if (count === 0) {
        return null;
    }

    return <Badge variant="secondary">{count}</Badge>;
}

export function RecentlyDeletedCountSkeleton() {
    return <Skeleton className="size-5.5 rounded-full sm:size-4.5" />;
}
