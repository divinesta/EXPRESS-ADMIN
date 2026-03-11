import type { AdminModelMeta, ModelConfig, RegisteredModel, AdminFieldset, ModelPermissions } from "./types.ts";
import { introspect, type IntrospectOptions } from "./introspector.ts";

// ============================================================
// DEFAULT RESOLUTION
// ============================================================

/**
 * How many non-relation, non-readonly scalar fields to show in
 * list view when the developer hasn't specified listDisplay.
 */
const DEFAULT_LIST_DISPLAY_LIMIT = 6;

/**
 * Default number of records per page.
 */
const DEFAULT_PER_PAGE = 50;

/**
 * Given raw AdminModelMeta (from DMMF) and a developer-supplied ModelConfig
 * (which may be empty {}), produce a complete, fully-resolved config where
 * every property has a value.
 *
 * This is where "zero config" is implemented. A developer calling
 * admin.register("User") with no options still gets a fully working admin
 * because this function fills in every missing piece intelligently.
 *
 * ── listDisplay ───────────────────────────────────────────────────────────
 * Default: the first N scalar fields that are not:
 *   - relation fields (they need a sub-query, we don't include them in lists by default)
 *   - the id field (it's usually a UUID, not useful in a list table)
 *   - but we DO include the displayField always, even if it would be beyond the limit
 *
 * We put the displayField first so the list table always leads with the
 * human-readable identifier for the record.
 *
 * ── listFilter ────────────────────────────────────────────────────────────
 * Default: every field the introspector marked as isFilterable.
 * These are: enums, booleans, datetimes, and FK scalar fields.
 *
 * ── searchFields ──────────────────────────────────────────────────────────
 * Default: every field the introspector marked as isSearchable.
 * These are non-id, non-FK string fields.
 *
 * ── defaultSort ───────────────────────────────────────────────────────────
 * Default: sort by createdAt desc (most recent first) if the model has
 * a createdAt timestamp. Otherwise sort by the id field descending.
 * Developers commonly want newest records first in a list view.
 *
 * ── perPage ───────────────────────────────────────────────────────────────
 * Default: 25. The developer can override this per model.
 *
 * ── fieldsets ─────────────────────────────────────────────────────────────
 * Default: no fieldsets (empty array = flat form, all fields in one block).
 *
 * ── permissions ───────────────────────────────────────────────────────────
 * Default: empty permissions object = any authenticated admin can do anything.
 * The permission middleware treats an empty/undefined permission list as
 * "allow all authenticated admins".
 */
function resolveConfig(meta: AdminModelMeta, userConfig: ModelConfig): ResolvedModelConfig {
   // ── listDisplay ────────────────────────────────────────────
   let listDisplay: string[];
   if (userConfig.listDisplay && userConfig.listDisplay.length > 0) {
      // Developer explicitly specified which columns to show
      listDisplay = userConfig.listDisplay;
   } else {
      // Auto-generate: pick scalar, non-id, non-relation fields up to the limit.
      // We exclude the id field from the list because it's a UUID and clutters the table.
      // We exclude relation fields because they require extra includes and joins.
      const candidates = meta.fields
         .filter(
            (f) =>
               f.type !== "relation" && // no relation fields in list
               !f.isId && // no id field
               !f.isReadOnly, // no auto-managed fields like createdAt/updatedAt
            // (we add timestamps back below selectively)
         )
         .map((f) => f.name);

      // Start with the displayField so the first column is always the human label
      const result: string[] = [];
      if (!result.includes(meta.displayField)) {
         result.push(meta.displayField);
      }

      // Add up to the limit from the candidates
      for (const name of candidates) {
         if (result.length >= DEFAULT_LIST_DISPLAY_LIMIT) break;
         if (!result.includes(name)) {
            result.push(name);
         }
      }

      // Always add createdAt at the end if it exists and we have room
      if (meta.timestamps.createdAt && !result.includes(meta.timestamps.createdAt)) {
         result.push(meta.timestamps.createdAt);
      }

      listDisplay = result;
   }

   // ── listFilter ─────────────────────────────────────────────
   const listFilter = userConfig.listFilter ?? meta.filterableFields;

   // ── searchFields ───────────────────────────────────────────
   const searchFields = userConfig.searchFields ?? meta.searchableFields;

   // ── defaultSort ────────────────────────────────────────────
   let defaultSort: { field: string; direction: "asc" | "desc" };
   if (userConfig.defaultSort) {
      defaultSort = userConfig.defaultSort;
   } else if (meta.timestamps.createdAt) {
      // Most useful default: newest records first
      defaultSort = { field: meta.timestamps.createdAt, direction: "desc" };
   } else {
      defaultSort = { field: meta.idField, direction: "desc" };
   }

   // ── perPage ────────────────────────────────────────────────
   const perPage = userConfig.perPage ?? DEFAULT_PER_PAGE;

   // ── fieldsets ─────────────────────────────────────────────
   const fieldsets: AdminFieldset[] = userConfig.fieldsets ?? [];

   // ── permissions ────────────────────────────────────────────
   const permissions: ModelPermissions = userConfig.permissions ?? {};

   return {
      listDisplay,
      listFilter,
      searchFields,
      defaultSort,
      perPage,
      fieldsets,
      permissions,
   };
}

// ============================================================
// RESOLVED CONFIG TYPE
// ============================================================

/**
 * A fully-resolved model configuration — every property is guaranteed
 * to have a value (no undefined/optional). This is what the rest of the
 * system uses internally (routerFactory, schemaEndpoint, etc.).
 *
 * It's distinct from ModelConfig (which is all-optional) so TypeScript
 * can enforce that consumers don't need to null-check these fields.
 */
export interface ResolvedModelConfig {
   listDisplay: string[];
   listFilter: string[];
   searchFields: string[];
   defaultSort: { field: string; direction: "asc" | "desc" };
   perPage: number;
   fieldsets: AdminFieldset[];
   permissions: ModelPermissions;
}

/**
 * A registered model entry — the full picture of a model in the admin.
 * Combines the DMMF-derived AdminModelMeta with the fully resolved config.
 *
 * The raw user-supplied config is kept as well for cases where the
 * caller needs access to lifecycle hooks, scope functions, etc.
 * (Those can't go into ResolvedModelConfig because they hold functions,
 * and functions aren't serializable to JSON for the schema endpoint.)
 */
export interface FullRegisteredModel {
   /** DMMF-derived metadata — auto-generated from schema */
   meta: AdminModelMeta;

   /**
    * Fully resolved config — all defaults filled in.
    * Safe to access any property without null-checking.
    * Used by: routerFactory, schemaEndpoint, filterParser, includeBuilder.
    */
   resolved: ResolvedModelConfig;

   /**
    * The original developer-supplied config — kept for lifecycle hooks,
    * scope functions, actions, and field overrides that can't be resolved
    * at registration time.
    * Used by: routerFactory (hooks, scope), auth/permissions middleware.
    */
   raw: ModelConfig;
}

// ============================================================
// REGISTRY CLASS
// ============================================================

/**
 * The AdminRegistry holds all registered models and provides the interface
 * for the rest of the system to look them up.
 *
 * Lifecycle:
 *   1. createAdmin() creates a registry instance.
 *   2. admin.register("ModelName", config?) adds each model.
 *   3. admin.mount(app) triggers initialization — introspects the schema,
 *      validates all registrations, resolves configs.
 *   4. After init, the routerFactory and schemaEndpoint read from the registry.
 *
 * The registry is NOT async at registration time. Developers call
 * admin.register() synchronously. The async getDMMF work happens during
 * admin.mount() / initialize(), not at register() time. This keeps the
 * developer API synchronous and clean.
 */
export class AdminRegistry {
   /**
    * Raw pending registrations: model name → user config.
    * These are stored at admin.register() time but not yet resolved.
    * Resolution happens during initialize() when we have DMMF data.
    */
   private pendingRegistrations = new Map<string, ModelConfig>();

   /**
    * Fully resolved registered models, populated by initialize().
    * Map key is the model name exactly as defined in Prisma schema ("User", "Post").
    */
   private models = new Map<string, FullRegisteredModel>();

   /**
    * Whether initialize() has been called successfully.
    * Guards against using the registry before it's ready.
    */
   private initialized = false;

   /**
    * Register a model with the admin.
    *
    * This is the public API that developers call:
    *   admin.register("User")
    *   admin.register("Post", { listDisplay: ["title", "author", "published"] })
    *
    * Registration is synchronous and lightweight — it just stores the intent.
    * The actual introspection and config resolution happens lazily in initialize().
    *
    * Important: You can call register() before the Prisma schema has been
    * generated. The validation only happens at mount time.
    *
    * @param modelName - The model name exactly as it appears in schema.prisma (PascalCase)
    * @param config    - Optional customization config. Every field is optional.
    */
   register(modelName: string, config: ModelConfig = {}): void {
      if (this.initialized) {
         throw new Error(`[prisma-express-admin] Cannot call register("${modelName}") after admin.mount() has been called. ` + `All register() calls must happen before mounting the admin router.`);
      }

      if (this.pendingRegistrations.has(modelName)) {
         console.warn(`[prisma-express-admin] Model "${modelName}" registered more than once. The second registration will overwrite the first.`);
      }

      this.pendingRegistrations.set(modelName, config);
   }

   /**
    * Initialize the registry.
    *
    * This is called internally by admin.mount(app). Developers never call this directly.
    *
    * What happens here:
    *   1. Run the introspector → get AdminModelMeta for every model in the schema.
    *   2. For each pending registration, validate the model name exists in the schema.
    *   3. If the developer provided field overrides (config.fields), validate that
    *      every field name they referenced actually exists on the model.
    *   4. Resolve the config — fill in all defaults.
    *   5. Store the fully resolved FullRegisteredModel.
    *
    * After this, the registry is "sealed" — no more register() calls are allowed.
    *
    * @param introspectOptions - Optional path to schema.prisma. Default: "prisma/schema.prisma"
    */
   async initialize(introspectOptions: IntrospectOptions = {}): Promise<void> {
      if (this.initialized) {
         throw new Error(`[prisma-express-admin] initialize() called more than once. This is a bug.`);
      }

      // ── Run the introspector ───────────────────────────────────
      // This is the async getDMMF call. It reads and compiles schema.prisma
      // using a WASM-based Prisma engine and returns all model/field metadata.
      const allModelMeta = await introspect(introspectOptions);

      // ── Validate and resolve each pending registration ─────────
      for (const [modelName, rawConfig] of this.pendingRegistrations) {
         const meta = allModelMeta.get(modelName);

         // Guard: model name must exist in the schema
         if (!meta) {
            const available = [...allModelMeta.keys()].sort().join(", ");
            throw new Error(`[prisma-express-admin] admin.register("${modelName}") failed: ` + `no model named "${modelName}" found in the Prisma schema.\n` + `Available models: ${available}`);
         }

         // Guard: validate field override names
         // If the developer writes config.fields: { nonExistentField: { exclude: true } },
         // that's almost certainly a typo. Fail loudly instead of silently ignoring it.
         if (rawConfig.fields) {
            const modelFieldNames = new Set(meta.fields.map((f) => f.name));
            for (const overrideName of Object.keys(rawConfig.fields)) {
               if (!modelFieldNames.has(overrideName)) {
                  throw new Error(
                     `[prisma-express-admin] admin.register("${modelName}") config.fields: ` +
                        `field "${overrideName}" does not exist on model "${modelName}".\n` +
                        `Available fields: ${[...modelFieldNames].sort().join(", ")}`,
                  );
               }
            }
         }

         // Guard: validate listDisplay field names
         if (rawConfig.listDisplay) {
            const modelFieldNames = new Set(meta.fields.map((f) => f.name));
            for (const fieldName of rawConfig.listDisplay) {
               if (!modelFieldNames.has(fieldName)) {
                  throw new Error(
                     `[prisma-express-admin] admin.register("${modelName}") config.listDisplay: ` +
                        `field "${fieldName}" does not exist on model "${modelName}".\n` +
                        `Available fields: ${[...modelFieldNames].sort().join(", ")}`,
                  );
               }
            }
         }

         // Guard: validate searchFields names
         if (rawConfig.searchFields) {
            const scalarStringFields = new Set(meta.fields.filter((f) => f.type === "string" && !f.isId).map((f) => f.name));
            for (const fieldName of rawConfig.searchFields) {
               if (!scalarStringFields.has(fieldName)) {
                  throw new Error(
                     `[prisma-express-admin] admin.register("${modelName}") config.searchFields: ` +
                        `field "${fieldName}" either does not exist or is not a String field on model "${modelName}". ` +
                        `Only String fields can be used as search fields.`,
                  );
               }
            }
         }

         // ── Apply displayField / pluralName overrides from config ─
         // The developer can override what the introspector auto-detected.
         // We apply these overrides directly onto a copy of the meta here
         // so downstream consumers only need to look at meta, not config.
         const resolvedMeta: AdminModelMeta = { ...meta };

         if (rawConfig.displayField) {
            const fieldExists = meta.fields.some((f) => f.name === rawConfig.displayField);
            if (!fieldExists) {
               throw new Error(`[prisma-express-admin] admin.register("${modelName}") config.displayField: ` + `field "${rawConfig.displayField}" does not exist on model "${modelName}".`);
            }
            resolvedMeta.displayField = rawConfig.displayField;
         }

         if (rawConfig.pluralName) {
            resolvedMeta.pluralName = rawConfig.pluralName.toLowerCase();
         }

         // ── Resolve the config — fill in all defaults ─────────────
         const resolved = resolveConfig(resolvedMeta, rawConfig);

         // ── Store the fully resolved entry ─────────────────────────
         this.models.set(modelName, {
            meta: resolvedMeta,
            resolved,
            raw: rawConfig,
         });
      }

      this.initialized = true;
   }

   // ============================================================
   // READ API (used by routerFactory, schemaEndpoint, auth middleware)
   // ============================================================

   /**
    * Assert that initialize() has been called.
    * Every read method calls this to give clear errors if accessed too early.
    */
   private assertInitialized(): void {
      if (!this.initialized) {
         throw new Error(`[prisma-express-admin] Registry accessed before admin.mount() was called. ` + `Make sure you call admin.mount(app) before handling any requests.`);
      }
   }

   /**
    * Get a single registered model by its Prisma model name.
    *
    * Returns undefined if the model was not registered.
    * Consumers should handle undefined — not every model in the schema
    * is necessarily registered in the admin.
    *
    * @param modelName - PascalCase model name, e.g. "User", "Post"
    */
   get(modelName: string): FullRegisteredModel | undefined {
      this.assertInitialized();
      return this.models.get(modelName);
   }

   /**
    * Get a registered model by its plural URL name.
    * e.g. "users" → the User FullRegisteredModel
    *
    * Used by the router to resolve "GET /admin/api/users" → User model.
    *
    * @param pluralName - e.g. "users", "posts", "categories"
    */
   getByPluralName(pluralName: string): FullRegisteredModel | undefined {
      this.assertInitialized();
      for (const entry of this.models.values()) {
         if (entry.meta.pluralName === pluralName) return entry;
      }
      return undefined;
   }

   /**
    * Get all registered models, in registration order.
    *
    * Used by:
    *  - GET /admin/api/schema  → returns all models to the UI
    *  - The admin sidebar      → lists all models for navigation
    */
   getAll(): FullRegisteredModel[] {
      this.assertInitialized();
      return [...this.models.values()];
   }

   /**
    * Returns the number of registered models.
    * Useful for health checks and logging.
    */
   get size(): number {
      return this.initialized ? this.models.size : this.pendingRegistrations.size;
   }

   /**
    * Whether a model name is currently registered.
    */
   has(modelName: string): boolean {
      return this.initialized ? this.models.has(modelName) : this.pendingRegistrations.has(modelName);
   }
}
