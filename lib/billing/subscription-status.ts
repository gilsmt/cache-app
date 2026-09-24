export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

export const TERMINAL_SUBSCRIPTION_STATUSES = [
    "canceled",
    "incomplete_expired",
] as const;

export function isActiveSubscriptionStatus(
    status: string | null | undefined
): boolean {
    return ACTIVE_SUBSCRIPTION_STATUSES.some((s) => s === status);
}

export function findActiveSubscription<T extends { status?: string | null }>(
    subscriptions: readonly T[] | null | undefined
): T | null {
    return (
        subscriptions?.find((sub) => isActiveSubscriptionStatus(sub.status)) ??
        null
    );
}
