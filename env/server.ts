import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import * as z from "zod";

export const serverEnv = createEnv({
    emptyStringAsUndefined: true,
    experimental__runtimeEnv: process.env,
    extends: [vercel()],
    server: {
        AI_GATEWAY_API_KEY: z.string().optional(),
        ARCJET_KEY: z.string().startsWith("ajkey_").optional(),
        BETTER_AUTH_SECRET: z.string().optional(),
        BETTER_AUTH_URL: z.url().optional(),
        /** Comma-separated vendor-qualified fallback models used after CACHE_AI_MODEL fails. */
        CACHE_AI_FALLBACK_MODELS: z.string().optional(),
        /** Self-host AI model override. Vendor-qualified, e.g. google/gemini-3.5-flash-lite. */
        CACHE_AI_MODEL: z
            .string()
            .regex(/^[a-z0-9][a-z0-9-]*\/[a-z0-9._/-]+$/i)
            .optional(),
        /** Optional override for local/unpacked Chrome extension origin trust. */
        CACHE_EXTENSION_ID: z
            .string()
            .regex(/^[a-p]{32}$/)
            .optional(),
        CRON_SECRET: z.string().optional(),
        DATABASE_URL: z
            .string()
            .regex(
                /^postgres(ql)?:\/\//,
                "DATABASE_URL must start with postgres:// or postgresql://"
            ),
        DISABLE_AUTH: z
            .enum(["true", "false"])
            .default("false")
            .transform((value) => value === "true"),
        EMAIL_FROM: z.string().optional(),
        EMAIL_SERVER_HOST: z.string().optional(),
        EMAIL_SERVER_PASSWORD: z.string().optional(),
        EMAIL_SERVER_PORT: z.string().optional(),
        EMAIL_SERVER_USER: z.string().optional(),
        GEMINI_API_KEY: z.string().optional(),
        GITHUB_CLIENT_ID: z.string().optional(),
        GITHUB_CLIENT_SECRET: z.string().optional(),
        GOOGLE_CLIENT_ID: z.string().optional(),
        GOOGLE_CLIENT_SECRET: z.string().startsWith("G").optional(),
        GT_API_KEY: z.string().optional(),
        GT_PROJECT_ID: z.string().optional(),
        NOTION_CLIENT_ID: z.string().optional(),
        NOTION_CLIENT_SECRET: z.string().optional(),
        PINTEREST_CLIENT_ID: z.string().optional(),
        PINTEREST_CLIENT_SECRET: z.string().optional(),
        RESEND_API_KEY: z.string().optional(),
        STRIPE_PRICE_ID_MONTHLY: z.string().startsWith("price_").optional(),
        STRIPE_PRICE_ID_YEARLY: z.string().startsWith("price_").optional(),
        STRIPE_SECRET_KEY: z.string().startsWith("sk_").optional(),
        STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
        TAVILY_API_KEY: z.string().optional(),
        /** Comma-separated extra origins trusted by better-auth (CORS/CSRF). */
        TRUSTED_ORIGINS: z.string().optional(),
        X_CLIENT_ID: z.string().optional(),
        X_CLIENT_SECRET: z.string().optional(),
    },
    shared: {
        NODE_ENV: z.enum(["development", "test", "production"]),
    },
});
