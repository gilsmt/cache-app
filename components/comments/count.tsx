import "server-only";

import { getSessionUserId } from "@/lib/auth/session";
import { countCommentsForUser } from "@/lib/comments/service";

export async function CommentsCount() {
    const userId = await getSessionUserId();

    if (!userId) {
        return null;
    }

    const count = await countCommentsForUser({ userId });

    if (count === 0) {
        return null;
    }

    return <span className="text-xs opacity-80">{count}</span>;
}
