import "server-only";

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

    return <span className="text-xs opacity-80">{count}</span>;
}
