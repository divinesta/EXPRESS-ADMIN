import type { AdminAction, AdminUser, ModelPermissions } from "../core/types.js";

// ============================================================
// MODEL PERMISSIONS
// ============================================================

/** Every model operation the admin can authorize. */
export type AdminOperation = "list" | "view" | "create" | "update" | "delete";

/**
 * Decide whether an authenticated admin may perform a model operation.
 *
 * Reads remain available to authenticated admins by default. Writes and
 * custom actions require an explicit allowlist. A configured empty role list
 * denies everyone except a super admin.
 */
export function hasModelPermission(adminUser: AdminUser, permissions: ModelPermissions, operation: AdminOperation): boolean {
   if (adminUser.isSuperAdmin) return true;

   const allowedRoles = permissions[operation];
   if (allowedRoles === undefined) return operation === "list" || operation === "view";

   return allowedRoles.includes(adminUser.role);
}

/** Return the role allowlist for a named custom action. */
export function hasActionPermission(adminUser: AdminUser, permissions: ModelPermissions, actionName: string): boolean {
   if (adminUser.isSuperAdmin) return true;

   const allowedRoles = permissions.actions?.[actionName];
   if (allowedRoles === undefined) return false;

   return allowedRoles.includes(adminUser.role);
}

/** An action's own allowlist is additive to the model-level action allowlist. */
export function hasRegisteredActionPermission(adminUser: AdminUser, permissions: ModelPermissions, action: AdminAction): boolean {
   if (!hasActionPermission(adminUser, permissions, action.name)) return false;
   if (adminUser.isSuperAdmin || action.allowedRoles === undefined) return true;
   return action.allowedRoles.includes(adminUser.role);
}
