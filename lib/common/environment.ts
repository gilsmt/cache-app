/**
 * Adapted subset of `std-env`.
 */

/** Name of the current JavaScript runtime (Wintercg runtime-keys proposal). */
export type RuntimeName =
    | "node"
    | "bun"
    | "deno"
    | "workerd"
    | "edge-light"
    | "netlify"
    | "fastly";

const env: Record<string, string | undefined> =
    globalThis.process?.env ?? Object.create(null);

// Keep direct access so bundlers can replace NODE_ENV at build time.
const NODE_ENV: string | undefined =
    typeof process !== "undefined" && process.env
        ? process.env.NODE_ENV
        : undefined;

/** Detect if the global `window` object is available (i.e. browser-like). */
export const hasWindow: boolean = typeof window !== "undefined";

/** Detect if the current environment is production (`NODE_ENV=production`). */
export const isProduction: boolean = NODE_ENV === "production";

/**
 * Detect if the current environment is a test run
 * (`NODE_ENV=test` or `TEST` environment variable set).
 */
export const isTest: boolean = NODE_ENV === "test" || !!env.TEST;

/** Detect if the current environment is development (`NODE_ENV=dev` or `development`). */
export const isDevelopment: boolean =
    NODE_ENV === "dev" || NODE_ENV === "development";

/**
 * Runtime detectors in check order: the first truthy predicate wins. The order
 * mirrors `std-env` so edge runtimes are classified before their Node.js
 * compatibility shims can be observed.
 */
const RUNTIME_DETECTORS: [isRuntime: boolean, name: RuntimeName][] = [
    ["Netlify" in globalThis, "netlify"],
    ["EdgeRuntime" in globalThis, "edge-light"],
    [globalThis.navigator?.userAgent === "Cloudflare-Workers", "workerd"],
    ["fastly" in globalThis, "fastly"],
    ["Deno" in globalThis, "deno"],
    ["Bun" in globalThis, "bun"],
    [!!globalThis.process?.versions?.node, "node"],
];

/**
 * Name of the detected runtime, or an empty string when it cannot be
 * determined.
 */
export const runtime: RuntimeName | "" = detectRuntime();

function detectRuntime(): RuntimeName | "" {
    const detected = RUNTIME_DETECTORS.find(([isRuntime]) => isRuntime);
    return detected?.[1] ?? "";
}
