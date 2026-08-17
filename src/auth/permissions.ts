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

/** Return the configured model-level role allowlist for a named custom action. */
export function hasActionPermission(adminUser: AdminUser, permissions: ModelPermissions, actionName: string): boolean {
   if (adminUser.isSuperAdmin) return true;

   const allowedRoles = permissions.actions?.[actionName];
   if (allowedRoles === undefined) return false;

   return allowedRoles.includes(adminUser.role);
}

/** Either allowlist authorizes an action; when both are present, both must allow the role. */
export function hasRegisteredActionPermission(adminUser: AdminUser, permissions: ModelPermissions, action: AdminAction): boolean {
   if (adminUser.isSuperAdmin) return true;

   const modelAllowedRoles = permissions.actions?.[action.name];
   const actionAllowedRoles = action.allowedRoles;
   if (modelAllowedRoles === undefined && actionAllowedRoles === undefined) return false;
   return (modelAllowedRoles === undefined || modelAllowedRoles.includes(adminUser.role))
      && (actionAllowedRoles === undefined || actionAllowedRoles.includes(adminUser.role));
}
