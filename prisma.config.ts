import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

if (existsSync(".env")) {
    process.loadEnvFile(".env");
}

const DATABASE_URL = new URL(process.env.DIRECT_URL ?? env("DATABASE_URL"));

// Prisma Migrate needs a session connection to hold its advisory lock.
if (DATABASE_URL.hostname === "pooled.db.prisma.io") {
    DATABASE_URL.hostname = "db.prisma.io";
}

export default defineConfig({
    datasource: { url: DATABASE_URL.toString() },
    migrations: { path: "prisma/migrations" },
    schema: "prisma/schema.prisma",
});
