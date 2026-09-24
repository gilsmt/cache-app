import { spawnSync } from "node:child_process";

/**
 * Vercel sets `VERCEL_ENV` to "production" only for the production deployment.
 * Preview deployments share the production database, so only the production
 * build may apply migrations.
 */
export function shouldApplyMigrations(vercelEnv: string | undefined): boolean {
    return vercelEnv === "production";
}

/**
 * A failed migration fails the build. Vercel then keeps the current release
 * serving instead of promoting code that expects a newer schema.
 */
function applyMigrations(): void {
    const { status } = spawnSync("bun", ["run", "db-deploy"], {
        stdio: "inherit",
    });
    if (status !== 0) {
        throw new Error(`Database migration failed (exit ${status}).`);
    }
}

if (import.meta.main && shouldApplyMigrations(process.env.VERCEL_ENV)) {
    applyMigrations();
}
