import type { AdminUser, ModelConfig } from "../core/types.ts";
import { RequestValidationError } from "./validation.ts";

// ============================================================
// QUERY SCOPING
// ============================================================

/** A Prisma-compatible where fragment returned by a model scope function. */
export type ScopeFilter = Record<string, unknown>;

/**
 * Resolve a model's tenant or ownership scope for an authenticated admin.
 *
 * Scope is always returned as a separate `AND` clause. Spreading the scope
 * into an ID condition would allow overlapping keys to overwrite one another.
 */
export async function resolveScope(config: ModelConfig, adminUser: AdminUser): Promise<ScopeFilter> {
   return (await config.scope?.(adminUser)) ?? {};
}

/**
 * Combine a scope with a record identifier without allowing either condition
 * to replace the other. Routes should use this for detail, update, and delete
 * lookups—not just list queries.
 */
export function buildScopedRecordWhere(scope: ScopeFilter, idField: string, id: unknown): ScopeFilter {
   return {
      AND: [scope, { [idField]: id }],
   };
}

/**
 * Apply a simple tenant/ownership scope to newly created data. This prevents
 * callers from creating a record inside another tenant by submitting a
 * different foreign key. Complex Prisma predicates are safe for reads and
 * mutations, but cannot be converted into create data automatically.
 */
export function applyCreateScope(data: Record<string, unknown>, scope: ScopeFilter): Record<string, unknown> {
   const scopedData = { ...data };

   for (const [fieldName, value] of Object.entries(scope)) {
      if (value !== null && typeof value === "object") {
         throw new RequestValidationError(`Cannot apply complex scope field "${fieldName}" when creating a record. Use a simple equality scope or a beforeCreate hook.`);
      }

      if (scopedData[fieldName] !== undefined && scopedData[fieldName] !== value) {
         throw new RequestValidationError(`Create payload conflicts with the configured scope for field "${fieldName}".`);
      }

      scopedData[fieldName] = value;
   }

   return scopedData;
}

/** Prevent a caller from moving a record out of its authorized scope. */
export function assertScopeFieldsUnchanged(data: Record<string, unknown>, scope: ScopeFilter): void {
   for (const fieldName of Object.keys(scope)) {
      if (data[fieldName] !== undefined) {
         throw new RequestValidationError(`Field "${fieldName}" is controlled by the configured scope and cannot be updated through the admin.`);
      }
   }
}
