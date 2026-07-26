import type { AdminFieldMeta, AdminModelMeta, ModelConfig } from "../core/types.ts";
import { AdminApiError } from "./errors.ts";

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
   return meta.fields.filter((field) => {
      const override = config.fields?.[field.name];
      return isFieldVisible(field, config) && field.type !== "relation" && !field.isReadOnly && !override?.readOnly;
   });
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
         return;
      case "relation":
         throw new RequestValidationError(`Relation field "${field.name}" is not supported for writes yet.`);
   }
}

/**
 * Reject unknown, hidden, read-only, and incorrectly typed write properties.
 * The returned object is safe to pass to the scalar-only Prisma CRUD layer.
 */
export function validateWritePayload(meta: AdminModelMeta, config: ModelConfig, body: unknown): Record<string, unknown> {
   if (!isPlainObject(body)) throw new RequestValidationError("Request body must be a JSON object.");

   const writableByName = new Map(getWritableFields(meta, config).map((field) => [field.name, field]));
   const data: Record<string, unknown> = {};

   for (const [fieldName, value] of Object.entries(body)) {
      const field = writableByName.get(fieldName);
      if (!field) throw new RequestValidationError(`Field "${fieldName}" cannot be written through the admin.`);

      assertFieldValue(field, value);
      data[fieldName] = value;
   }

   return data;
}
