import type { AdminUser, ModelConfig } from "../core/types.ts";

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
export function buildScopedRecordWhere(scope: ScopeFilter, idField: string, id: string): ScopeFilter {
   return {
      AND: [scope, { [idField]: id }],
   };
}
