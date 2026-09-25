import "server-only";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getSessionUserId } from "@/lib/auth/session";
import { countEnabledAutomations } from "@/lib/intelligence/automations/service";

export async function AutomationsCount() {
    const userId = await getSessionUserId();

    if (!userId) {
        return null;
    }

    const count = await countEnabledAutomations({ userId });

    if (count === 0) {
        return null;
    }

    return <Badge variant="secondary">{count}</Badge>;
}

export function AutomationsCountSkeleton() {
    return <Skeleton className="size-5.5 rounded-full sm:size-4.5" />;
}
