import "server-only";

import { cancelUserNonterminalSubscriptions } from "@/lib/billing/service";

/**
 * Better Auth's pre-delete hook cancels Stripe subscriptions only after it
 * accepts the fresh session.
 */
export async function prepareUserDeletion(userId: string): Promise<void> {
    await cancelUserNonterminalSubscriptions(userId);
}
