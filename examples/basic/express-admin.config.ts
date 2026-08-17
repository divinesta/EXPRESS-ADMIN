import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to create an Express Admin superuser.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

export default {
   prisma,
   auth: {
      mode: "built-in" as const,
      identifier: "email" as const,
      secureCookies: false,
   },
};
