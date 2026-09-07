import "server-only";

import { withStripe } from "@/lib/billing/client";
import type { PriceType } from "@/lib/billing/prices";
import { createLogger } from "@/lib/common/logs/console/logger";
import { prisma } from "@/prisma";
import type { Prisma } from "@/prisma/client/client";
import {
    ACTIVE_SUBSCRIPTION_STATUSES,
    isActiveSubscriptionStatus,
} from "./subscription-status";

const log = createLogger("billing:service");

export async function getUserActiveSubscriptionStatus(
    userId: string,
    tx?: Prisma.TransactionClient
) {
    const client = tx ?? prisma;
    const subscription = await client.subscription.findFirst({
        orderBy: {
            periodEnd: "desc",
        },
        select: {
            billingInterval: true,
            status: true,
        },
        where: {
            referenceId: userId,
            status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
        },
    });

    return subscription;
}

export async function userHasActiveSubscription(
    userId: string
): Promise<boolean> {
    const subscription = await getUserActiveSubscriptionStatus(userId);

    return isActiveSubscriptionStatus(subscription?.status);
}

export async function getUserPlanType(userId: string): Promise<PriceType> {
    const subscription = await getUserActiveSubscriptionStatus(userId);

    if (!(subscription && isActiveSubscriptionStatus(subscription.status))) {
        return "free";
    }

    return subscription.billingInterval === "year" ? "yearly" : "monthly";
}

/**
 * Hard-cancels every active or trialing Stripe subscription owned by the user.
 *
 * Used by the account-deletion flow: the user has explicitly chosen to leave,
 * so we terminate billing immediately rather than scheduling it for the end
 * of the current period. Stripe refunds unused time automatically; a user
 * with no active subscription is a no-op so this stays safe to call.
 */
export async function cancelUserActiveSubscriptions(
    userId: string
): Promise<void> {
    const subscriptions = await prisma.subscription.findMany({
        select: { stripeSubscriptionId: true },
        where: {
            referenceId: userId,
            status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
            stripeSubscriptionId: { not: null },
        },
    });

    const stripeSubscriptionIds = subscriptions
        .map((subscription) => subscription.stripeSubscriptionId)
        .filter((id): id is string => id !== null);

    if (stripeSubscriptionIds.length === 0) {
        return;
    }

    await withStripe(async (stripe) => {
        await Promise.all(
            stripeSubscriptionIds.map((stripeSubscriptionId) =>
                stripe.subscriptions
                    .cancel(stripeSubscriptionId)
                    .catch((error) => {
                        log.error(
                            "Failed to cancel subscription during account deletion",
                            error,
                            {
                                operation: "cancelUserActiveSubscriptions",
                                stripeSubscriptionId,
                                userId,
                            }
                        );
                    })
            )
        );
    });
}
