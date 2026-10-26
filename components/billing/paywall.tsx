import { T, Var } from "gt-next";
import { ArrowUpRight } from "lucide-react";
import {
    CloudHostOnly,
    SubscriptionUpgradeButton,
} from "@/components/billing/subscription";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export function InlinePaywallBanner() {
    return (
        <CloudHostOnly>
            <Alert className="grid-cols-[calc(var(--spacing)*10)_1fr_auto]">
                <Badge>PRO</Badge>
                <AlertTitle className="inline-flex items-center text-sm">
                    <T>Upgrade for full access to Cache and all integrations</T>
                    &nbsp;—&nbsp;
                    <SubscriptionUpgradeButton
                        className="p-0 underline"
                        size="sm"
                        variant="link"
                    >
                        <T>Get Pro</T>
                        <ArrowUpRight className="text-muted-foreground ml-auto inline-block size-4 shrink-0" />
                    </SubscriptionUpgradeButton>
                </AlertTitle>
            </Alert>
        </CloudHostOnly>
    );
}

interface BlockPaywallBannerProps {
    length: number;
}

export function BlockPaywallBanner({ length }: BlockPaywallBannerProps) {
    return (
        <CloudHostOnly>
            <aside className="sticky top-20 z-20 -mx-2 sm:-mx-4">
                <div className="bg-background rounded-lg px-6 py-10 shadow-xl/10 sm:px-10">
                    <div className="mx-auto flex max-w-2xl flex-col items-center justify-center gap-y-10 text-center">
                        <div className="flex flex-col items-center gap-y-5">
                            <h1 className="text-3xl font-semibold md:text-4xl">
                                <T>
                                    Access all <Var>{length}</Var> bookmarks.
                                </T>
                            </h1>
                            <T>
                                <p className="text-muted-foreground max-w-xl text-sm text-balance sm:text-base">
                                    Keep exploring the whole library, unlock
                                    full browsing &amp; pro features from{" "}
                                    <span className="text-foreground font-semibold">
                                        8€/month
                                    </span>{" "}
                                    — cancel anytime.
                                </p>
                            </T>
                            <div className="flex flex-col items-center gap-2">
                                <SubscriptionUpgradeButton
                                    billingFrequency="monthly"
                                    className="mx-auto w-fit rounded-full"
                                    size="xl"
                                >
                                    <T>Get Pro Monthly</T>
                                    <ArrowUpRight className="text-muted-foreground ml-auto inline-block size-4 shrink-0" />
                                </SubscriptionUpgradeButton>
                                <SubscriptionUpgradeButton
                                    billingFrequency="yearly"
                                    className="text-muted-foreground hover:text-foreground mx-auto w-fit text-sm underline underline-offset-2"
                                    size="sm"
                                    variant="link"
                                >
                                    <T>or save with yearly billing</T>
                                </SubscriptionUpgradeButton>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>
        </CloudHostOnly>
    );
}
