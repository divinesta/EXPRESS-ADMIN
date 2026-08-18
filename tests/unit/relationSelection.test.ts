import { describe, expect, test } from "bun:test";
import type { Router } from "express";
import { createCrudRouter } from "../../src/api/routerFactory.ts";
import type { FullRegisteredModel } from "../../src/core/registry.ts";
import type { AdminModelMeta, AdminUser, PrismaLike } from "../../src/core/types.ts";

const adminUser: AdminUser = { id: "admin-a", email: "admin@example.test", role: "ADMIN", isSuperAdmin: false };

const userMeta: AdminModelMeta = {
   name: "User",
   pluralName: "users",
   prismaClientKey: "user",
   idField: "id",
   displayField: "email",
   searchableFields: ["email"],
   filterableFields: [],
   timestamps: {},
   fields: [
      { name: "id", type: "string", prismaType: "String", isId: true, isRequired: true, isUnique: true, isReadOnly: true, isList: false, isFilterable: false, isSearchable: false, defaultValue: null },
      { name: "email", type: "string", prismaType: "String", isId: false, isRequired: true, isUnique: true, isReadOnly: false, isList: false, isFilterable: false, isSearchable: true, defaultValue: null },
   ],
};

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
      { name: "authorId", type: "string", prismaType: "String", isId: false, isRequired: true, isUnique: false, isReadOnly: false, isList: false, isFilterable: false, isSearchable: false, defaultValue: null },
      { name: "author", type: "relation", prismaType: "User", isId: false, isRequired: true, isUnique: false, isReadOnly: false, isList: false, isFilterable: false, isSearchable: false, defaultValue: null, relation: { model: "User", kind: "belongsTo", relationName: "PostToUser", foreignKeyFields: ["authorId"], displayField: "email" } },
   ],
};

const model = (meta: AdminModelMeta, scope?: FullRegisteredModel["raw"]["scope"]): FullRegisteredModel => ({
   meta,
   raw: { scope },
   resolved: { listDisplay: [meta.displayField], listFilter: [], searchFields: meta.searchableFields, defaultSort: { field: meta.idField, direction: "asc" }, perPage: 25, permissions: { create: ["ADMIN"] } },
});

const dispatch = (router: Router, body: Record<string, unknown>) =>
   new Promise<{ status: number; body: { error?: string } | Record<string, unknown> }>((resolve, reject) => {
      const req = { method: "POST", url: "/posts", originalUrl: "/posts", query: {}, params: {}, body, adminUser };
      const res = {
         statusCode: 200,
         status(status: number) {
            this.statusCode = status;
            return this;
         },
         json(responseBody: { error?: string } | Record<string, unknown>) {
            resolve({ status: this.statusCode, body: responseBody });
            return this;
         },
      };
      (router as unknown as { handle: (request: unknown, response: unknown, next: (error?: unknown) => void) => void }).handle(req, res, reject);
   });

describe("belongsTo relation selection", () => {
   test("accepts an FK only when the related record is inside its scoped view", async () => {
      let createCalls = 0;
      let relatedWhere: unknown;
      const auditEvents: Array<{ type: string; modelName: string; recordIds: Array<string | number> }> = [];
      const prisma = {
         user: {
            findFirst: async (args: { where: unknown }) => {
               relatedWhere = args.where;
               return JSON.stringify(args.where).includes("visible-user") ? { id: "visible-user" } : null;
            },
         },
         post: {
            create: async (args: { data: Record<string, unknown> }) => {
               createCalls += 1;
               return { id: "new-post", ...args.data };
            },
         },
      } as PrismaLike;
      const router = createCrudRouter(
         new Map([["posts", model(postMeta)], ["users", model(userMeta, async () => ({ institutionId: "institution-a" }))]]),
         prisma,
         undefined,
         { write: async (event) => { auditEvents.push(event); } },
      );

      const permitted = await dispatch(router, { title: "Visible relation", authorId: "visible-user" });
      expect(permitted.status).toBe(201);
      expect(createCalls).toBe(1);
      expect(relatedWhere).toEqual({ AND: [{ institutionId: "institution-a" }, { id: "visible-user" }] });
      expect(auditEvents).toHaveLength(1);
      expect(auditEvents[0]).toMatchObject({ type: "create", modelName: "Post", recordIds: ["new-post"] });

      const forbidden = await dispatch(router, { title: "Forged relation", authorId: "other-tenant-user" });
      expect(forbidden.status).toBe(400);
      expect(forbidden.body).toEqual({ error: "The selected User record is unavailable.", code: "VALIDATION_ERROR" });
      expect(createCalls).toBe(1);
   });

   test("rejects a submitted FK when its related model is not registered", async () => {
      const prisma = { post: { create: async () => ({ id: "new-post" }) } } as PrismaLike;
      const router = createCrudRouter(new Map([["posts", model(postMeta)]]), prisma);
      const response = await dispatch(router, { title: "Unsafe relation", authorId: "other-tenant-user" });
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Relation "author" cannot be changed because related model "User" is not registered.', code: "VALIDATION_ERROR" });
   });
});
