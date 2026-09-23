import { spawnSync } from "node:child_process";

/**
 * Vercel sets `VERCEL_ENV` to "production" only for the production branch
 * deployment. Preview deployments share the production `DATABASE_URL`, so only
 * the production build may apply migrations.
 */
export function shouldApplyMigrations(vercelEnv: string | undefined): boolean {
    return vercelEnv === "production";
}

/**
 * Applies pending migrations during the production build. A failed migration
 * fails the build, so the previous deployment keeps serving instead of new code
 * running against an unmigrated database.
 */
function applyMigrations(): void {
    const result = spawnSync("bun", ["run", "db-deploy"], {
        stdio: "inherit",
    });
    if (result.status !== 0) {
        throw new Error(`prisma migrate deploy failed (exit ${result.status})`);
    }
}

if (import.meta.main && shouldApplyMigrations(process.env.VERCEL_ENV)) {
    applyMigrations();
}
