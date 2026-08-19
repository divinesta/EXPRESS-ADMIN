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

const dispatchDeletePreview = (router: Router, ids: string) =>
   new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const req = { method: "GET", url: `/orders/actions/delete-preview?ids=${ids}`, originalUrl: `/orders/actions/delete-preview?ids=${ids}`, query: { ids }, params: {}, body: {}, adminUser };
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
   test("previews cascade children for selected records before deletion", async () => {
      const orderMeta: AdminModelMeta = {
         name: "Order",
         pluralName: "orders",
         prismaClientKey: "order",
         idField: "id",
         displayField: "reference",
         searchableFields: ["reference"],
         filterableFields: [],
         timestamps: {},
         fields: [
            { name: "id", type: "string", prismaType: "String", isId: true, isRequired: true, isUnique: true, isReadOnly: true, isList: false, isFilterable: false, isSearchable: false, defaultValue: null },
            { name: "reference", type: "string", prismaType: "String", isId: false, isRequired: true, isUnique: true, isReadOnly: false, isList: false, isFilterable: false, isSearchable: true, defaultValue: null },
            { name: "items", type: "relation", prismaType: "OrderItem", isId: false, isRequired: true, isUnique: false, isReadOnly: false, isList: true, isFilterable: false, isSearchable: false, defaultValue: null, relation: { model: "OrderItem", kind: "hasMany", relationName: "OrderToOrderItem", foreignKeyFields: [], displayField: "id" } },
         ],
      };
      const orderItemMeta: AdminModelMeta = {
         name: "OrderItem",
         pluralName: "orderitems",
         prismaClientKey: "orderItem",
         idField: "id",
         displayField: "id",
         searchableFields: [],
         filterableFields: [],
         timestamps: {},
         fields: [
            { name: "id", type: "string", prismaType: "String", isId: true, isRequired: true, isUnique: true, isReadOnly: true, isList: false, isFilterable: false, isSearchable: false, defaultValue: null },
            { name: "quantity", type: "number", prismaType: "Int", isId: false, isRequired: true, isUnique: false, isReadOnly: false, isList: false, isFilterable: false, isSearchable: false, defaultValue: null },
            { name: "orderId", type: "string", prismaType: "String", isId: false, isRequired: true, isUnique: false, isReadOnly: true, isList: false, isFilterable: true, isSearchable: false, defaultValue: null },
            { name: "order", type: "relation", prismaType: "Order", isId: false, isRequired: true, isUnique: false, isReadOnly: false, isList: false, isFilterable: false, isSearchable: false, defaultValue: null, relation: { model: "Order", kind: "belongsTo", relationName: "OrderToOrderItem", foreignKeyFields: ["orderId"], onDelete: "Cascade", displayField: "reference" } },
         ],
      };
      const orderModel: FullRegisteredModel = {
         meta: orderMeta,
         raw: {},
         resolved: { listDisplay: ["reference"], listFilter: [], searchFields: ["reference"], defaultSort: { field: "id", direction: "asc" }, perPage: 25, permissions: { delete: ["ADMIN"] } },
      };
      const orderItemModel: FullRegisteredModel = {
         meta: orderItemMeta,
         raw: {},
         resolved: { listDisplay: ["quantity"], listFilter: [], searchFields: [], defaultSort: { field: "id", direction: "asc" }, perPage: 25, permissions: { list: ["ADMIN"] } },
      };
      const prisma = {
         order: { findMany: async () => [{ id: "order-a", reference: "Order 00001" }] },
         orderItem: { findMany: async () => [{ id: "item-a", quantity: 2, orderId: "order-a" }] },
      } as PrismaLike;
      const router = createActionRouter(new Map([["orders", orderModel], ["orderitems", orderItemModel]]), prisma);

      const response = await dispatchDeletePreview(router, "order-a");
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
         records: [{ id: "order-a", reference: "Order 00001" }],
         relations: [{
            fieldName: "items",
            modelName: "OrderItem",
            recordsByParentId: { "order-a": [{ id: "item-a", quantity: 2, orderId: "order-a" }] },
         }],
      });
   });

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
               return { count: 1 };
            },
         },
      } as PrismaLike;
      const router = createActionRouter(new Map([["posts", model]]), prisma, { write: async (event) => { auditEvents.push(event); } });

      const response = await dispatch(router, { ids: ["post-a", "post-b"] }, "delete_selected");
      expect(response).toEqual({ status: 200, body: { message: "Deleted 2 records." } });
      expect(beforeDelete).toEqual(["post-a", "post-b"]);
      expect(afterDelete).toEqual(["post-a", "post-b"]);
      expect(deletedWhere).toEqual([
         { AND: [{ institutionId: "institution-a" }, { id: "post-a" }] },
         { AND: [{ institutionId: "institution-a" }, { id: "post-b" }] },
      ]);
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

   test("runs post-delete hooks and audit only for records actually deleted during a race", async () => {
      const afterDelete: string[] = [];
      const auditEvents: Array<{ recordIds: Array<string | number> }> = [];
      const model: FullRegisteredModel = {
         meta: postMeta,
         raw: { afterDelete: async (id) => void afterDelete.push(id) },
         resolved: { listDisplay: ["title"], listFilter: [], searchFields: ["title"], defaultSort: { field: "id", direction: "asc" }, perPage: 25, permissions: { delete: ["ADMIN"] } },
      };
      const prisma = {
         post: {
            findMany: async () => [{ id: "post-a" }, { id: "post-b" }],
            deleteMany: async ({ where }: { where: { AND: Array<Record<string, unknown>> } }) => ({ count: where.AND[1]?.id === "post-a" ? 1 : 0 }),
         },
      } as PrismaLike;
      const router = createActionRouter(new Map([["posts", model]]), prisma, { write: async (event) => { auditEvents.push(event); } });

      const response = await dispatch(router, { ids: ["post-a", "post-b"] }, "delete_selected");
      expect(response).toEqual({ status: 200, body: { message: "Deleted 1 record; some records changed before deletion." } });
      expect(afterDelete).toEqual(["post-a"]);
      expect(auditEvents[0]?.recordIds).toEqual(["post-a"]);
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
