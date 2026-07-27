import express from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { createAdmin } from "./src/index.ts";

const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to start the development host.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const app = express();

const admin = createAdmin({
  prisma,
  databaseProvider: "postgresql",
  siteName: "Express Admin",
  auth: {
    // Development-only identity. Replace this with your host application's
    // session or JWT adapter before using the admin outside local development.
    getCurrentUser: async () => ({
      id: "local-development-admin",
      email: "admin@localhost.test",
      role: "SUPER_ADMIN",
      isSuperAdmin: true,
    }),
  },
});

admin.register("User", {
  listDisplay: ["email", "fullName", "role", "isActive", "createdAt"],
  searchFields: ["email", "fullName"],
});
admin.register("Post", {
  listDisplay: ["title", "author", "published", "createdAt"],
  searchFields: ["title", "content"],
});

await admin.mount(app);

const server = app.listen(port, () => {
  console.log(`Development host running at http://localhost:${port}/admin`);
});

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
};

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
