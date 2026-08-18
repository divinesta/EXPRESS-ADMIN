import { describe, expect, test } from "bun:test";
import { hasModelPermission, hasRegisteredActionPermission } from "../../src/auth/permissions.ts";
import { assertScopeFieldsUnchanged, buildScopedRecordWhere, resolveScope } from "../../src/api/scope.ts";
import { RequestValidationError, isFieldWritable, validateWritePayload } from "../../src/api/validation.ts";
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

   test("accepts either explicit custom action allowlist", () => {
      const action = { name: "publish", label: "Publish", allowedRoles: ["ADMIN"], handler: async () => ({ message: "Published" }) };
      expect(hasRegisteredActionPermission(adminUser, {}, action)).toBe(true);
      expect(hasRegisteredActionPermission(adminUser, { actions: { publish: ["ADMIN"] } }, { ...action, allowedRoles: undefined })).toBe(true);
      expect(hasRegisteredActionPermission(adminUser, { actions: { publish: ["SUPER_ADMIN"] } }, action)).toBe(false);
   });
});
