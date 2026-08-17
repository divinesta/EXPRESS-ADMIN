import { json, Router, static as expressStatic } from "express";
import type { Application } from "express";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { AdminConfig, ModelConfig } from "./core/types.js";
import { AdminRegistry } from "./core/registry.js";
import { createSchemaEndpoint } from "./api/schemaEndpoint.js";
import { createAuthenticationMiddleware } from "./auth/middleware.js";
import { createBuiltInAuthenticationMiddleware, createBuiltInAuthRouter, enforceBuiltInAdminPage, isBuiltInAuth } from "./auth/builtIn.js";
import { createCrudRouter } from "./api/routerFactory.js";
import { createActionRouter } from "./api/actionRouter.js";
import { createApiErrorHandler } from "./api/errors.js";

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
export interface Admin {
   register(modelName: string, modelConfig?: ModelConfig): Admin;
   mount(app: Application): Promise<void>;
}

export function createAdmin(config: AdminConfig): Admin {
   const registry = new AdminRegistry();

   const admin: Admin = {
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
         router.use(json());

         if (isBuiltInAuth(config.auth)) {
            router.use("/api/auth", createBuiltInAuthRouter(config.prisma, config.auth));
         }

         // Every API endpoint requires an authenticated admin. The middleware
         // resolves config.auth.getCurrentUser(req) once and exposes its
         // verified result as req.adminUser for later permission and scope checks.
         router.use("/api", isBuiltInAuth(config.auth)
            ? createBuiltInAuthenticationMiddleware(config.prisma, config.auth)
            : createAuthenticationMiddleware(config.auth));

         // Schema endpoint — GET /admin/api/schema
         // Returns all registered models + resolved config as JSON.
         // The UI calls this once on load to drive all list/form/filter views.
         router.get("/api/schema", createSchemaEndpoint(registry, config));

         // Scalar CRUD routes. Each route enforces authentication, model
         // permissions, tenant scope, and request validation before Prisma.
         const modelsByPluralName = new Map(registry.getAll().map((model) => [model.meta.pluralName, model]));
         router.use("/api", createActionRouter(modelsByPluralName, config.prisma, config.audit));
         router.use("/api", createCrudRouter(modelsByPluralName, config.prisma, config.databaseProvider, config.audit));
         router.use("/api", createApiErrorHandler());

         // The UI is a pre-built Vite SPA. Keep this after /api so API routes
         // always win, then fall back to index.html for client-side routes such
         // as /admin/posts/123.
         const uiDist = resolve(dirname(fileURLToPath(import.meta.url)), "../ui/dist");
         if (isBuiltInAuth(config.auth)) router.use(enforceBuiltInAdminPage(config.prisma, config.auth, basePath));
         router.use(expressStatic(uiDist, { index: "index.html" }));
         router.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
            res.sendFile(resolve(uiDist, "index.html"));
         });

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
   BuiltInAuthConfig,
   ExternalAuthConfig,
   ExpressAdminCliConfig,
   AuditConfig,
   AdminAuditEvent,
   AdminFieldMeta,
   AdminModelMeta,
   AdminFieldType,
   RelationKind,
   ModelPermissions,
   AdminAction,
   AdminFieldOverride,
   PaginatedResponse,
   SchemaResponse,
   PrismaLike,
} from "./core/types.js";
export { hashAdminPassword } from "./auth/builtIn.js";
export type { ResolvedModelConfig, FullRegisteredModel } from "./core/registry.js";
