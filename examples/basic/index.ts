import express from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";
import { createAdmin } from "../../src/index.ts";

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
  actions: [
    {
      name: "publish_selected",
      label: "Publish selected posts",
      allowedRoles: ["SUPER_ADMIN", "ADMIN"],
      handler: async ({ ids, prisma }) => {
        const result = await (prisma as PrismaClient).post.updateMany({
          where: { id: { in: ids.map(String) } },
          data: { published: true },
        });
        return { message: `Published ${result.count} ${result.count === 1 ? "post" : "posts"}.` };
      },
    },
    {
      name: "unpublish_selected",
      label: "Move selected posts to draft",
      allowedRoles: ["SUPER_ADMIN", "ADMIN"],
      handler: async ({ ids, prisma }) => {
        const result = await (prisma as PrismaClient).post.updateMany({
          where: { id: { in: ids.map(String) } },
          data: { published: false },
        });
        return { message: `Moved ${result.count} ${result.count === 1 ? "post" : "posts"} to draft.` };
      },
    },
  ],
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
