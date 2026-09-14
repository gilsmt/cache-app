import { withGTConfig } from "gt-next/config";
import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const contentSecurityPolicy = [
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
    {
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
    },
    {
        key: "X-Content-Type-Options",
        value: "nosniff",
    },
    {
        key: "X-Frame-Options",
        value: "SAMEORIGIN",
    },
    {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
    },
    {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
    },
    {
        key: "Content-Security-Policy",
        value: contentSecurityPolicy,
    },
];

const nextConfig: NextConfig = {
    cacheComponents: true,
    experimental: {
        serverActions: { bodySizeLimit: "8mb" },
        turbopackCjsTreeShaking: true,
        turbopackRustReactCompiler: true,
        turbopackSharedRuntime: true,
        useOffline: true,
        useTypeScriptCli: true,
    },
    async headers() {
        return [
            {
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, max-age=86400, stale-while-revalidate=604800",
                    },
                ],
                source: "/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif|woff|woff2|ttf|eot)",
            },
            {
                headers: [
                    { key: "Access-Control-Allow-Origin", value: "*" },
                    {
                        key: "Access-Control-Allow-Methods",
                        value: "GET, OPTIONS",
                    },
                    {
                        key: "Access-Control-Allow-Headers",
                        value: "Content-Type, Accept",
                    },
                ],
                source: "/.well-known/:path*",
            },
            {
                headers: [
                    { key: "Access-Control-Allow-Credentials", value: "false" },
                    { key: "Access-Control-Allow-Origin", value: "*" },
                    {
                        key: "Access-Control-Allow-Methods",
                        value: "GET, OPTIONS",
                    },
                    {
                        key: "Access-Control-Allow-Headers",
                        value: "Content-Type, Accept",
                    },
                ],
                source: "/api/auth/.well-known/:path*",
            },
            {
                headers: [...securityHeaders],
                source: "/(.*)",
            },
            {
                headers: [
                    {
                        key: "x-robots-tag",
                        value: "noindex",
                    },
                    {
                        key: "Cache-Control",
                        value: "public, max-age=86400, stale-while-revalidate=604800",
                    },
                ],
                source: "/(.*)\\.map$",
            },
        ];
    },
    images: {
        minimumCacheTTL: 2_678_400, // 31 days
        /**
         * Allowed `quality` values for next/image. 75 is the app-wide default;
         * 90 exists for large photographic marketing assets
         * where the default visibly softens texture.
         */
        qualities: [75, 90],
    },
    output:
        process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
    partialPrefetching: true,
    reactCompiler: true,
    async redirects() {
        return [
            {
                // better-auth 1.7 moved generic-OAuth callbacks from /oauth2/callback/:id to /callback/:id
                destination: "/api/auth/callback/:path*",
                permanent: false,
                source: "/api/auth/oauth2/callback/:path*",
            },
            {
                destination: "/library",
                permanent: true,
                source: "/collections",
            },
            {
                destination: "https://github.com/rortan134/cache-app",
                permanent: false,
                source: "/github",
            },
            {
                destination: "/legal/privacy-policy",
                permanent: true,
                source: "/privacy-policy",
            },
            {
                destination: "/legal/privacy-policy",
                permanent: true,
                source: "/privacy",
            },
            {
                destination: "/legal/terms-of-service",
                permanent: true,
                source: "/terms-of-service",
            },
            {
                destination: "/",
                permanent: true,
                source: "/manifesto",
            },
            {
                destination: "https://docs.cachd.app/docs/changelog",
                permanent: false,
                source: "/changelog",
            },
            {
                destination: "https://docs.cachd.app/docs/security",
                permanent: false,
                source: "/security",
            },
            {
                destination: "https://docs.cachd.app",
                permanent: true,
                source: "/docs",
            },
            {
                destination: "https://docs.cachd.app",
                permanent: true,
                source: "/support",
            },
            {
                destination: "https://docs.cachd.app",
                permanent: true,
                source: "/help",
            },
        ];
    },
    async rewrites() {
        return [
            {
                destination: "/llms.txt",
                source: "/llms-full.txt",
            },
        ];
    },
};

export default withWorkflow(
    withGTConfig(nextConfig, {
        getLocalePath: "./get-locale.ts",
        getRegionPath: "./get-region.ts",
        loadTranslationsPath: "./load-translations.ts",
    })
);
