import { Router } from "express";
import type { Application } from "express";
import type { AdminConfig, ModelConfig } from "./core/types.ts";
import { AdminRegistry } from "./core/registry.ts";
import { createSchemaEndpoint } from "./api/schemaEndpoint.ts";

// ============================================================
// PUBLIC API
// ============================================================

/**
 * Create an admin instance.
 *
 * This is the single entry point for the entire library.
 * Call this once, register your models, then mount onto your Express app.
 *
 * ```ts
 * const admin = createAdmin({ prisma, auth: { getCurrentUser } })
 *
 * admin
 *   .register("User")
 *   .register("Post", { listDisplay: ["title", "author", "published"] })
 *
 * await admin.mount(app)
 * ```
 */
export function createAdmin(config: AdminConfig) {
   const registry = new AdminRegistry();

   const admin = {
      /**
       * Register a Prisma model with the admin panel.
       *
       * - The model name must match exactly what's in schema.prisma (PascalCase).
       * - All config options are optional — sensible defaults are derived from DMMF.
       * - Returns `this` so you can chain multiple register() calls.
       * - Must be called before mount().
       *
       * @param modelName  - e.g. "User", "Post", "Category"
       * @param modelConfig - Optional customisation (listDisplay, filters, hooks, etc.)
       */
      register(modelName: string, modelConfig: ModelConfig = {}) {
         registry.register(modelName, modelConfig);
         return admin; // chainable
      },

      /**
       * Initialize the admin and mount all routes onto the Express app.
       *
       * What happens internally:
       *   1. Reads schema.prisma via getDMMF (@prisma/internals)
       *   2. Validates every register() call against the real schema
       *   3. Resolves all configs — fills in all defaults
       *   4. Mounts the admin API router at basePath (default: /admin)
       *
       * Must be awaited. Must be called after all register() calls.
       *
       * @param app - Your Express Application instance
       */
      async mount(app: Application): Promise<void> {
         // ── Step 1: Introspect + validate + resolve ────────────
         // This is the async getDMMF work. Everything is validated here:
         //   - model names exist in the schema
         //   - field override names are real fields
         //   - searchFields are actually String fields
         //   - etc.
         // Throws with a clear message if anything is wrong.
         await registry.initialize({ schemaPath: config.schemaPath });

         const basePath = config.basePath ?? "/admin";
         const router = Router();

         // ── Step 2: Register routes ────────────────────────────
         // Schema endpoint — GET /admin/api/schema
         // Returns all registered models + resolved config as JSON.
         // The UI calls this once on load to drive all list/form/filter views.
         router.get("/api/schema", createSchemaEndpoint(registry, config));

         // TODO: auth middleware    → src/auth/middleware.ts
         // TODO: CRUD routes        → src/api/routerFactory.ts

         // ── Step 3: Mount the router ──────────────────────────
         app.use(basePath, router);

         const modelCount = registry.size;
         console.log(`[prisma-express-admin] Mounted at ${basePath}. ` + `${modelCount} model${modelCount !== 1 ? "s" : ""} registered.`);
      },
   };

   return admin;
}

// ============================================================
// RE-EXPORTS
// ============================================================

// Surface the types developers will reference in their own code
export type {
   AdminConfig,
   ModelConfig,
   AdminUser,
   AuthConfig,
   AdminFieldMeta,
   AdminModelMeta,
   AdminFieldType,
   RelationKind,
   ModelPermissions,
   AdminFieldset,
   AdminAction,
   AdminInlineConfig,
   AdminFieldOverride,
   PaginatedResponse,
   SchemaResponse,
   AuditLogEntry,
   AdminPlugin,
} from "./core/types.ts";
export type { ResolvedModelConfig, FullRegisteredModel } from "./core/registry.ts";
