import { once } from "node:events";
import express from "express";
import type { Router } from "express";
import { afterEach, describe, expect, test } from "bun:test";
import { hasModelPermission, hasRegisteredActionPermission } from "../../src/auth/permissions.ts";
import { createCrudRouter } from "../../src/api/routerFactory.ts";
import { assertScopeFieldsUnchanged, buildScopedRecordWhere, resolveScope } from "../../src/api/scope.ts";
import { assertRequiredCreateFields, RequestValidationError, isFieldWritable, validateHookPayload, validateWritePayload } from "../../src/api/validation.ts";
import { createAdmin } from "../../src/index.ts";
import type { FullRegisteredModel } from "../../src/core/registry.ts";
import type { AdminModelMeta, AdminUser, ModelConfig } from "../../src/core/types.ts";

const adminUser: AdminUser = {
   id: "admin-1",
   email: "admin@example.com",
   role: "ADMIN",
   isSuperAdmin: false,
   institutionId: "institution-a",
};

const userMeta: AdminModelMeta = {
   name: "User",
   pluralName: "users",
   prismaClientKey: "user",
   idField: "id",
   displayField: "email",
   searchableFields: ["email"],
   filterableFields: ["role"],
   timestamps: {},
   fields: [
      { name: "id", type: "string", prismaType: "String", isId: true, isRequired: true, isUnique: true, isReadOnly: true, isList: false, isFilterable: false, isSearchable: false, defaultValue: null },
      { name: "email", type: "string", prismaType: "String", isId: false, isRequired: true, isUnique: true, isReadOnly: false, isList: false, isFilterable: false, isSearchable: true, defaultValue: null },
      { name: "role", type: "enum", prismaType: "Role", isId: false, isRequired: true, isUnique: false, isReadOnly: false, isList: false, isFilterable: true, isSearchable: false, defaultValue: null, enumValues: ["ADMIN", "USER"] },
      { name: "passwordHash", type: "string", prismaType: "String", isId: false, isRequired: true, isUnique: false, isReadOnly: false, isList: false, isFilterable: false, isSearchable: false, defaultValue: null },
   ],
};

const servers: import("node:http").Server[] = [];

afterEach(async () => {
   await Promise.all(servers.splice(0).map(async (server) => {
      server.close();
      await once(server, "close");
   }));
});

async function dispatchCrud(router: Router, method: string, url: string, body?: unknown): Promise<{ status: number; body: unknown }> {
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
      };

      (router as unknown as { handle: (request: unknown, response: unknown, next: (error?: unknown) => void) => void }).handle(req, res, reject);
   });
}

describe("API safety foundation", () => {
   test("only allows configured roles, unless the user is a super admin", () => {
      expect(hasModelPermission(adminUser, { delete: ["SUPER_ADMIN"] }, "delete")).toBe(false);
      expect(hasModelPermission({ ...adminUser, isSuperAdmin: true }, { delete: [] }, "delete")).toBe(true);
      expect(hasModelPermission(adminUser, {}, "list")).toBe(true);
      expect(hasModelPermission(adminUser, {}, "create")).toBe(false);
   });

   test("keeps scope and record ID as separate required conditions", async () => {
      const scope = await resolveScope({ scope: async (user) => ({ institutionId: user.institutionId }) }, adminUser);

      expect(buildScopedRecordWhere(scope, "id", "user-b")).toEqual({
         AND: [{ institutionId: "institution-a" }, { id: "user-b" }],
      });
   });

   test("rejects undefined values anywhere in a resolved scope", async () => {
      await expect(resolveScope({ scope: async (user) => ({ institutionId: user.metadata?.institutionId }) }, adminUser)).rejects.toThrow(RequestValidationError);
      await expect(resolveScope({ scope: async () => ({ OR: [{ tenantId: "tenant-a" }, { tenantId: undefined }] }) }, adminUser)).rejects.toThrow('Scope field "OR.1.tenantId" resolved to undefined.');
   });

   test("locks scalar fields referenced inside nested scope predicates", () => {
      const scope = { OR: [{ tenantId: "tenant-a" }, { order: { tenantId: "tenant-a" } }] };
      expect(() => assertScopeFieldsUnchanged({ tenantId: "tenant-b" }, scope)).toThrow(RequestValidationError);
   });

   test("rejects sensitive and unknown write fields", () => {
      const config: ModelConfig = {};

      expect(() => validateWritePayload(userMeta, config, adminUser, { passwordHash: "not-allowed" })).toThrow(RequestValidationError);
      expect(() => validateWritePayload(userMeta, config, adminUser, { unknown: true })).toThrow(RequestValidationError);
   });

   test("accepts a valid scalar payload and rejects invalid enum values", () => {
      const config: ModelConfig = {};

      expect(validateWritePayload(userMeta, config, adminUser, { email: "admin@example.com" })).toEqual({ email: "admin@example.com" });
      expect(() => validateWritePayload(userMeta, config, adminUser, { role: "ADMIN" })).toThrow(RequestValidationError);
      expect(() => validateWritePayload(userMeta, { fields: { role: { writeRoles: ["ADMIN"] } } }, adminUser, { role: "OWNER" })).toThrow(RequestValidationError);
   });

   test("enforces per-field write roles", () => {
      const config: ModelConfig = { fields: { role: { writeRoles: ["SUPER_ADMIN"] } } };
      const role = userMeta.fields.find((field) => field.name === "role");
      if (!role) throw new Error("Test field not found.");

      expect(isFieldWritable(role, config, adminUser)).toBe(false);
      expect(isFieldWritable(role, config, { ...adminUser, role: "SUPER_ADMIN", isSuperAdmin: true })).toBe(true);
      expect(() => validateWritePayload(userMeta, config, adminUser, { role: "ADMIN" })).toThrow(RequestValidationError);
   });

   test("requires server-filled fields and permits trusted hook output", () => {
      expect(() => assertRequiredCreateFields(userMeta, {}, adminUser, { email: "admin@example.com" })).toThrow('Field "role" is required.');
      expect(validateHookPayload(userMeta, { email: "admin@example.com", role: "ADMIN", passwordHash: "derived" })).toEqual({ email: "admin@example.com", role: "ADMIN", passwordHash: "derived" });
   });

   test("accepts either explicit custom action allowlist", () => {
      const action = { name: "publish", label: "Publish", allowedRoles: ["ADMIN"], handler: async () => ({ message: "Published" }) };
      expect(hasRegisteredActionPermission(adminUser, {}, action)).toBe(true);
      expect(hasRegisteredActionPermission(adminUser, { actions: { publish: ["ADMIN"] } }, { ...action, allowedRoles: undefined })).toBe(true);
      expect(hasRegisteredActionPermission(adminUser, { actions: { publish: ["SUPER_ADMIN"] } }, action)).toBe(false);
   });

   test("does not call beforeUpdate until the scoped record exists", async () => {
      let beforeUpdateCalls = 0;
      const model: FullRegisteredModel = {
         meta: userMeta,
         raw: {
            scope: async () => ({ institutionId: "institution-a" }),
            beforeUpdate: async (_id, data) => {
               beforeUpdateCalls += 1;
               return data;
            },
         },
         resolved: { listDisplay: ["email"], listFilter: ["role"], searchFields: ["email"], defaultSort: { field: "id", direction: "asc" }, perPage: 25, permissions: { update: ["ADMIN"] } },
      };
      const prisma = {
         user: {
            findFirst: async () => null,
            updateMany: async () => { throw new Error("updateMany should not run for a missing scoped record."); },
         },
      };
      const router = createCrudRouter(new Map([["users", model]]), prisma);

      expect(await dispatchCrud(router, "PUT", "/users/user-b", { email: "renamed@example.test" })).toEqual({
         status: 404,
         body: { error: "Record not found", code: "RECORD_NOT_FOUND" },
      });
      expect(beforeUpdateCalls).toBe(0);
   });

   test("rejects cross-origin mutations when external auth is backed by browser credentials", async () => {
      const admin = createAdmin({
         prisma: {} as never,
         schemaPath: "examples/basic/prisma/schema.prisma",
         auth: { getCurrentUser: async () => adminUser },
      });
      admin.register("User", { permissions: { create: ["ADMIN"] } });
      const app = express();
      await admin.mount(app);
      const server = app.listen(0, "127.0.0.1");
      servers.push(server);
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Server did not bind a TCP port.");

      const response = await fetch(`http://127.0.0.1:${address.port}/admin/api/users`, {
         method: "POST",
         headers: { "Content-Type": "application/json", Origin: "https://evil.example", Cookie: "host_session=abc" },
         body: JSON.stringify({ email: "new@example.test" }),
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "Cross-origin requests are not allowed.", code: "ORIGIN_FORBIDDEN" });
   });
});
