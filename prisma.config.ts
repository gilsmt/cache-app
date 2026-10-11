import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

if (existsSync(".env")) {
    process.loadEnvFile(".env");
}

const DATABASE_URL = new URL(env("DATABASE_URL"));

if (!DATABASE_URL) {
    throw new Error("DATABASE_URL env is not set.");
}

export default defineConfig({
    datasource: { url: DATABASE_URL.href },
});
