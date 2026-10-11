import "server-only";

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

    return <span className="text-xs opacity-80">{count}</span>;
}
