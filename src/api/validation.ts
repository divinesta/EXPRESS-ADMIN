import type { AdminFieldMeta, AdminModelMeta, AdminUser, ModelConfig } from "../core/types.js";
import { AdminApiError } from "./errors.js";

// ============================================================
// REQUEST VALIDATION
// ============================================================

/** An error a route can safely return to an API caller. */
export class RequestValidationError extends AdminApiError {
   constructor(message: string) {
      super(400, "VALIDATION_ERROR", message);
      this.name = "RequestValidationError";
   }
}

/**
 * Conservative name matching for data that should not appear in an admin by
 * accident. Developers can make a deliberate exception with `{ expose: true }`.
 */
export function isSensitiveFieldName(name: string): boolean {
   return /password|token|secret|api[_-]?key|credential|private[_-]?key/i.test(name);
}

/** True when a field may be included in the admin's schema or a form. */
export function isFieldVisible(field: AdminFieldMeta, config: ModelConfig): boolean {
   const override = config.fields?.[field.name];
   if (override?.exclude) return false;
   if (isSensitiveFieldName(field.name)) return override?.expose === true;
   return true;
}

/**
 * Return the scalar fields the admin may accept on create or update. Relation
 * writes are intentionally excluded from the first CRUD release.
 */
export function getWritableFields(meta: AdminModelMeta, config: ModelConfig): AdminFieldMeta[] {
   return meta.fields.filter((field) => isFieldWritableByConfiguration(field, config));
}

function isFieldWritableByConfiguration(field: AdminFieldMeta, config: ModelConfig): boolean {
   const override = config.fields?.[field.name];
   return isFieldVisible(field, config) && field.type !== "relation" && !field.isList && !field.isReadOnly && !override?.readOnly;
}

/** True when the current administrator can modify this otherwise writable field. */
export function isFieldWritable(field: AdminFieldMeta, config: ModelConfig, adminUser: AdminUser): boolean {
   if (!isFieldWritableByConfiguration(field, config)) return false;
   const writeRoles = config.fields?.[field.name]?.writeRoles;
   if (adminUser.isSuperAdmin) return true;
   if (writeRoles !== undefined) return writeRoles.includes(adminUser.role);
   return !/^(role|isactive|issuperadmin)$/i.test(field.name);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
   return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertFieldValue(field: AdminFieldMeta, value: unknown): void {
   if (value === null) {
      if (field.isRequired) throw new RequestValidationError(`Field "${field.name}" cannot be null.`);
      return;
   }

   switch (field.type) {
      case "string":
      case "bytes":
         if (typeof value !== "string") throw new RequestValidationError(`Field "${field.name}" must be a string.`);
         return;
      case "number":
         if (field.prismaType === "Decimal" || field.prismaType === "BigInt") {
            if (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value)) throw new RequestValidationError(`Field "${field.name}" must be a decimal string.`);
            return;
         }
         if (typeof value !== "number" || !Number.isFinite(value)) throw new RequestValidationError(`Field "${field.name}" must be a finite number.`);
         return;
      case "boolean":
         if (typeof value !== "boolean") throw new RequestValidationError(`Field "${field.name}" must be a boolean.`);
         return;
      case "datetime":
         if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new RequestValidationError(`Field "${field.name}" must be an ISO date-time string.`);
         return;
      case "enum":
         if (typeof value !== "string" || !field.enumValues?.includes(value)) throw new RequestValidationError(`Field "${field.name}" must be a valid ${field.prismaType} value.`);
         return;
      case "json":
         if (!isJsonValue(value)) throw new RequestValidationError(`Field "${field.name}" must be valid JSON data.`);
         return;
      case "relation":
         throw new RequestValidationError(`Relation field "${field.name}" is not supported for writes yet.`);
   }
}

function isJsonValue(value: unknown, depth = 0): boolean {
   if (depth > 20) return false;
   if (value === null || typeof value === "string" || typeof value === "boolean") return true;
   if (typeof value === "number") return Number.isFinite(value);
   if (Array.isArray(value)) return value.length <= 1_000 && value.every((entry) => isJsonValue(entry, depth + 1));
   return isPlainObject(value) && Object.keys(value).length <= 1_000 && Object.values(value).every((entry) => isJsonValue(entry, depth + 1));
}

/** Ensure Prisma never turns a user omission into an opaque 500 response. */
export function assertRequiredCreateFields(meta: AdminModelMeta, config: ModelConfig, adminUser: AdminUser, data: Record<string, unknown>): void {
   for (const field of getWritableFields(meta, config)) {
      if (!isFieldWritable(field, config, adminUser) || !field.isRequired || field.defaultValue !== null) continue;
      if (data[field.name] === undefined) throw new RequestValidationError(`Field "${field.name}" is required.`);
   }
}

/**
 * Reject unknown, hidden, read-only, and incorrectly typed write properties.
 * The returned object is safe to pass to the scalar-only Prisma CRUD layer.
 */
export function validateWritePayload(meta: AdminModelMeta, config: ModelConfig, adminUser: AdminUser, body: unknown): Record<string, unknown> {
   if (!isPlainObject(body)) throw new RequestValidationError("Request body must be a JSON object.");

   const writableByName = new Map(getWritableFields(meta, config).filter((field) => isFieldWritable(field, config, adminUser)).map((field) => [field.name, field]));
   const data: Record<string, unknown> = {};

   for (const [fieldName, value] of Object.entries(body)) {
      const field = writableByName.get(fieldName);
      if (!field) throw new RequestValidationError(`Field "${fieldName}" cannot be written through the admin.`);

      assertFieldValue(field, value);
      data[fieldName] = value;
   }

   return data;
}
