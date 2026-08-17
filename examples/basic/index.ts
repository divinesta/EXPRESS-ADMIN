import express from "express";
import { PrismaPg } from "@prisma/adapter-pg";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "./generated/prisma/client";
// import { createAdmin } from "prisma-express-admin"
import { createAdmin } from "../../src/index.ts";

const port = Number(process.env.PORT ?? 3000);
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to start the development host.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const app = express();
const adminEmail = process.env.EXAMPLE_ADMIN_EMAIL ?? "ada@example.test";
const schemaPath = fileURLToPath(new URL("./prisma/schema.prisma", import.meta.url));

const admin = createAdmin({
  prisma,
  schemaPath,
  databaseProvider: "postgresql",
  siteName: "Express Admin",
  auth: {
    // Development-only identity. Set EXAMPLE_ADMIN_EMAIL to switch tenants.
    // Real applications must resolve this from their session or JWT.
    getCurrentUser: async () => {
      const user = await prisma.user.findUnique({ where: { email: adminEmail } });
      if (!user) return null;
      return { id: user.id, email: user.email, role: user.role, isSuperAdmin: user.role === "SUPER_ADMIN", tenantId: user.tenantId };
    },
  },
  audit: {
    write: async (event) => {
      await prisma.adminAuditLog.create({
        data: {
          eventType: event.type,
          modelName: event.modelName,
          recordIds: event.recordIds.map(String),
          actorId: event.actor.id,
          actorEmail: event.actor.email,
          actorRole: event.actor.role,
          metadata: event.metadata,
          createdAt: event.timestamp,
        },
      });
    },
  },
});

admin.register("User", {
  listDisplay: ["email", "fullName", "role", "isActive"],
  listFilter: ["role", "isActive"],
  searchFields: ["email", "fullName"],
  scope: async (adminUser) => (adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" }),
});

admin.register("Post", {
  listDisplay: ["title", "author", "published", "createdAt"],
  listFilter: ["published", "createdAt"],
  searchFields: ["title", "content"],
  scope: async (adminUser) => (adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" }),
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

const tenantScope = async (adminUser: { isSuperAdmin: boolean; tenantId?: string }) => (adminUser.isSuperAdmin ? {} : { tenantId: adminUser.tenantId ?? "__no_tenant__" });

admin.register("Customer", {
  listDisplay: ["email", "fullName", "company", "isActive", "createdAt"],
  listFilter: ["isActive", "createdAt"],
  searchFields: ["email", "fullName", "company"],
  scope: tenantScope,
});

admin.register("Category", {
  listDisplay: ["name", "description", "createdAt"],
  searchFields: ["name", "description"],
  scope: tenantScope,
});

admin.register("Product", {
  listDisplay: ["sku", "name", "category", "price", "stock", "status"],
  listFilter: ["status", "createdAt"],
  searchFields: ["sku", "name", "description"],
  scope: tenantScope,
});

admin.register("Order", {
  listDisplay: ["reference", "customer", "owner", "status", "total", "placedAt"],
  listFilter: ["status", "placedAt"],
  searchFields: ["reference"],
  scope: tenantScope,
});

admin.register("OrderItem", {
  listDisplay: ["order", "product", "quantity", "unitPrice", "createdAt"],
  searchFields: [],
  scope: async (adminUser) => (adminUser.isSuperAdmin ? {} : { order: { tenantId: adminUser.tenantId ?? "__no_tenant__" } }),
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
