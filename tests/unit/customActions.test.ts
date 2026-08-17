import { describe, expect, test } from "bun:test";
import type { Router } from "express";
import { createActionRouter } from "../../src/api/actionRouter.ts";
import type { FullRegisteredModel } from "../../src/core/registry.ts";
import type { AdminModelMeta, AdminUser, PrismaLike } from "../../src/core/types.ts";

const adminUser: AdminUser = { id: "admin-a", email: "admin@example.test", role: "ADMIN", isSuperAdmin: false };

const postMeta: AdminModelMeta = {
   name: "Post",
   pluralName: "posts",
   prismaClientKey: "post",
   idField: "id",
   displayField: "title",
   searchableFields: ["title"],
   filterableFields: [],
   timestamps: {},
   fields: [
      { name: "id", type: "string", prismaType: "String", isId: true, isRequired: true, isUnique: true, isReadOnly: true, isList: false, isFilterable: false, isSearchable: false, defaultValue: null },
      { name: "title", type: "string", prismaType: "String", isId: false, isRequired: true, isUnique: false, isReadOnly: false, isList: false, isFilterable: false, isSearchable: true, defaultValue: null },
   ],
};

const dispatch = (router: Router, body: Record<string, unknown>, action = "publish_selected") =>
   new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const req = { method: "POST", url: `/posts/actions/${action}`, originalUrl: `/posts/actions/${action}`, query: {}, params: {}, body, adminUser };
      const res = {
         statusCode: 200,
         status(status: number) {
            this.statusCode = status;
            return this;
         },
         json(responseBody: Record<string, unknown>) {
            resolve({ status: this.statusCode, body: responseBody });
            return this;
         },
      };
      (router as unknown as { handle: (request: unknown, response: unknown, next: (error?: unknown) => void) => void }).handle(req, res, reject);
   });

describe("custom actions", () => {
   test("deletes selected records through the built-in, scoped action", async () => {
      const deletedWhere: unknown[] = [];
      const beforeDelete: string[] = [];
      const afterDelete: string[] = [];
      const auditEvents: Array<{ type: string; recordIds: Array<string | number> }> = [];
      const model: FullRegisteredModel = {
         meta: postMeta,
         raw: {
            scope: async () => ({ institutionId: "institution-a" }),
            beforeDelete: async (id) => void beforeDelete.push(id),
            afterDelete: async (id) => void afterDelete.push(id),
         },
         resolved: { listDisplay: ["title"], listFilter: [], searchFields: ["title"], defaultSort: { field: "id", direction: "asc" }, perPage: 25, permissions: { delete: ["ADMIN"] } },
      };
      const prisma = {
         post: {
            findMany: async () => [{ id: "post-a" }, { id: "post-b" }],
            deleteMany: async ({ where }: { where: unknown }) => {
               deletedWhere.push(where);
               return { count: 2 };
            },
         },
      } as PrismaLike;
      const router = createActionRouter(new Map([["posts", model]]), prisma, { write: async (event) => { auditEvents.push(event); } });

      const response = await dispatch(router, { ids: ["post-a", "post-b"] }, "delete_selected");
      expect(response).toEqual({ status: 200, body: { message: "Deleted 2 records." } });
      expect(beforeDelete).toEqual(["post-a", "post-b"]);
      expect(afterDelete).toEqual(["post-a", "post-b"]);
      expect(deletedWhere).toEqual([{ AND: [{ institutionId: "institution-a" }, { id: { in: ["post-a", "post-b"] } }] }]);
      expect(auditEvents[0]).toMatchObject({ type: "delete", recordIds: ["post-a", "post-b"] });
   });

   test("runs only after every selected record is found inside the model scope", async () => {
      let handlerIds: Array<string | number> = [];
      let actionWhere: unknown;
      const auditEvents: Array<{ type: string; modelName: string; recordIds: Array<string | number>; metadata?: Record<string, unknown> }> = [];
      const model: FullRegisteredModel = {
         meta: postMeta,
         raw: {
            scope: async () => ({ institutionId: "institution-a" }),
            actions: [
               {
                  name: "publish_selected",
                  label: "Publish selected posts",
                  allowedRoles: ["ADMIN"],
                  handler: async ({ ids }) => {
                     handlerIds = ids;
                     return { message: `Published ${ids.length} posts.` };
                  },
               },
            ],
         },
         resolved: { listDisplay: ["title"], listFilter: [], searchFields: ["title"], defaultSort: { field: "id", direction: "asc" }, perPage: 25, permissions: { actions: { publish_selected: ["ADMIN"] } } },
      };
      const prisma = {
         post: {
            findMany: async (args: { where: unknown }) => {
               actionWhere = args.where;
               return [{ id: "post-a" }, { id: "post-b" }];
            },
         },
      } as PrismaLike;
      const router = createActionRouter(new Map([["posts", model]]), prisma, { write: async (event) => { auditEvents.push(event); } });

      const response = await dispatch(router, { ids: ["post-a", "post-b"] });
      expect(response).toEqual({ status: 200, body: { message: "Published 2 posts." } });
      expect(handlerIds).toEqual(["post-a", "post-b"]);
      expect(actionWhere).toEqual({ AND: [{ institutionId: "institution-a" }, { id: { in: ["post-a", "post-b"] } }] });
      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0]).toMatchObject({ type: "action", modelName: "Post", recordIds: ["post-a", "post-b"], metadata: { action: "publish_selected" } });
   });

   test("does not execute when a selected record falls outside scope", async () => {
      let executions = 0;
      const model: FullRegisteredModel = {
         meta: postMeta,
         raw: { actions: [{ name: "publish_selected", label: "Publish selected posts", handler: async () => { executions += 1; return { message: "Unexpected" }; } }] },
         resolved: { listDisplay: ["title"], listFilter: [], searchFields: ["title"], defaultSort: { field: "id", direction: "asc" }, perPage: 25, permissions: { actions: { publish_selected: ["ADMIN"] } } },
      };
      const prisma = { post: { findMany: async () => [{ id: "post-a" }] } } as PrismaLike;
      const router = createActionRouter(new Map([["posts", model]]), prisma);

      const response = await dispatch(router, { ids: ["post-a", "post-outside-scope"] });
      expect(response).toEqual({ status: 400, body: { error: "One or more selected records are unavailable.", code: "VALIDATION_ERROR" } });
      expect(executions).toBe(0);
   });
});
