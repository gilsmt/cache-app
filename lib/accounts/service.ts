import "server-only";

import { auth } from "@/lib/auth/server";
import { cancelUserNonterminalSubscriptions } from "@/lib/billing/service";

export async function deleteUserAccount(
    requestHeaders: Headers
): Promise<void> {
    await auth.api.deleteUser({ body: {}, headers: requestHeaders });
}

/**
 * Better Auth's pre-delete hook cancels Stripe subscriptions only after it
 * accepts the fresh session.
 */
export async function prepareUserDeletion(userId: string): Promise<void> {
    await cancelUserNonterminalSubscriptions(userId);
}
