import { describe, expect, test } from "bun:test";
import { Router } from "express";
import type { PrismaClient } from "../../generated/prisma/client";
import { createCrudRouter } from "../../src/api/routerFactory.ts";
import { introspect } from "../../src/core/introspector.ts";
import type { FullRegisteredModel } from "../../src/core/registry.ts";
import type { AdminUser } from "../../src/core/types.ts";

type RecordData = Record<string, unknown>;

function matchesWhere(record: RecordData, where: RecordData): boolean {
   if (Array.isArray(where.AND)) return where.AND.every((condition) => matchesWhere(record, condition as RecordData));
   return Object.entries(where).every(([fieldName, value]) => fieldName === "AND" || record[fieldName] === value);
}

function selectRecord(record: RecordData, select: Record<string, true> | undefined): RecordData {
   if (!select) return { ...record };
   return Object.fromEntries(Object.keys(select).map((fieldName) => [fieldName, record[fieldName]]));
}

function createFakePrisma(records: RecordData[]) {
   const post = {
      async findMany(args: Record<string, unknown>) {
         const where = args.where as RecordData;
         const select = args.select as Record<string, true> | undefined;
         const skip = args.skip as number;
         const take = args.take as number;
         return records.filter((record) => matchesWhere(record, where)).slice(skip, skip + take).map((record) => selectRecord(record, select));
      },
      async findFirst(args: Record<string, unknown>) {
         const record = records.find((candidate) => matchesWhere(candidate, args.where as RecordData));
         return record ? selectRecord(record, args.select as Record<string, true> | undefined) : null;
      },
      async count(args: Record<string, unknown>) {
         return records.filter((record) => matchesWhere(record, args.where as RecordData)).length;
      },
      async create(args: Record<string, unknown>) {
         const record = { id: `post-${records.length + 1}`, published: false, ...(args.data as RecordData) };
         records.push(record);
         return selectRecord(record, args.select as Record<string, true> | undefined);
      },
      async updateMany(args: Record<string, unknown>) {
         const matchingRecords = records.filter((record) => matchesWhere(record, args.where as RecordData));
         for (const record of matchingRecords) Object.assign(record, args.data);
         return { count: matchingRecords.length };
      },
      async deleteMany(args: Record<string, unknown>) {
         const indexes = records.flatMap((record, index) => (matchesWhere(record, args.where as RecordData) ? [index] : []));
         for (const index of indexes.reverse()) records.splice(index, 1);
         return { count: indexes.length };
      },
   };

   return { post } as unknown as PrismaClient;
}

async function createPostRouter(records: RecordData[]): Promise<Router> {
   const postMeta = (await introspect()).get("Post");
   if (!postMeta) throw new Error("Expected the test Prisma schema to contain Post.");

   const model: FullRegisteredModel = {
      meta: postMeta,
      raw: {
         scope: async (adminUser) => ({ authorId: adminUser.id }),
         permissions: { list: ["ADMIN"], view: ["ADMIN"], create: ["ADMIN"], update: ["ADMIN"], delete: ["ADMIN"] },
      },
      resolved: {
         listDisplay: ["title", "published"],
         listFilter: [],
         searchFields: ["title"],
         defaultSort: { field: "createdAt", direction: "desc" },
         perPage: 25,
         fieldsets: [],
         permissions: { list: ["ADMIN"], view: ["ADMIN"], create: ["ADMIN"], update: ["ADMIN"], delete: ["ADMIN"] },
      },
   };

   return createCrudRouter(new Map([["posts", model]]), createFakePrisma(records));
}

async function dispatch(router: Router, method: string, url: string, adminUser?: AdminUser, body?: unknown): Promise<{ status: number; body: unknown }> {
   return new Promise((resolve, reject) => {
      const req = { method, url, originalUrl: url, query: {}, params: {}, body, adminUser };
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

const tenantA: AdminUser = { id: "tenant-a", email: "a@example.com", role: "ADMIN", isSuperAdmin: false };
const tenantB: AdminUser = { id: "tenant-b", email: "b@example.com", role: "ADMIN", isSuperAdmin: false };

describe("scalar CRUD scope integration", () => {
   test("does not let tenant A list, view, update, or delete tenant B's record", async () => {
      const records: RecordData[] = [
         { id: "post-a", title: "Tenant A post", content: null, published: false, authorId: "tenant-a", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
         { id: "post-b", title: "Tenant B post", content: null, published: false, authorId: "tenant-b", createdAt: "2026-01-02", updatedAt: "2026-01-02" },
      ];
      const router = await createPostRouter(records);

      const list = await dispatch(router, "GET", "/posts", tenantA);
      expect(list.status).toBe(200);
      expect((list.body as { records: RecordData[] }).records.map((record) => record.id)).toEqual(["post-a"]);

      expect((await dispatch(router, "GET", "/posts/post-b", tenantA)).status).toBe(404);
      expect((await dispatch(router, "PUT", "/posts/post-b", tenantA, { title: "Stolen" })).status).toBe(404);
      expect((await dispatch(router, "DELETE", "/posts/post-b", tenantA)).status).toBe(404);
      expect((await dispatch(router, "PUT", "/posts/post-a", tenantA, { authorId: "tenant-b" })).status).toBe(400);
      expect(records.find((record) => record.id === "post-a")?.authorId).toBe("tenant-a");
      expect(records.find((record) => record.id === "post-b")?.title).toBe("Tenant B post");
   });

   test("forces created records into the authenticated tenant and rejects anonymous requests", async () => {
      const records: RecordData[] = [];
      const router = await createPostRouter(records);

      expect((await dispatch(router, "GET", "/posts")).status).toBe(401);

      const created = await dispatch(router, "POST", "/posts", tenantA, { title: "A new post", published: true });
      expect(created.status).toBe(201);
      expect((created.body as RecordData).authorId).toBe("tenant-a");
      expect((await dispatch(router, "GET", "/posts/post-1", tenantB)).status).toBe(404);

      const updated = await dispatch(router, "PUT", "/posts/post-1", tenantA, { title: "Renamed post" });
      expect(updated.status).toBe(200);
      expect((updated.body as RecordData).title).toBe("Renamed post");
      expect((await dispatch(router, "DELETE", "/posts/post-1", tenantA)).status).toBe(204);
      expect(records).toHaveLength(0);
   });
});
