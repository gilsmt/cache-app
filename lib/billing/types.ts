export const PRICE_TYPES = ["free", "monthly", "yearly"] as const;

export type PriceType = (typeof PRICE_TYPES)[number];

export type PaidPriceType = Exclude<PriceType, "free">;
