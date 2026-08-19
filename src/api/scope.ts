import type { AdminUser, ModelConfig } from "../core/types.js";
import { RequestValidationError } from "./validation.js";

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
   const scope = (await config.scope?.(adminUser)) ?? {};
   assertNoUndefinedScopeValues(scope);
   return scope;
}

function assertNoUndefinedScopeValues(value: unknown, path: string[] = []): void {
   if (value === undefined) {
      const label = path.length ? path.join(".") : "scope";
      throw new RequestValidationError(`Scope field "${label}" resolved to undefined. Return a concrete value or a match-nothing fallback instead.`);
   }

   if (Array.isArray(value)) {
      value.forEach((item, index) => assertNoUndefinedScopeValues(item, [...path, String(index)]));
      return;
   }

   if (value === null || typeof value !== "object") return;

   for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      assertNoUndefinedScopeValues(child, [...path, key]);
   }
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
   for (const fieldName of collectScopeFieldNames(scope)) {
      if (data[fieldName] !== undefined) {
         throw new RequestValidationError(`Field "${fieldName}" is controlled by the configured scope and cannot be updated through the admin.`);
      }
   }
}

/**
 * Return every scalar field named by a Prisma where tree.  This deliberately
 * errs on the side of locking too much: an update must never be able to alter
 * a value that a nested AND/OR/NOT predicate uses to establish its scope.
 */
export function collectScopeFieldNames(scope: ScopeFilter): Set<string> {
   const names = new Set<string>();
   const visit = (value: unknown) => {
      if (Array.isArray(value)) return void value.forEach(visit);
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
         if (key !== "AND" && key !== "OR" && key !== "NOT") names.add(key);
         visit(child);
      }
   };
   visit(scope);
   return names;
}
