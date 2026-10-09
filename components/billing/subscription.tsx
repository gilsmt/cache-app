"use client";

import { useStableCallback } from "@base-ui/utils/useStableCallback";
import { cn } from "cn";
import { T, Var } from "gt-next";
import * as React from "react";
import useSWR from "swr";
import * as z from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { GradientWaveText } from "@/components/ui/gradient-wave-text";
import { CrownFilledIcon } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient, useSession } from "@/lib/auth/client";
import { isActiveSubscriptionStatus } from "@/lib/billing/subscription-status";
import { getActiveSubscription } from "@/lib/billing/subscriptions";
import type { PaidPriceType } from "@/lib/billing/types";

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

const SelfHostContext = React.createContext(false);

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

export function useSubscriptionAccess() {
    const isSelfHosted = React.use(SelfHostContext);
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
        sessionUserId && !isSelfHosted ? ["subscription", sessionUserId] : null,
        getActiveSubscription,
        {
            keepPreviousData: true,
            refreshInterval: 60_000,
            revalidateOnFocus: false,
        }
    );

    const hasAccess = isSelfHosted
        ? !!sessionUserId
        : isActiveSubscriptionStatus(subscription?.status);
    const isLoading = isPending || (!isSelfHosted && isSubscriptionLoading);

    const refreshAccess = useStableCallback(async () => {
        await refreshSession();
        if (sessionUserId && !isSelfHosted) {
            await refreshSubscription();
        }
    });

    return {
        hasAccess,
        isLoading,
        isSelfHosted,
        mutate: refreshAccess,
        session,
        subscription: isSelfHosted ? null : subscription,
    };
}

/** Use with a plain MenuItem when the action lives inside a menu. */
export function useSubscriptionUpgradeAction(
    billingFrequency: PaidPriceType = "monthly"
) {
    return useSubscriptionRedirectAction(
        () =>
            authClient.subscription.upgrade({
                annual: billingFrequency === "yearly",
                cancelUrl: getReturnUrl(),
                plan: "pro",
                successUrl: getSuccessfulUpgradeReturnUrl(),
            }),
        <T>We couldn't open checkout right now.</T>
    );
}

/** Use with a plain MenuItem inside a menu; Button styles add extra padding and borders. */
export function useSubscriptionBillingPortalAction() {
    return useSubscriptionRedirectAction(
        () =>
            authClient.subscription.billingPortal({
                returnUrl: getReturnUrl(),
            }),
        <T>We couldn't open billing right now.</T>
    );
}

function subscriptionPlanLabel(plan: string | null | undefined) {
    if (!plan) {
        return <T>Subscription</T>;
    }
    if (plan === "pro") {
        return <T>Pro</T>;
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

interface SelfHostProviderProps {
    children: React.ReactNode;
    isSelfHosted: boolean;
}

export function SelfHostProvider({
    children,
    isSelfHosted,
}: SelfHostProviderProps) {
    return <SelfHostContext value={isSelfHosted}>{children}</SelfHostContext>;
}

interface CloudHostOnlyProps {
    children: React.ReactNode;
}

export function CloudHostOnly({ children }: CloudHostOnlyProps) {
    if (React.use(SelfHostContext)) {
        return null;
    }

    return children;
}

export function SubscriptionStatusBadge() {
    return (
        <WithSubscriptionOnly
            fallback={<Skeleton className="h-7 w-full rounded-full" />}
        >
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

interface SubscriptionUpgradeButtonProps
    extends React.ComponentProps<typeof Button> {
    billingFrequency?: PaidPriceType;
}

export function SubscriptionUpgradeButton({
    billingFrequency = "monthly",
    variant = "ghost",
    ...props
}: SubscriptionUpgradeButtonProps) {
    const { errorMessage, execute, isPending } =
        useSubscriptionUpgradeAction(billingFrequency);

    return (
        <>
            <Button
                {...props}
                isLoading={isPending}
                onClick={execute}
                variant={variant}
            />
            <ErrorMessage className="px-2">{errorMessage}</ErrorMessage>
        </>
    );
}

interface SubscriptionBillingPortalButtonProps
    extends React.ComponentProps<typeof Button> {
    variant?: React.ComponentProps<typeof Button>["variant"];
}

export function SubscriptionBillingPortalButton({
    variant = "ghost",
    ...props
}: SubscriptionBillingPortalButtonProps) {
    const { errorMessage, execute, isPending } =
        useSubscriptionBillingPortalAction();

    return (
        <>
            <Button
                {...props}
                isLoading={isPending}
                onClick={execute}
                variant={variant}
            />
            <ErrorMessage className="px-2">{errorMessage}</ErrorMessage>
        </>
    );
}

interface SubscriptionGateProps {
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

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

/** Defers rendering during initial load to prevent flashing upgrade prompts while access is verified. */
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

/** Defers child execution until subscription status loads to prevent flashing "Free Plan" before active Stripe data returns. */
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
