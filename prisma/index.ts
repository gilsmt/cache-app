import { PrismaPg } from "@prisma/adapter-pg";
import { type Prisma, PrismaClient } from "./client/client";

const globalForPrisma = global as unknown as {
    baseClient: PrismaClient;
};

const connectionString = process.env.DATABASE_URL;

const adapter = new PrismaPg({ connectionString });

const prismaOptions: Prisma.PrismaClientOptions = {
    adapter,
};

const baseClient =
    globalForPrisma.baseClient || new PrismaClient(prismaOptions);

export const prisma = baseClient; /** .extends() goes here */

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.baseClient = baseClient;
}
