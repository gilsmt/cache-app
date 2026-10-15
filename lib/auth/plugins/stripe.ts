import { stripe } from "@better-auth/stripe";
import { serverEnv } from "@/env/server";
import { getStripeClient, getStripeWebhookSecret } from "@/lib/billing/client";
import { getPlanPriceIds } from "@/lib/billing/prices";

export function getStripeAuthPlugin() {
    if (serverEnv.SELF_HOSTED) {
        return null;
    }

    const planPriceIds = getPlanPriceIds();

    return stripe({
        createCustomerOnSignUp: true,
        stripeClient: getStripeClient(),
        stripeWebhookSecret: getStripeWebhookSecret(),
        // NOTE: The @better-auth/stripe plugin registers its webhook handler
        // implicitly at /api/auth/stripe/webhook via the catch-all [...all]
        // route in app/api/auth/[...all]/route.ts. Configure the Stripe
        // Dashboard endpoint to exactly: {baseURL}/api/auth/stripe/webhook
        subscription: {
            enabled: true,
            plans: [
                {
                    annualDiscountPriceId: planPriceIds.yearly,
                    name: "pro",
                    priceId: planPriceIds.monthly,
                },
            ],
        },
    });
}
