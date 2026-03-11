import { getDMMF } from "@prisma/internals";
import { readFileSync } from "fs";
import { resolve } from "path";
import type * as DMMF from "@prisma/dmmf";
import type { AdminFieldMeta, AdminFieldType, AdminModelMeta, RelationKind } from "./types.ts";

// ============================================================
// HELPERS
// ============================================================

/**
 * Lowercase the first character of a string.
 * "User" → "user", "BlogPost" → "blogPost"
 * This is how Prisma exposes models on the client:
 *   prisma.user.findMany(), prisma.blogPost.findMany()
 */
function lowerFirst(str: string): string {
   return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Map a Prisma DMMF field type string to our normalized AdminFieldType.
 *
 * DMMF field.kind tells us the broad category:
 *   "scalar"       → a primitive (String, Int, Boolean, DateTime, Json, Bytes, etc.)
 *   "enum"         → one of the enums defined in the schema
 *   "object"       → a relation to another model
 *   "unsupported"  → a DB-native type Prisma can't fully type (we treat as string)
 *
 * For scalars, we use field.type to get the specific type name.
 */
function mapPrismaTypeToAdminType(field: DMMF.Field): AdminFieldType {
   if (field.kind === "object") return "relation";
   if (field.kind === "enum") return "enum";
   if (field.kind === "unsupported") return "string";

   // kind === "scalar"
   switch (field.type) {
      case "String":
         return "string";
      case "Int":
      case "Float":
      case "Decimal":
      case "BigInt":
         return "number";
      case "Boolean":
         return "boolean";
      case "DateTime":
         return "datetime";
      case "Json":
         return "json";
      case "Bytes":
         return "bytes";
      default:
         return "string";
   }
}

/**
 * Determine the RelationKind for a relation field.
 *
 * DMMF gives us:
 *   isList              → whether this side of the relation is a list
 *   relationFromFields  → FK scalar field names on THIS model
 *                         e.g. Post.author has relationFromFields: ["authorId"]
 *                         User.posts has relationFromFields: [] (FK is on Post)
 *   relationToFields    → the fields on the OTHER model that the FK references
 *
 * Rules:
 *   isList: true  + many-to-many (both sides have no FK scalars) → "manyToMany"
 *   isList: true  + one-to-many  (FK is on the other model)      → "hasMany"
 *   isList: false + FK is ON THIS model (relationFromFields > 0)  → "belongsTo"
 *   isList: false + FK is on other model (relationFromFields = 0) → "hasOne"
 */
function determineRelationKind(field: DMMF.Field): RelationKind {
   const hasLocalFk = field.relationFromFields !== undefined && field.relationFromFields.length > 0;

   if (field.isList) {
      // A list relation where neither side owns a scalar FK → manyToMany
      // A list relation where the other side owns the FK → hasMany
      // We distinguish by checking the model's @relation configuration.
      // DMMF doesn't explicitly say "manyToMany", but many-to-many relations
      // have empty relationFromFields on BOTH sides.
      // hasMany also has empty relationFromFields on the "one" side (User.posts).
      // The practical difference at the admin layer is minimal for v1,
      // so we treat all list relations as "hasMany" and handle m2m on write.
      return "hasMany";
   }

   // Not a list
   if (hasLocalFk) return "belongsTo"; // Post.author: FK "authorId" lives here
   return "hasOne"; // User.profile: FK lives on Profile model
}

/**
 * Determine whether a field should be read-only in the admin UI.
 *
 * Read-only = shown but not editable. Applies to:
 *   - The primary key field (id)
 *   - Auto-generated fields: typically id fields with @default(uuid/cuid/autoincrement)
 *   - The @updatedAt field (auto-managed by Prisma on every update)
 *   - createdAt: DateTime @default(now()) — set on creation, never editable
 */
function isReadOnly(field: DMMF.Field): boolean {
   if (field.isId) return true;
   if (field.isUpdatedAt) return true;
   // createdAt pattern: DateTime with a @default(now()) — hasDefaultValue + type DateTime
   if (field.type === "DateTime" && field.hasDefaultValue && field.name === "createdAt") return true;
   // isGenerated covers @default(autoincrement()) and generated columns
   if (field.isGenerated) return true;
   return false;
}

/**
 * Determine whether a field should appear as a text search target.
 *
 * Defaults: all non-id, non-FK String scalar fields are searchable.
 * FK fields (isReadOnly scalars that point to another model's PK) are excluded
 * because searching "f3a1b2c3..." is not useful.
 */
function isSearchable(field: DMMF.Field): boolean {
   if (field.kind !== "scalar") return false;
   if (field.type !== "String") return false;
   if (field.isId) return false;
   if (field.isReadOnly) return false; // FK scalars like "authorId" are read-only
   return true;
}

/**
 * Determine whether a field should appear as a filter option in list view.
 *
 * Defaults:
 *   - Enum fields         → yes (show a dropdown filter)
 *   - Boolean fields      → yes (show a true/false toggle filter)
 *   - DateTime fields     → yes (show a date-range filter)
 *   - FK scalar fields    → yes (isReadOnly scalar → it's a foreign key)
 *   - Everything else     → no
 */
function isFilterable(field: DMMF.Field): boolean {
   if (field.kind === "enum") return true;
   if (field.kind === "scalar") {
      if (field.type === "Boolean") return true;
      if (field.type === "DateTime") return true;
      // FK scalars: scalar fields that are read-only but not the PK itself
      if (field.isReadOnly && !field.isId) return true;
   }
   return false;
}

/**
 * Pick the best "display field" for a model — the field that best represents
 * a record as a human-readable label in dropdowns, list titles, breadcrumbs.
 *
 * Priority order:
 *   1. A unique String field named "name", "title", "label", "username", "slug"
 *   2. Any unique String field (like "email")
 *   3. Any non-id String field
 *   4. The id field as last resort
 */
function detectDisplayField(fields: DMMF.Field[]): string {
   const preferredNames = ["name", "title", "label", "username", "slug", "email"];

   // Priority 1: unique String field with a preferred name
   for (const preferred of preferredNames) {
      const field = fields.find((f) => f.name === preferred && f.type === "String" && f.isUnique && !f.isId);
      if (field) return field.name;
   }

   // Priority 2: any unique String field
   const uniqueString = fields.find((f) => f.kind === "scalar" && f.type === "String" && f.isUnique && !f.isId);
   if (uniqueString) return uniqueString.name;

   // Priority 3: first non-id String field
   const anyString = fields.find((f) => f.kind === "scalar" && f.type === "String" && !f.isId);
   if (anyString) return anyString.name;

   // Priority 4: fall back to the id field
   const idField = fields.find((f) => f.isId);
   return idField?.name ?? "id";
}

/**
 * Build a map from enum name → array of value strings.
 * Used when processing enum fields so we can attach enumValues to AdminFieldMeta.
 *
 * DMMF enums look like:
 *   { name: "Role", values: [{ name: "ADMIN", dbName: null }, { name: "USER", dbName: null }] }
 *
 * We transform this into: Map { "Role" => ["ADMIN", "USER"] }
 */
function buildEnumValuesMap(enums: readonly DMMF.DatamodelEnum[]): Map<string, string[]> {
   const map = new Map<string, string[]>();
   for (const e of enums) {
      map.set(
         e.name,
         e.values.map((v) => v.name),
      );
   }
   return map;
}

// ============================================================
// FIELD INTROSPECTOR
// ============================================================

/**
 * Transform a single DMMF Field into our AdminFieldMeta format.
 *
 * The modelNames set is used to detect whether a scalar field is a FK:
 * e.g. "authorId" is a FK because "Author" or "User" exists as a model.
 * We rely on DMMF's isReadOnly flag for this — Prisma marks FK scalar
 * fields as isReadOnly: true automatically.
 */
function introspectField(field: DMMF.Field, enumValuesMap: Map<string, string[]>, allModelNames: Set<string>): AdminFieldMeta {
   const type = mapPrismaTypeToAdminType(field);
   const readOnly = isReadOnly(field);

   const fieldMeta: AdminFieldMeta = {
      name: field.name,
      type,
      prismaType: field.type,
      isId: field.isId,
      isRequired: field.isRequired,
      isUnique: field.isUnique,
      isReadOnly: readOnly,
      isList: field.isList,
      isFilterable: isFilterable(field),
      isSearchable: isSearchable(field),
      defaultValue: field.default ?? null,
      enumValues: field.kind === "enum" ? enumValuesMap.get(field.type) : undefined,
      relation: null,
   };

   // ── Relation metadata ──────────────────────────────────────
   if (field.kind === "object" && field.relationName) {
      const kind = determineRelationKind(field);

      // The displayField for the related model will be resolved later by the
      // introspector once all models are processed. We set a placeholder here
      // ("id") and the introspector patches it in a second pass.
      fieldMeta.relation = {
         model: field.type, // the related Prisma model name
         kind,
         relationName: field.relationName,
         foreignKeyFields: field.relationFromFields ? [...field.relationFromFields] : [],
         displayField: "id", // patched in second pass
      };
   }

   return fieldMeta;
}

// ============================================================
// MODEL INTROSPECTOR
// ============================================================

/**
 * Transform a single DMMF Model into our AdminModelMeta format.
 *
 * Returns null if:
 *   - The model has a composite primary key (@@id([a, b])) — v1 limitation
 *   - The model has no primary key at all (views, etc.)
 */
function introspectModel(model: DMMF.Model, enumValuesMap: Map<string, string[]>, allModelNames: Set<string>): AdminModelMeta | null {
   // ── Composite PK guard ─────────────────────────────────────
   // DMMF.Model.primaryKey is non-null when @@id([a,b]) is used.
   // A single-field PK (@id on a field) sets primaryKey to null and
   // marks the field with field.isId = true instead.
   if (model.primaryKey !== null) {
      console.warn(`[prisma-express-admin] Skipping model "${model.name}": composite primary keys (@@id) are not supported in v1.`);
      return null;
   }

   // ── Find the single PK field ───────────────────────────────
   const pkField = model.fields.find((f) => f.isId);
   if (!pkField) {
      console.warn(`[prisma-express-admin] Skipping model "${model.name}": no @id field found.`);
      return null;
   }

   // ── Introspect all fields ─────────────────────────────────
   const fields = model.fields.map((f) => introspectField(f, enumValuesMap, allModelNames));

   // ── Timestamps ─────────────────────────────────────────────
   const createdAtField = model.fields.find((f) => f.name === "createdAt" && f.type === "DateTime");
   const updatedAtField = model.fields.find((f) => (f.name === "updatedAt" || f.isUpdatedAt) && f.type === "DateTime");

   // ── Searchable / filterable field lists ────────────────────
   const searchableFields = fields.filter((f) => f.isSearchable).map((f) => f.name);

   const filterableFields = fields.filter((f) => f.isFilterable).map((f) => f.name);

   // ── Display field ─────────────────────────────────────────
   const displayField = detectDisplayField(model.fields as DMMF.Field[]);

   // ── prismaClientKey ────────────────────────────────────────
   // Prisma client always uses lowerFirst(ModelName) as the property key.
   // User → prisma.user, BlogPost → prisma.blogPost
   const prismaClientKey = lowerFirst(model.name);

   // ── pluralName ─────────────────────────────────────────────
   // Simple lowercase plural for URL routing. e.g. "User" → "users"
   // Developer can override this via ModelConfig.pluralName.
   // We do basic English pluralisation — good enough for model names.
   const pluralName = simplePlural(model.name);

   return {
      name: model.name,
      pluralName,
      prismaClientKey,
      fields,
      idField: pkField.name,
      displayField,
      searchableFields,
      filterableFields,
      timestamps: {
         createdAt: createdAtField?.name,
         updatedAt: updatedAtField?.name,
      },
   };
}

/**
 * Very simple English pluralisation for model names.
 * Handles the common cases. Not a full inflection library.
 * e.g. "User" → "users", "Category" → "categories", "Status" → "statuses"
 */
function simplePlural(name: string): string {
   const lower = name.toLowerCase();
   if (lower.endsWith("y")) return lower.slice(0, -1) + "ies";
   if (lower.endsWith("s") || lower.endsWith("x") || lower.endsWith("z")) return lower + "es";
   if (lower.endsWith("ch") || lower.endsWith("sh")) return lower + "es";
   return lower + "s";
}

// ============================================================
// SECOND PASS: PATCH RELATION DISPLAY FIELDS
// ============================================================

/**
 * After all models are introspected, we can resolve the displayField
 * for each relation. This requires the full model map to be built first,
 * which is why it's a second pass.
 *
 * For each relation field on every model, we look up the related model
 * in the map and copy its displayField into the relation metadata.
 */
function patchRelationDisplayFields(models: Map<string, AdminModelMeta>): void {
   for (const model of models.values()) {
      for (const field of model.fields) {
         if (field.type === "relation" && field.relation) {
            const relatedModel = models.get(field.relation.model);
            if (relatedModel) {
               // We need to cast because relation is typed as readonly inside
               (field.relation as { displayField: string }).displayField = relatedModel.displayField;
            }
         }
      }
   }
}

// ============================================================
// PUBLIC API
// ============================================================

export interface IntrospectOptions {
   /**
    * Path to the schema.prisma file.
    * Default: "prisma/schema.prisma" (relative to process.cwd())
    */
   schemaPath?: string;
}

/**
 * Read a Prisma schema file and return a map of model name → AdminModelMeta.
 *
 * This is the entry point of the entire introspection system.
 * It is async because getDMMF() compiles the schema using a WASM engine.
 *
 * The result is cached — calling introspect() multiple times with the same
 * schemaPath returns the same Map without recompiling the schema.
 *
 * Usage:
 *   const models = await introspect()
 *   models.get("User")   // → AdminModelMeta
 *   models.get("Post")   // → AdminModelMeta
 */

const cache = new Map<string, Map<string, AdminModelMeta>>();

export async function introspect(options: IntrospectOptions = {}): Promise<Map<string, AdminModelMeta>> {
   const schemaPath = resolve(process.cwd(), options.schemaPath ?? "prisma/schema.prisma");

   // Return cached result if already introspected for this schema path
   if (cache.has(schemaPath)) {
      return cache.get(schemaPath)!;
   }

   // ── Read the schema file ───────────────────────────────────
   let schemaContent: string;
   try {
      schemaContent = readFileSync(schemaPath, "utf-8");
   } catch {
      throw new Error(
         `[prisma-express-admin] Could not read schema file at "${schemaPath}".\n` +
            `Make sure the file exists and the path is correct.\n` +
            `You can set a custom path via: createAdmin({ schemaPath: "path/to/schema.prisma" })`,
      );
   }

   // ── Parse DMMF via @prisma/internals ──────────────────────
   // getDMMF compiles the schema using a WASM-based query engine.
   // This is the same compilation Prisma does during `prisma generate`.
   let dmmf: Awaited<ReturnType<typeof getDMMF>>;
   try {
      dmmf = await getDMMF({ datamodel: schemaContent });
   } catch (err) {
      throw new Error(`[prisma-express-admin] Failed to parse Prisma schema at "${schemaPath}".\n` + `Original error: ${err instanceof Error ? err.message : String(err)}`);
   }

   const { models: dmmfModels, enums: dmmfEnums } = dmmf.datamodel;

   // ── Build enum values map ─────────────────────────────────
   const enumValuesMap = buildEnumValuesMap(dmmfEnums);

   // ── Collect all model names (used in FK detection) ────────
   const allModelNames = new Set(dmmfModels.map((m) => m.name));

   // ── First pass: introspect all models ─────────────────────
   const result = new Map<string, AdminModelMeta>();

   for (const dmmfModel of dmmfModels) {
      const meta = introspectModel(dmmfModel, enumValuesMap, allModelNames);
      if (meta !== null) {
         result.set(meta.name, meta);
      }
   }

   // ── Second pass: patch relation displayFields ─────────────
   patchRelationDisplayFields(result);

   // ── Cache and return ──────────────────────────────────────
   cache.set(schemaPath, result);
   return result;
}

/**
 * Clear the introspection cache.
 * Useful in tests and in development hot-reload scenarios.
 */
export function clearIntrospectionCache(): void {
   cache.clear();
}
