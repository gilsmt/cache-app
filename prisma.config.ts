import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

if (existsSync(".env")) {
    process.loadEnvFile(".env");
}

export default defineConfig({
    datasource: { url: env("DIRECT_DATABASE_URL") },
    migrations: { path: "prisma/migrations" },
    schema: "prisma/schema.prisma",
});
