import { serverEnv } from "@/env/server";
import { withStripe } from "@/lib/billing/client";
import { StripeError } from "@/lib/billing/error";
import type { PaidPriceType } from "./types";

export async function getPlanPriceById(priceId: string) {
    const price = await withStripe((stripe) => stripe.prices.retrieve(priceId));

    if (price.type !== "recurring" || !price.recurring?.interval) {
        throw new StripeError({
            message: `Configured price '${priceId}' is not recurring (type=${price.type}).`,
            operation: "prices::retrievePriceById",
        });
    }

    const currency = price.currency.toUpperCase();
    if (price.unit_amount === null) {
        throw new StripeError({
            message: `Configured price '${priceId}' has no unit amount.`,
            operation: "prices::retrievePriceById",
        });
    }

    return {
        amountCents: price.unit_amount,
        currency,
        id: price.id,
        interval: price.recurring.interval,
        nickname: price.nickname ?? null,
    };
}

export function getPlanPriceIds(): Record<PaidPriceType, string> {
    return {
        monthly: requirePlanPriceId(
            serverEnv.STRIPE_PRICE_ID_MONTHLY,
            "STRIPE_PRICE_ID_MONTHLY"
        ),
        yearly: requirePlanPriceId(
            serverEnv.STRIPE_PRICE_ID_YEARLY,
            "STRIPE_PRICE_ID_YEARLY"
        ),
    };
}

function requirePlanPriceId(value: string | undefined, name: string): string {
    if (!value) {
        throw new StripeError({
            message: `Missing required environment variable: ${name}`,
            operation: "prices::getPlanPriceIds",
        });
    }
    return value;
}

export async function getPlanPrices() {
    const prices = getPlanPriceIds();

    const [monthly, yearly] = await Promise.all([
        getPlanPriceById(prices.monthly),
        getPlanPriceById(prices.yearly),
    ]);

    return { monthly, yearly };
}

export async function getProducts() {
    const products = await withStripe(
        async (stripe) =>
            await stripe.products.list({
                active: true,
                expand: ["data.default_price"],
            })
    );

    return products.data.map((product) => ({
        defaultPriceId:
            typeof product.default_price === "string"
                ? product.default_price
                : product.default_price?.id,
        description: product.description,
        id: product.id,
        name: product.name,
    }));
}

const STRIPE_FEE_PERCENT = 0.044;
const STRIPE_FEE_FLAT_CENTS = 30;
const STRIPE_FEE_NET_MULTIPLIER = 1 - STRIPE_FEE_PERCENT;

export function calculatePriceFeeInCents(netAmountCents: number) {
    return Math.round(
        ((netAmountCents + STRIPE_FEE_FLAT_CENTS) / STRIPE_FEE_NET_MULTIPLIER) *
            STRIPE_FEE_PERCENT +
            STRIPE_FEE_FLAT_CENTS
    );
}
