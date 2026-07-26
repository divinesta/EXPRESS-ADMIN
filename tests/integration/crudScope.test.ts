import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { Router } from "express";
import { PrismaClient } from "../../generated/prisma/client";
import { createCrudRouter } from "../../src/api/routerFactory.ts";
import { introspect } from "../../src/core/introspector.ts";
import type { FullRegisteredModel } from "../../src/core/registry.ts";
import type { AdminUser } from "../../src/core/types.ts";

const databaseUrl = process.env.DATABASE_URL;
const tenantA: AdminUser = { id: "integration-tenant-a", email: "tenant-a@example.test", role: "ADMIN", isSuperAdmin: false };
const tenantB: AdminUser = { id: "integration-tenant-b", email: "tenant-b@example.test", role: "ADMIN", isSuperAdmin: false };

async function createPostRouter(prisma: PrismaClient): Promise<Router> {
   const postMeta = (await introspect()).get("Post");
   if (!postMeta) throw new Error("Expected the test Prisma schema to contain Post.");

   const permissions = { list: ["ADMIN"], view: ["ADMIN"], create: ["ADMIN"], update: ["ADMIN"], delete: ["ADMIN"] };
   const model: FullRegisteredModel = {
      meta: postMeta,
      raw: { scope: async (adminUser) => ({ authorId: adminUser.id }), permissions },
      resolved: {
         listDisplay: ["title", "author", "published"],
         listFilter: ["published", "createdAt"],
         searchFields: ["title"],
         defaultSort: { field: "createdAt", direction: "desc" },
         perPage: 25,
         fieldsets: [],
         permissions,
      },
   };

   return createCrudRouter(new Map([["posts", model]]), prisma, "postgresql");
}

async function dispatch(router: Router, method: string, url: string, adminUser?: AdminUser, body?: unknown): Promise<{ status: number; body: unknown }> {
   return new Promise((resolve, reject) => {
      const requestUrl = new URL(url, "http://integration.test");
      const req = { method, url, originalUrl: url, query: Object.fromEntries(requestUrl.searchParams), params: {}, body, adminUser };
      const res = {
         statusCode: 200,
         status(status: number) {
            this.statusCode = status;
            return this;
         },
         json(bodyValue: unknown) {
            resolve({ status: this.statusCode, body: bodyValue });
            return this;
         },
         end() {
            resolve({ status: this.statusCode, body: undefined });
            return this;
         },
      };

      (router as unknown as { handle: (req: unknown, res: unknown, next: (error?: unknown) => void) => void }).handle(req, res, reject);
   });
}

if (!databaseUrl) {
   test.skip("real PostgreSQL CRUD integration requires DATABASE_URL", () => {});
} else {
   const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
   let router: Router;

   async function resetDatabase() {
      await prisma.post.deleteMany({ where: { authorId: { in: [tenantA.id, tenantB.id] } } });
      await prisma.user.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
   }

   async function seedTenants() {
      await prisma.user.createMany({
         data: [
            { id: tenantA.id, email: tenantA.email, fullName: "Integration Tenant A" },
            { id: tenantB.id, email: tenantB.email, fullName: "Integration Tenant B" },
         ],
      });
   }

   describe("scalar CRUD scope integration with PostgreSQL", () => {
      beforeAll(async () => {
         await prisma.$connect();
         router = await createPostRouter(prisma);
      });

      afterEach(resetDatabase);
      afterAll(async () => {
         await resetDatabase();
         await prisma.$disconnect();
      });

      test("does not let tenant A list, view, update, or delete tenant B's record", async () => {
         await seedTenants();
         await prisma.post.createMany({
            data: [
               { id: "integration-post-a", title: "Tenant A post", authorId: tenantA.id },
               { id: "integration-post-b", title: "Tenant B post", authorId: tenantB.id },
            ],
         });

         const list = await dispatch(router, "GET", "/posts", tenantA);
         expect(list.status).toBe(200);
         expect((list.body as { records: Array<{ id: string }> }).records.map((record) => record.id)).toEqual(["integration-post-a"]);

         expect((await dispatch(router, "GET", "/posts/integration-post-b", tenantA)).status).toBe(404);
         expect((await dispatch(router, "PUT", "/posts/integration-post-b", tenantA, { title: "Stolen" })).status).toBe(404);
         expect((await dispatch(router, "DELETE", "/posts/integration-post-b", tenantA)).status).toBe(404);
         expect((await dispatch(router, "PUT", "/posts/integration-post-a", tenantA, { authorId: tenantB.id })).status).toBe(400);
         expect((await prisma.post.findUniqueOrThrow({ where: { id: "integration-post-b" } })).title).toBe("Tenant B post");
      });

      test("forces created records into the authenticated tenant and allows its own mutations", async () => {
         await seedTenants();

         expect((await dispatch(router, "GET", "/posts")).status).toBe(401);

         const created = await dispatch(router, "POST", "/posts", tenantA, { title: "A new post", published: true });
         expect(created.status).toBe(201);
         const record = created.body as { id: string; authorId: string };
         expect(record.authorId).toBe(tenantA.id);
         expect((await dispatch(router, "GET", `/posts/${record.id}`, tenantB)).status).toBe(404);

         const updated = await dispatch(router, "PUT", `/posts/${record.id}`, tenantA, { title: "Renamed post" });
         expect(updated.status).toBe(200);
         expect((await prisma.post.findUniqueOrThrow({ where: { id: record.id } })).title).toBe("Renamed post");
         expect((await dispatch(router, "DELETE", `/posts/${record.id}`, tenantA)).status).toBe(204);
         expect(await prisma.post.count({ where: { id: record.id } })).toBe(0);
      });

      test("uses declared filters, date ranges, search fields, and relation display reads", async () => {
         await seedTenants();
         await prisma.post.createMany({
            data: [
               { id: "integration-search-report", title: "Quarterly Report", published: true, authorId: tenantA.id, createdAt: new Date("2026-04-15T00:00:00.000Z") },
               { id: "integration-search-draft", title: "Draft Notes", published: false, authorId: tenantA.id, createdAt: new Date("2026-01-15T00:00:00.000Z") },
            ],
         });

         const searched = await dispatch(router, "GET", "/posts?search=quarterly", tenantA);
         expect(searched.status).toBe(200);
         expect((searched.body as { records: Array<{ id: string; author: { email: string } }> }).records.map((record) => ({ id: record.id, author: record.author }))).toEqual([
            { id: "integration-search-report", author: { email: tenantA.email } },
         ]);

         const filtered = await dispatch(router, "GET", "/posts?published=true&createdAt_gte=2026-03-01T00%3A00%3A00.000Z", tenantA);
         expect(filtered.status).toBe(200);
         expect((filtered.body as { records: Array<{ id: string }> }).records.map((record) => record.id)).toEqual(["integration-search-report"]);
         const disallowedFilter = await dispatch(router, "GET", "/posts?authorId=integration-tenant-b", tenantA);
         expect(disallowedFilter).toEqual({
            status: 400,
            body: { error: "Filter \"authorId\" is not allowed for this model.", code: "VALIDATION_ERROR" },
         });
      });
   });
}
