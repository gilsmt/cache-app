import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "./client/client";

const globalForPrisma = global as unknown as {
    baseClient: PrismaClient;
};

/**
 * Short-lived serverless instances share the production database with preview
 * deployments, workflow runs, and the cron fan-out. Bound each instance's pool
 * so it contributes few connections, drop idle ones, and fail a connect attempt
 * instead of holding the function open until its timeout.
 */
const POOL_MAX_CONNECTIONS = 5;
const POOL_CONNECT_TIMEOUT_MS = 10_000;
const POOL_IDLE_TIMEOUT_MS = 10_000;

const connectionString = process.env.DATABASE_URL;

const adapter = new PrismaPg({
    allowExitOnIdle: true,
    connectionString,
    connectionTimeoutMillis: POOL_CONNECT_TIMEOUT_MS,
    idleTimeoutMillis: POOL_IDLE_TIMEOUT_MS,
    max: POOL_MAX_CONNECTIONS,
});

const prismaOptions: Prisma.PrismaClientOptions = {
    adapter,
};

const baseClient =
    globalForPrisma.baseClient || new PrismaClient(prismaOptions);

export const prisma = baseClient; /** .extends() goes here */

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.baseClient = baseClient;
}
