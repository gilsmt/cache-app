import "server-only";

import { withStripe } from "@/lib/billing/client";
import { StripeError } from "@/lib/billing/error";
import type { PriceType } from "@/lib/billing/prices";
import { createLogger } from "@/lib/common/logs/console/logger";
import { prisma } from "@/prisma";
import type { Prisma } from "@/prisma/client/client";
import {
    ACTIVE_SUBSCRIPTION_STATUSES,
    isActiveSubscriptionStatus,
    TERMINAL_SUBSCRIPTION_STATUSES,
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
 * Hard-cancels every non-terminal Stripe subscription owned by the user.
 *
 * Used by the account-deletion flow to stop billing immediately. A user with no
 * non-terminal subscription is a no-op. Any query or cancellation failure
 * rejects so account deletion cannot leave a Stripe subscription behind.
 */
export async function cancelUserNonterminalSubscriptions(
    userId: string
): Promise<void> {
    const subscriptions = await prisma.subscription.findMany({
        select: { stripeSubscriptionId: true },
        where: {
            OR: [
                { status: null },
                {
                    status: {
                        notIn: [...TERMINAL_SUBSCRIPTION_STATUSES],
                    },
                },
            ],
            referenceId: userId,
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
        const cancellationResults = await Promise.all(
            stripeSubscriptionIds.map(async (stripeSubscriptionId) => {
                try {
                    await stripe.subscriptions.cancel(stripeSubscriptionId);
                    return { status: "fulfilled" };
                } catch (error) {
                    return { error, status: "rejected", stripeSubscriptionId };
                }
            })
        );
        const failedCancellations = cancellationResults.filter(
            (result) => result.status === "rejected"
        );

        for (const { error, stripeSubscriptionId } of failedCancellations) {
            log.error(
                "Failed to cancel subscription during account deletion",
                error,
                {
                    operation: "cancelUserNonterminalSubscriptions",
                    stripeSubscriptionId,
                    userId,
                }
            );
        }

        if (failedCancellations.length === 0) {
            return;
        }

        throw new StripeError(
            {
                message:
                    "Unable to cancel Stripe subscriptions before account deletion.",
                operation: "billing::cancelUserNonterminalSubscriptions",
            },
            {
                cause: new AggregateError(
                    failedCancellations.map(({ error }) => error),
                    "One or more Stripe subscription cancellations failed."
                ),
            }
        );
    });
}
