import type { AdminUser, ModelPermissions } from "../core/types.js";

// ============================================================
// MODEL PERMISSIONS
// ============================================================

/** Every model operation the admin can authorize. */
export type AdminOperation = "list" | "view" | "create" | "update" | "delete";

/**
 * Decide whether an authenticated admin may perform a model operation.
 *
 * Omitted permissions intentionally preserve the public API's current
 * convention: any authenticated admin is allowed. A configured empty role
 * list denies everyone except a super admin, making a deny rule explicit.
 */
export function hasModelPermission(adminUser: AdminUser, permissions: ModelPermissions, operation: AdminOperation): boolean {
   if (adminUser.isSuperAdmin) return true;

   const allowedRoles = permissions[operation];
   if (allowedRoles === undefined) return true;

   return allowedRoles.includes(adminUser.role);
}

/** Return the role allowlist for a named custom action. */
export function hasActionPermission(adminUser: AdminUser, permissions: ModelPermissions, actionName: string): boolean {
   if (adminUser.isSuperAdmin) return true;

   const allowedRoles = permissions.actions?.[actionName];
   if (allowedRoles === undefined) return true;

   return allowedRoles.includes(adminUser.role);
}
