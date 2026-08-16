import type { Request } from "express";

/**
 * The admin operates on Prisma model delegates selected at runtime from DMMF
 * metadata. It deliberately does not depend on a generated client from this
 * repository, so consumers can pass their own PrismaClient instance.
 */
export type PrismaLike = object;

// ============================================================
// FIELD TYPES
// ============================================================

/**
 * The normalized type of a field — our own system's vocabulary,
 * not Prisma's raw type names. The introspector maps Prisma types
 * onto these.
 *
 * e.g. Prisma "String" → "string", Prisma "Int"/"Float" → "number"
 */
export type AdminFieldType = "string" | "number" | "boolean" | "datetime" | "json" | "enum" | "relation" | "bytes";

/**
 * The kind of relation this field represents.
 * - belongsTo  → many-to-one  (e.g. Post.author → User)
 * - hasMany    → one-to-many  (e.g. User.posts → Post[])
 * - manyToMany → many-to-many (e.g. Post.tags ↔ Tag[])
 * - hasOne     → one-to-one   (e.g. User.profile → Profile)
 */
export type RelationKind = "belongsTo" | "hasMany" | "manyToMany" | "hasOne";

// ============================================================
// FIELD METADATA
// ============================================================

/**
 * Everything we know about a single field on a model,
 * extracted from Prisma's DMMF and normalized into our
 * own format.
 *
 * This is the smallest building block of the entire system.
 * Every form widget, every filter, every list column is driven
 * by one of these objects.
 */
export interface AdminFieldMeta {
   /** The field name as defined in the Prisma schema. e.g. "email" */
   name: string;

   /** Our normalized type. e.g. "string", "number", "relation" */
   type: AdminFieldType;

   /** The raw Prisma type string. e.g. "String", "Int", "DateTime" */
   prismaType: string;

   /** Whether this field is the primary key (id field) */
   isId: boolean;

   /** Whether this field is required (non-nullable in the schema) */
   isRequired: boolean;

   /** Whether this field has a @unique constraint */
   isUnique: boolean;

   /**
    * Whether this field should be read-only in the admin UI.
    * True for auto-generated fields like id, createdAt, updatedAt.
    * These are shown but cannot be edited.
    */
   isReadOnly: boolean;

   /**
    * Whether this field is a list (array) type.
    * e.g. tags String[] in Prisma → isList: true
    */
   isList: boolean;

   /**
    * Whether this field should appear as a filter option in list view.
    * Default: true for enums, booleans, DateTime, foreign key fields.
    */
   isFilterable: boolean;

   /**
    * Whether this field is included in text search.
    * Default: true for all String fields.
    */
   isSearchable: boolean;

   /** The default value defined in the schema, if any */
   defaultValue: unknown;

   /** For enum fields — the list of valid string values */
   enumValues?: string[];

   /**
    * For relation fields — metadata about the related model.
    * null for all non-relation fields.
    */
   relation?: {
      /** The name of the related Prisma model. e.g. "User" */
      model: string;

      /** The kind of relation. e.g. "belongsTo", "hasMany" */
      kind: RelationKind;

      /**
       * The field name on the related model that points back here.
       * e.g. on Post.author, the relationName points to User.posts
       */
      relationName: string;

      /**
       * The scalar FK field(s) on this model.
       * e.g. for Post.author (belongsTo User), this would be ["authorId"]
       */
      foreignKeyFields: string[];

      /**
       * Which field on the related model to display in dropdowns
       * and relation selectors. e.g. "email", "name", "title"
       * The introspector picks this automatically (first unique string field).
       * Overridable via ModelConfig.
       */
      displayField: string;
   } | null;
}

// ============================================================
// MODEL METADATA
// ============================================================

/**
 * Everything we know about an entire model — its fields, its
 * primary key, which fields are searchable/filterable, etc.
 *
 * One of these exists for every model registered with admin.register().
 * The introspector builds these from DMMF. The router factory and
 * UI schema endpoint consume them.
 */
export interface AdminModelMeta {
   /** Model name as in the Prisma schema. e.g. "User" */
   name: string;

   /**
    * Lowercase plural name used in URLs and display.
    * e.g. "User" → "users", "BlogPost" → "blogposts"
    * (Overridable via ModelConfig)
    */
   pluralName: string;

   /**
    * The key used to access this model on the Prisma client.
    * e.g. "user" for prisma.user.findMany()
    * Prisma lowercases model names for client access.
    */
   prismaClientKey: string;

   /** All fields on this model */
   fields: AdminFieldMeta[];

   /**
    * The name of the primary key field.
    * NOTE: We scope out composite PKs in v1. If a model has @@id([a,b]),
    * it will be skipped during registration with a warning.
    */
   idField: string;

   /**
    * The field used as the human-readable label for a record.
    * Shown in relation dropdowns, list view titles, etc.
    * e.g. "email" for User, "title" for Post
    * Determined automatically but overridable via ModelConfig.
    */
   displayField: string;

   /** All field names that are included in text search */
   searchableFields: string[];

   /** All field names that can be used as filters in list view */
   filterableFields: string[];

   /** Timestamp field names, auto-detected from DMMF */
   timestamps: {
      createdAt?: string;
      updatedAt?: string;
   };
}

// ============================================================
// DEVELOPER CONFIGURATION (what admin.register() accepts)
// ============================================================

/**
 * A custom action that can be run from the admin list view.
 * Like Django admin actions — e.g. "Deactivate selected users".
 */
export interface AdminAction {
   /** Unique machine-readable name. Used in the API route. e.g. "deactivate_selected" */
   name: string;

   /** Human-readable label shown in the UI. e.g. "Deactivate selected" */
   label: string;

   /**
    * The function that runs when this action is triggered.
    * ids: the list of selected record IDs
    * adminUser: the currently logged-in admin
    * prisma: the Prisma client instance (for DB operations)
    */
   handler: (params: { ids: Array<string | number>; adminUser: AdminUser; prisma: PrismaLike }) => Promise<{ message: string }>;

   /** Which roles can run this action. If omitted, any admin can run it. */
   allowedRoles?: string[];
}

/**
 * Per-field overrides — lets developers customize how individual
 * fields behave in the admin, without changing the Prisma schema.
 */
export interface AdminFieldOverride {
   /** If true, this field is completely hidden from the admin UI */
   exclude?: boolean;

   /**
    * Explicitly allow a sensitive field to be exposed by the admin. Sensitive
    * field names are hidden by default, even when the field is introspected.
    */
   expose?: boolean;

   /** If true, field is shown but cannot be edited */
   readOnly?: boolean;
}

/**
 * Permission levels for a model.
 * Each value is a list of role strings that are allowed to perform that action.
 * e.g. { delete: ["SUPER_ADMIN"] } means only SUPER_ADMIN can delete.
 *
 * If a permission is omitted, any authenticated admin can perform that action.
 */
export interface ModelPermissions {
   list?: string[];
   view?: string[];
   create?: string[];
   update?: string[];
   delete?: string[];
   /** Which roles can run which custom actions */
   actions?: Record<string, string[]>;
}

/**
 * The full configuration object passed as the second argument to
 * admin.register("ModelName", config).
 *
 * Every property is optional — sensible defaults are derived from DMMF.
 */
export interface ModelConfig {
   // ── List view ──────────────────────────────────────────────
   /** Which fields to show as columns in the list view */
   listDisplay?: string[];

   /** Which eligible fields to expose as list filters. Omit for no filters. */
   listFilter?: string[];

   /** Which fields are included in the search bar */
   searchFields?: string[];

   /** Default sort order for the list */
   defaultSort?: { field: string; direction: "asc" | "desc" };

   /** Number of records per page. Default: 25 */
   perPage?: number;

   // ── Detail / Form view ─────────────────────────────────────
   /** Per-field visibility and read-only overrides. */
   fields?: Record<string, AdminFieldOverride>;

   // ── Behaviour ──────────────────────────────────────────────
   /** Custom actions available in the list view */
   actions?: AdminAction[];

   /** Permissions — which roles can perform which operations */
   permissions?: ModelPermissions;

   /**
    * Scope function — filters all queries by the logged-in admin's context.
    * Critical for multi-tenant apps. Return a Prisma where clause.
    *
    * e.g. Only show records belonging to the admin's institution:
    *   scope: async (adminUser) => ({ institutionId: adminUser.institutionId })
    *
    * SUPER_ADMIN returns {} to see everything.
    */
   scope?: (adminUser: AdminUser) => Promise<Record<string, unknown>>;

   // ── Lifecycle hooks ────────────────────────────────────────
   /** Called before a new record is created. Can modify or validate data. */
   beforeCreate?: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;

   /** Called after a record is successfully created. */
   afterCreate?: (record: Record<string, unknown>) => Promise<void>;

   /** Called before a record is updated. Can modify or validate data. */
   beforeUpdate?: (id: string, data: Record<string, unknown>) => Promise<Record<string, unknown>>;

   /** Called after a record is successfully updated. */
   afterUpdate?: (record: Record<string, unknown>) => Promise<void>;

   /** Called before a record is deleted. Throw an error here to prevent deletion. */
   beforeDelete?: (id: string) => Promise<void>;

   /** Called after a record is deleted. */
   afterDelete?: (id: string) => Promise<void>;

   // ── Display ────────────────────────────────────────────────
   /** Override the auto-detected displayField for this model */
   displayField?: string;

   /** Override the auto-detected plural name used in URLs */
   pluralName?: string;
}

// ============================================================
// AUTH
// ============================================================

/**
 * The shape of an authenticated admin user inside the system.
 * This is what auth middleware attaches to req.adminUser.
 */
export interface AdminUser {
   id: string;
   email: string;
   role: string;

   /**
    * If true, bypasses all permission checks.
    * This user can see and do everything.
    */
   isSuperAdmin: boolean;

   /**
    * Optional: for multi-tenant apps, which institution/tenant
    * this admin belongs to. Used by the scope function.
    */
   institutionId?: string;

   /** Optional tenant identifier for applications that scope records by tenant. */
   tenantId?: string;

   /** Arbitrary extra data you want available in scope/hooks */
   metadata?: Record<string, unknown>;
}

/**
 * The auth configuration passed to createAdmin().
 * Tells the system how to verify a request and identify the admin user.
 */
export interface AuthConfig {
   /**
    * Given a request, return the authenticated AdminUser or null.
    * Throw or return null to reject the request (401).
    *
    * You implement this. Examples:
    * - Check a session cookie
    * - Verify a JWT Bearer token
    * - Look up an API key
    */
   getCurrentUser: (req: Request) => Promise<AdminUser | null>;

}

/** A safe, append-only description of an admin mutation. */
export interface AdminAuditEvent {
   type: "create" | "update" | "delete" | "action";
   modelName: string;
   recordIds: Array<string | number>;
   actor: Pick<AdminUser, "id" | "email" | "role">;
   timestamp: Date;
   /** Safe context only, such as an action name. Never include field values or secrets. */
   metadata?: Record<string, string | number | boolean | null>;
}

/**
 * Consumer-owned audit destination. The library creates events but does not
 * impose a database table or logging provider on the host application.
 */
export interface AuditConfig {
   write(event: AdminAuditEvent): Promise<void>;
}

// ============================================================
// TOP-LEVEL ADMIN CONFIG
// ============================================================

/**
 * The configuration object passed to createAdmin().
 * This is the entry point for the entire library.
 */
export interface AdminConfig {
   /** Your generated PrismaClient instance */
   prisma: PrismaLike;

   /** The base URL path for the admin UI. Default: "/admin" */
   basePath?: string;

   /**
    * Path to the schema.prisma file.
    * Default: "prisma/schema.prisma" (relative to process.cwd())
    * Override this if your schema lives in a non-standard location.
    *
    * e.g. createAdmin({ prisma, auth, schemaPath: "db/schema.prisma" })
    */
   schemaPath?: string;

   /** How to authenticate admin users */
   auth: AuthConfig;

   /** Optional append-only writer called after successful admin mutations. */
   audit?: AuditConfig;

   /**
    * The name shown in the admin UI header.
    * Default: "Prisma Admin"
    */
   siteName?: string;

   /**
    * Database provider — needed to handle provider-specific
    * search behaviour (e.g. insensitive mode is PostgreSQL-only).
    * If omitted, the introspector will attempt to detect it from DMMF.
    */
   databaseProvider?: "postgresql" | "mysql" | "sqlite" | "sqlserver" | "mongodb";
}

// ============================================================
// EXPRESS REQUEST AUGMENTATION
// ============================================================

/**
 * Augment Express's Request type so that req.adminUser is
 * available everywhere after auth middleware runs.
 *
 * This means TypeScript knows req.adminUser exists on
 * authenticated admin routes — no casting needed.
 */
declare global {
   namespace Express {
      interface Request {
         adminUser?: AdminUser;
      }
   }
}

// ============================================================
// PAGINATION
// ============================================================

/** Standard paginated response shape for list endpoints */
export interface PaginatedResponse<T> {
   records: T[];
   total: number;
   page: number;
   perPage: number;
   totalPages: number;
}

// ============================================================
// SCHEMA ENDPOINT RESPONSE
// ============================================================

/**
 * What GET /admin/api/schema returns.
 * The entire UI is driven by this response — it fetches this once
 * on load and uses it to render every list, form, and filter panel.
 */
export interface SchemaResponse {
   /** Safe identity of the authenticated admin who requested the schema. */
   identity: {
      id: string;
      email: string;
      role: string;
      isSuperAdmin: boolean;
   };
   models: Array<{
      meta: AdminModelMeta;
      config: {
         listDisplay: string[];
         listFilter: string[];
         searchFields: string[];
         defaultSort: { field: string; direction: "asc" | "desc" };
         perPage: number;
         /** Effective permissions for this admin, ready for UI decisions. */
         permissions: {
            list: boolean;
            view: boolean;
            create: boolean;
            update: boolean;
            delete: boolean;
            actions: Record<string, boolean>;
         };
         /** Actions this admin may run from the model's list view. */
         actions: Array<{ name: string; label: string }>;
      };
   }>;
   siteName: string;
   basePath: string;
}
