import Stripe from "stripe";
import { createLogger } from "@/lib/common/logs/console/logger";
import { StripeError } from "./error";

const log = createLogger("Stripe:client");

let stripeInstance: Stripe | null = null;

/**
 * Get configured Stripe client instance.
 * @throws {StripeError} If STRIPE_SECRET_KEY is missing
 */
export const getStripeClient = (): Stripe => {
    if (stripeInstance) {
        return stripeInstance;
    }

    const key = process.env.STRIPE_SECRET_KEY;

    if (!key) {
        throw new StripeError({
            message: "Stripe disabled: Missing STRIPE_SECRET_KEY",
            operation: "core::getStripeClient",
        });
    }

    if (key.startsWith("sk_live_") && process.env.NODE_ENV !== "production") {
        throw new StripeError({
            message:
                "Live Stripe secret key detected in a non-production environment. " +
                "Use a test key (sk_test_*) for development and CI.",
            operation: "core::getStripeClient",
        });
    }

    stripeInstance = new Stripe(key, {
        apiVersion: "2026-08-26.dahlia",
        typescript: true,
    });

    return stripeInstance;
};

type WithStripeCallback<T> = (client: Stripe) => Promise<T> | T;

/**
 * Executes a callback with the Stripe client, normalizing errors to StripeError.
 * @throws {StripeError} If Stripe is not configured or the callback fails
 */
export const withStripe = async <T>(
    callbackFn: WithStripeCallback<T>
): Promise<T> => {
    try {
        const client = getStripeClient();
        return await callbackFn(client);
    } catch (error) {
        log.error("Stripe operation failed:", error);

        if (StripeError.isInstance(error)) {
            throw error;
        }

        throw new StripeError(
            {
                message: error instanceof Error ? error.message : String(error),
                operation: "core::withStripe",
            },
            { cause: error }
        );
    }
};

export const getStripeWebhookSecret = (): string => {
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
        throw new StripeError({
            message: "Stripe webhook secret is not set",
            operation: "core::getStripeWebhookSecret",
        });
    }
    return process.env.STRIPE_WEBHOOK_SECRET;
};
