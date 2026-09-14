"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { T, Var } from "gt-next";
import * as React from "react";
import useSWR from "swr";
import * as z from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GradientWaveText } from "@/components/ui/gradient-wave-text";
import { CrownFilledIcon } from "@/components/ui/icons";
import { authClient, useSession } from "@/lib/auth/client";
import { isActiveSubscriptionStatus } from "@/lib/billing/subscription-status";
import { getActiveSubscription } from "@/lib/billing/subscriptions";

const PERIOD_END_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
});

export const UPGRADED_SEARCH_PARAM = "upgraded";
export const UPGRADED_SEARCH_VALUE = "true";

const SubscriptionRedirectResultSchema = z.object({
    data: z.object({ url: z.string() }).nullish(),
    error: z.object({ message: z.string() }).nullish(),
});

/**
 * Unified action wrapper for Stripe redirects. Standardizes loading states, URL
 * assignment, and accessibility-compliant failure notifications for checkout
 * and portal actions.
 */
function useSubscriptionRedirectAction(
    request: () => Promise<{ data: unknown; error: unknown }>,
    fallbackMessage: React.ReactNode
) {
    const [isPending, startTransition] = React.useTransition();
    const [errorMessage, setErrorMessage] =
        React.useState<React.ReactNode | null>(null);

    const execute = useStableCallback(() => {
        startTransition(async () => {
            setErrorMessage(null);
            try {
                const parsed = SubscriptionRedirectResultSchema.safeParse(
                    await request()
                );

                if (!parsed.success) {
                    setErrorMessage(fallbackMessage);
                    return;
                }

                const { data, error } = parsed.data;

                if (error) {
                    setErrorMessage(error.message);
                    return;
                }

                const url = data?.url;
                if (url) {
                    window.location.assign(url);
                    return;
                }

                setErrorMessage(fallbackMessage);
            } catch {
                setErrorMessage(fallbackMessage);
            }
        });
    });

    return { errorMessage, execute, isPending };
}

/**
 * Returns user subscription status and access checks, unifying auth session
 * and active Stripe records. This prevents desync bugs where the local session
 * claims active status but Stripe has canceled or suspended the account.
 */
export function useSubscriptionAccess() {
    const {
        data: session,
        error: sessionError,
        isPending,
        refetch: refreshSession,
    } = useSession();

    const sessionUserId = session?.user?.id;

    if (sessionError) {
        // Delegate authentication-critical errors to the nearest React error boundary
        throw sessionError;
    }

    const {
        data: subscription,
        isLoading: isSubscriptionLoading,
        mutate: refreshSubscription,
    } = useSWR(
        sessionUserId ? ["subscription", sessionUserId] : null,
        getActiveSubscription,
        {
            keepPreviousData: true,
            refreshInterval: 60_000,
            revalidateOnFocus: false,
        }
    );

    const hasAccess = isActiveSubscriptionStatus(subscription?.status);
    const isLoading = isPending || isSubscriptionLoading;

    const refreshAccess = useStableCallback(async () => {
        await refreshSession();
        if (sessionUserId) {
            await refreshSubscription();
        }
    });

    return {
        hasAccess,
        isLoading,
        mutate: refreshAccess,
        session,
        subscription,
    };
}

function subscriptionPlanLabel(plan: string | null | undefined) {
    if (!plan) {
        return <T>Subscription</T>;
    }
    return `${plan[0]?.toUpperCase()}${plan.slice(1)}`;
}

function subscriptionPeriodEndLabel(
    periodEnd: string | Date | null | undefined
) {
    if (!periodEnd) {
        return null;
    }
    return PERIOD_END_DATE_FORMATTER.format(new Date(periodEnd));
}

function subscriptionBillingIntervalLabel(
    billingInterval: string | null | undefined
) {
    if (billingInterval === "year") {
        return <T>yearly</T>;
    }
    if (billingInterval === "month") {
        return <T>monthly</T>;
    }
    return null;
}

function subscriptionStatusLabel(status: string | null | undefined) {
    return status?.replaceAll("_", " ") ?? <T>Unknown</T>;
}

function getReturnUrl() {
    return typeof window === "undefined"
        ? "/library"
        : `${window.location.origin}/library`;
}

function getSuccessfulUpgradeReturnUrl() {
    const returnUrl = getReturnUrl();
    if (typeof window === "undefined") {
        return `${returnUrl}?${UPGRADED_SEARCH_PARAM}=${UPGRADED_SEARCH_VALUE}`;
    }
    const url = new URL(returnUrl);
    url.searchParams.set(UPGRADED_SEARCH_PARAM, UPGRADED_SEARCH_VALUE);
    return url.toString();
}

/**
 * Renders the compact account-menu status badge. Consolidates Stripe subscription
 * states (free, cancelling, trialing, active) into concise labels to ensure they
 * fit without breaking layout in dense, localized navigation headers.
 */
export function SubscriptionStatusBadge() {
    return (
        <WithSubscriptionOnly>
            {(subscription) => {
                if (!subscription) {
                    return (
                        <SubscriptionBadge shouldHideIcon>
                            <T context="Free plan label">Free plan</T>
                        </SubscriptionBadge>
                    );
                }

                const planLabel = subscriptionPlanLabel(subscription.plan);

                if (subscription.cancelAtPeriodEnd) {
                    return (
                        <SubscriptionBadge className="bg-amber-100 text-amber-900">
                            <T context="Subscription ends message">
                                <Var>{planLabel}</Var> ends{" "}
                                <Var>
                                    {subscriptionPeriodEndLabel(
                                        subscription.periodEnd
                                    ) ?? <T>soon</T>}
                                </Var>
                            </T>
                        </SubscriptionBadge>
                    );
                }

                if (subscription.status === "trialing") {
                    return (
                        <SubscriptionBadge className="bg-primary/10 text-primary">
                            <T context="Trialing status label">
                                <Var>{planLabel}</Var> trial, then{" "}
                                <Var>
                                    {subscriptionBillingIntervalLabel(
                                        subscription.billingInterval
                                    )}
                                </Var>
                            </T>
                        </SubscriptionBadge>
                    );
                }

                if (subscription.status === "active") {
                    return (
                        <SubscriptionBadge className="bg-primary/10 text-primary">
                            <GradientWaveText align="center" ariaLabel="Status">
                                <T context="Active status label">
                                    <Var>{planLabel}</Var>{" "}
                                    <Var>
                                        {subscriptionBillingIntervalLabel(
                                            subscription.billingInterval
                                        )}
                                    </Var>
                                </T>
                            </GradientWaveText>
                        </SubscriptionBadge>
                    );
                }

                return (
                    <SubscriptionBadge>
                        <T context="Other subscription status">
                            <Var>{planLabel}</Var>{" "}
                            <Var>
                                {subscriptionStatusLabel(subscription.status)}
                            </Var>
                        </T>
                    </SubscriptionBadge>
                );
            }}
        </WithSubscriptionOnly>
    );
}

/**
 * Triggers Stripe Checkout redirection for the premium Pro plan.
 */
export function SubscriptionUpgradeButton({
    isAnnual = false,
    variant = "ghost",
    ...props
}: React.ComponentProps<typeof Button> & { isAnnual?: boolean }) {
    const { errorMessage, execute, isPending } = useSubscriptionRedirectAction(
        () =>
            authClient.subscription.upgrade({
                annual: isAnnual,
                cancelUrl: getReturnUrl(),
                plan: "pro",
                successUrl: getSuccessfulUpgradeReturnUrl(),
            }),
        <T>We couldn't open checkout right now.</T>
    );

    return (
        <>
            <Button
                {...props}
                isLoading={isPending}
                onClick={execute}
                variant={variant}
            />
            <SubscriptionErrorMessage>{errorMessage}</SubscriptionErrorMessage>
        </>
    );
}

/**
 * Directs the customer to the Stripe billing portal to update payments, view
 * historical invoices, or manage subscription cycles.
 */
export function SubscriptionBillingPortalButton({
    variant = "ghost",
    ...props
}: React.ComponentProps<typeof Button>) {
    const { errorMessage, execute, isPending } = useSubscriptionRedirectAction(
        () =>
            authClient.subscription.billingPortal({
                returnUrl: getReturnUrl(),
            }),
        <T>We couldn't open billing right now.</T>
    );

    return (
        <>
            <Button
                {...props}
                isLoading={isPending}
                onClick={execute}
                variant={variant}
            />
            <SubscriptionErrorMessage>{errorMessage}</SubscriptionErrorMessage>
        </>
    );
}

interface SubscriptionGateProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

/**
 * Restricts rendering to users with active subscriptions. Use this to hide
 * premium features or promotional copy from non-paying users.
 */
export function SubscribedOnly({
    children,
    fallback = null,
}: SubscriptionGateProps) {
    const { hasAccess, isLoading } = useSubscriptionAccess();

    if (isLoading) {
        return fallback;
    }

    return hasAccess ? children : null;
}

/**
 * Restricts rendering to unsubscribed users. Defers rendering during initial load
 * to prevent flashing upgrade prompts or free-tier UI while the subscription status
 * is still being verified.
 */
export function UnsubscribedOnly({
    children,
    fallback = null,
}: SubscriptionGateProps) {
    const { hasAccess, isLoading } = useSubscriptionAccess();

    if (isLoading) {
        return fallback;
    }

    return hasAccess ? null : children;
}

/**
 * Use for small inline affordances. Prefer route-level loading for full-page
 * suspense to avoid shell churn.
 */
export function SubscriptionLoadingOnly({ children }: React.PropsWithChildren) {
    const { isLoading } = useSubscriptionAccess();

    return isLoading ? children : null;
}

interface WithSubscriptionOnlyProps {
    children: (
        subscription: ReturnType<typeof useSubscriptionAccess>["subscription"]
    ) => React.ReactNode;
    fallback?: React.ReactNode;
}

/**
 * Renders UI dependent on subscription data once resolved. Prevents rendering
 * intermediate states (such as flashing "Free Plan" before active Stripe data returns)
 * by deferring child execution until the subscription status is fully loaded.
 */
export function WithSubscriptionOnly({
    children,
    fallback = null,
}: WithSubscriptionOnlyProps) {
    const { isLoading, subscription } = useSubscriptionAccess();

    if (isLoading) {
        return fallback;
    }

    return children(subscription);
}

interface SubscriptionBadgeProps extends React.ComponentProps<typeof Badge> {
    shouldHideIcon?: boolean;
}

function SubscriptionBadge({
    className,
    children,
    shouldHideIcon,
    variant = "secondary",
    ...props
}: SubscriptionBadgeProps) {
    return (
        <Badge
            {...props}
            className={cn("h-7! w-full", className)}
            variant={variant}
        >
            {shouldHideIcon ? null : <CrownFilledIcon />}
            {children}
        </Badge>
    );
}

/**
 * Accessible error announcement for billing operations. Avoids layout shift by
 * returning null on the happy path, while exposing proper ARIA alerts if errors occur.
 */
function SubscriptionErrorMessage(props: React.ComponentProps<"p">) {
    if (!props.children) {
        return null;
    }

    return (
        <p
            {...props}
            aria-atomic="true"
            aria-live="assertive"
            className="px-2 text-destructive text-xs"
            role="alert"
        />
    );
}
