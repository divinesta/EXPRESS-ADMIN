import type { RequestHandler } from "express";
import type { AdminConfig, SchemaResponse } from "../core/types.ts";
import type { AdminRegistry } from "../core/registry.ts";
import { hasActionPermission, hasModelPermission } from "../auth/permissions.ts";
import { AuthenticationError, sendApiError } from "./errors.ts";
import { isFieldVisible } from "./validation.ts";

// ============================================================
// SCHEMA ENDPOINT
// ============================================================

/**
 * Returns an Express request handler for GET /admin/api/schema.
 *
 * This is the single most important endpoint in the entire admin.
 * It returns the full admin configuration as JSON — every registered
 * model's field metadata plus the resolved display config.
 *
 * The UI calls this once on page load to figure out:
 *   - Which models exist and what they're called
 *   - Which columns to show in each list view
 *   - Which fields can be filtered or searched
 *   - The sort order, page size, fieldsets, permissions
 *
 * It's also the best debugging tool during development.
 * Hit GET /admin/api/schema in a browser and you'll see exactly
 * what the admin knows about your schema.
 *
 * Example response:
 * ```json
 * {
 *   "siteName": "Prisma Admin",
 *   "basePath": "/admin",
 *   "models": [
 *     {
 *       "meta": {
 *         "name": "User",
 *         "pluralName": "users",
 *         "fields": [ ... ],
 *         "displayField": "email",
 *         "searchableFields": ["email", "fullName"],
 *         "filterableFields": ["role", "isActive", "createdAt"]
 *       },
 *       "config": {
 *         "listDisplay": ["email", "fullName", "role", "isActive", "createdAt"],
 *         "listFilter": ["role", "isActive", "createdAt", "updatedAt"],
 *         "searchFields": ["email", "fullName"],
 *         "defaultSort": { "field": "createdAt", "direction": "desc" },
 *         "perPage": 50,
 *         "fieldsets": [],
 *         "permissions": {}
 *       }
 *     }
 *   ]
 * }
 * ```
 */
export function createSchemaEndpoint(registry: AdminRegistry, config: AdminConfig): RequestHandler {
   const basePath = config.basePath ?? "/admin";
   const siteName = config.siteName ?? "Prisma Admin";

   return (req, res) => {
      const adminUser = req.adminUser;
      if (!adminUser) {
         sendApiError(res, new AuthenticationError());
         return;
      }

      const models = registry.getAll();

      const response: SchemaResponse = {
         identity: {
            id: adminUser.id,
            email: adminUser.email,
            role: adminUser.role,
            isSuperAdmin: adminUser.isSuperAdmin,
         },
         siteName,
         basePath,
         models: models.map(({ meta, resolved, raw }) => {
            const visibleFields = meta.fields.filter((field) => isFieldVisible(field, raw));
            const visibleFieldNames = new Set(visibleFields.map((field) => field.name));

            return {
               meta: {
                  ...meta,
                  fields: visibleFields,
                  searchableFields: meta.searchableFields.filter((fieldName) => visibleFieldNames.has(fieldName)),
                  filterableFields: meta.filterableFields.filter((fieldName) => visibleFieldNames.has(fieldName)),
               },
               config: {
                  listDisplay: resolved.listDisplay.filter((fieldName) => visibleFieldNames.has(fieldName)),
                  listFilter: resolved.listFilter.filter((fieldName) => visibleFieldNames.has(fieldName)),
                  searchFields: resolved.searchFields.filter((fieldName) => visibleFieldNames.has(fieldName)),
               defaultSort: resolved.defaultSort,
               perPage: resolved.perPage,
                  fieldsets: resolved.fieldsets.map((fieldset) => ({
                     ...fieldset,
                     fields: fieldset.fields.filter((fieldName) => visibleFieldNames.has(fieldName)),
                  })),
               permissions: {
                  list: hasModelPermission(adminUser, resolved.permissions, "list"),
                  view: hasModelPermission(adminUser, resolved.permissions, "view"),
                  create: hasModelPermission(adminUser, resolved.permissions, "create"),
                  update: hasModelPermission(adminUser, resolved.permissions, "update"),
                  delete: hasModelPermission(adminUser, resolved.permissions, "delete"),
                  actions: Object.fromEntries(
                     (raw.actions ?? []).map((action) => [action.name, hasActionPermission(adminUser, resolved.permissions, action.name)]),
                  ),
               },
            },
            };
         }),
      };

      res.json(response);
   };
}
