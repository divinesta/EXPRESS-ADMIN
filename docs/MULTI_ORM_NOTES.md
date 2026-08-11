# Multi-ORM Notes (Future)

Research notes on whether this admin can support ORMs beyond Prisma (TypeORM, Drizzle, etc.), and whether those ecosystems have something like `@prisma/internals`.

**Status:** Planning only. The product is Prisma-native for v1. Do not implement multi-ORM until packaging and scalar Prisma admin are solid.

**Related:** [Library packaging roadmap](../LIBRARY_PACKAGING_ROADMAP.md) · [Architecture](../prisma_admin_architecture.md) · [Scalar CRUD API](./api.md)

---

## Bottom line

| Question | Answer |
| --- | --- |
| Can we support TypeORM / Drizzle later? | Yes, via **adapters** — not a small flag flip. |
| Do they have `@prisma/internals`? | **No.** They expose **public runtime metadata** instead (often better for tooling). |
| Should we design multi-ORM now? | Only lightly: keep core UI/API schema-driven; keep Prisma coupling in introspector + router. |
| What should we do next? | Stay on the packaging roadmap. Multi-ORM is after Prisma is a real library. |

---

## Current codebase: Prisma-native end-to-end

Today the library assumes Prisma in three places:

1. **Introspection** — compile `schema.prisma` via `getDMMF` from `@prisma/internals`
2. **CRUD** — model delegates (`findMany` / `findFirst` / `count` / `create` / `updateMany` / `deleteMany`) and Prisma-shaped `where` / `select` / `orderBy` / `skip` / `take` / `data` (including `contains` and optional insensitive mode)
3. **Types / public API** — `PrismaClient`, `prismaClientKey`, hooks and configs that take a Prisma client

A drop-in multi-ORM story is blocked until those concerns are split behind an adapter contract.

---

## Popular JS data layers (overview)

| Tool | What it is | Schema / models |
| --- | --- | --- |
| **TypeORM** | Entity ORM (decorators / DataSource); Data Mapper + Active Record | Entities registered on `DataSource`; multi-dialect SQL (+ Mongo) |
| **Drizzle** | TypeScript-first SQL ORM / query layer | Schema as TS table definitions (`pgTable`, etc.); Drizzle-Kit for migrations |
| **Sequelize** | Classic Active-Record-style ORM | `define` / `Model.init`; `findAll` / `create` / `update` / `destroy` |
| **MikroORM** | Data Mapper + Unit of Work + Identity Map | Decorators, `defineEntity`, or `EntitySchema`; `EntityManager` flush |
| **Objection.js** | Relational layer on **Knex** | Model classes + relations; Knex for SQL / migrations |
| **Kysely** | Type-safe SQL query builder (not a classical entity ORM) | Table types (+ optional codegen from DB) |

---

## Something like `@prisma/internals`?

Prisma publishes `@prisma/internals` as an **internal** package with **no API or SemVer guarantees**. External tools still call schema/DMMF helpers such as `getDMMF`. This project already uses that path in the introspector (schema file → metadata), not `Prisma.dmmf` on a generated client.

Other ORMs generally **do not** mirror that “internal schema compiler” model. They expose **public (or semi-public) runtime metadata** suitable for admin tooling:

| ORM | Metadata surface (for admin-style tooling) |
| --- | --- |
| **TypeORM** | `DataSource.hasMetadata` / `getMetadata` → `EntityMetadata` |
| **MikroORM** | `MetadataStorage` (`getMetadata`, `getAll`) and `EntityMetadata` |
| **Drizzle** | Host-supplied tables + `getTableConfig` / `getColumns` (columns, indexes, FKs, PKs, name, schema) |
| **Sequelize** | `model.rawAttributes` (and related model registry APIs) |
| **Objection / Knex** | Declarative models + Knex schema tools; less “one file → full graph” than Prisma |
| **Kysely** | Types as source of truth; optional DB introspection/codegen — not entity metadata like TypeORM |

### Practical difference

| Approach | Example | Implication for admin |
| --- | --- | --- |
| **Compile schema file** | Prisma `getDMMF(schema.prisma)` | Need schema path (or equivalent) at mount; version-coupled internals |
| **Read live runtime metadata** | TypeORM `DataSource`, MikroORM storage | Host already registered entities; no DMMF package |
| **Host-supplied schema objects** | Drizzle tables + relations | Consumer passes tables/relations into the adapter; no auto-scan of a single Prisma-like file |

For multi-ORM adapters, **public runtime metadata is often easier** than depending on an internals package — but each ORM needs its own discovery + CRUD mapping.

---

## What would have to change for multi-ORM

### Hard design blockers today

- Prisma-only types and fields (`prismaType`, `prismaClientKey`, handlers receiving `PrismaClient`)
- Single-string `idField` (composite PKs already out of scope for v1)
- Prisma relation-write semantics (`connect` / `disconnect` / `create` / `set`) as the hardest CRUD surface
- Product choice to ship **Prisma-native first**, not adapter-based from day one

### Adapter hooks by ORM (if added later)

| ORM | Natural integration |
| --- | --- |
| **Prisma** | `schemaPath` + `getDMMF` + consumer’s Prisma client (current path) |
| **TypeORM** | Live `DataSource` metadata + `getRepository` / `EntityManager` after entities are registered — no schema-file DMMF step |
| **Drizzle** | Host-supplied table objects via `getTableConfig` / `getColumns`, plus relation graph (e.g. `defineRelations`); `drizzle()` alone does not auto-discover models like Prisma DMMF |
| **Sequelize** | Registered models + `rawAttributes` + model static CRUD |
| **MikroORM** | `EntityManager` / metadata storage after init |

### Established multi-ORM admin pattern (AdminJS-style)

Split responsibilities:

| Piece | Role |
| --- | --- |
| **BaseResource** (or equivalent) | Per-model CRUD: list, get, create, update, delete |
| **BaseDatabase** | Load models from a connection when metadata is available |
| **BaseProperty** | Map attributes from ORM metadata into UI field types |

Then register one adapter per ORM (Prisma, TypeORM, Sequelize, MikroORM, Objection, etc.).

This library would need its **own** resource interface mapped to the existing scalar route contracts and schema endpoint — not a copy of AdminJS APIs.

---

## Packaging if multi-ORM ships later

Node `package.json` `"exports"` can expose a main entry plus subpaths and block private paths.

Common multi-backend layouts:

| Style | Example | Notes |
| --- | --- | --- |
| **Scoped adapter packages** | `@auth/prisma-adapter` | Core package + one package per backend; ORM as **peerDependency** |
| **Core + subpath re-exports** | `better-auth` + `./adapters/prisma` | Hybrid: separate packages and/or subpath exports; optional peers |
| **Separate DB packages** | `@payloadcms/db-postgres` | Heavy backends install separately from core |

**Illustrative target names** (not published today):

```text
express-admin                 # core: registry, UI shell, auth, routes (ORM-neutral)
express-admin/prisma          # or @scope/adapter-prisma
express-admin/typeorm
express-admin/drizzle
```

Current packaging plan remains a **single Prisma-focused package** with a root `"."` export and Express/Prisma peers — not multi-adapter packages yet. See [LIBRARY_PACKAGING_ROADMAP.md](../LIBRARY_PACKAGING_ROADMAP.md).

Community practice: put the host framework and backend ORMs in **peerDependencies** so consumers share one version and avoid duplicates.

---

## Hard parts that do not translate 1:1

These remain difficult even with clean adapters:

1. **Relation writes** — Prisma `connect` / `disconnect` / nested create vs TypeORM relation setters vs Drizzle insert/update shapes  
2. **Composite primary keys** — already scoped out of Prisma v1; every ORM handles compounds differently  
3. **Search / filter dialects** — e.g. Prisma `mode: "insensitive"` is PostgreSQL-oriented; others need dialect-specific builders  
4. **Drizzle discovery** — host must pass tables (and often relations); not “point at one schema file” like Prisma  
5. **Kysely / raw Knex** — low “zero-config admin” fit; more manual property definition  

---

## Recommendations (thinking ahead without slowing v1)

1. **Ship Prisma-only** for v1. That is the differentiator and the path already built.  
2. **While packaging, lightly de-Prisma names of core types where cheap**  
   e.g. `prismaClientKey` → `clientKey` in shared meta; keep Prisma-specific logic in the Prisma layer. Do **not** build TypeORM yet.  
3. **Do not invent a full adapter interface until a second ORM is real.** Premature abstraction costs more than a later refactor.  
4. **If a second ORM is added, prefer rich public metadata first:**  
   - **TypeORM** or **MikroORM** (closest “entities + metadata” mental model)  
   - **Drizzle** second or third (popular; host-supplied schema)  
   - **Kysely / Knex** lowest priority for Django-admin-like zero config  
5. **Packaging multi-ORM is a later phase**, after Phase 1 packaging (library vs example) and a stable Prisma surface.

---

## Suggested phases (only after Prisma library is honest)

| Phase | Work |
| --- | --- |
| **A** | Extract ORM-neutral contracts: model meta, field meta, resource CRUD interface used by `routerFactory` |
| **B** | Move current Prisma path into an internal (then public) Prisma adapter |
| **C** | Second adapter (TypeORM or MikroORM) + example app |
| **D** | Package layout: core + adapter packages/subpaths; peers per ORM |
| **E** | Drizzle adapter if demand warrants |

---

## Uncertainties / open questions

Documented gaps from the research pass (not blockers for Prisma v1):

- Relative production share among TypeORM / Drizzle / Sequelize / etc. was not measured here.  
- Long-term stability contracts of each ORM’s metadata API across major versions need verification before promising support.  
- Drizzle: how far `getTableConfig` FKs go vs a separate relations graph for admin relation UI.  
- Exact adapter method set should follow **this** product’s scalar API, not AdminJS signatures.  
- Preferred package layout (Auth.js-style separate packages vs hybrid subpaths vs Payload-style DB packages) can wait until a second ORM is committed.

---

## Sources (research pass)

- TypeORM entities / DataSource API — https://typeorm.io/  
- Drizzle overview / goodies (`getTableConfig`) — https://orm.drizzle.team/  
- Sequelize model basics — https://sequelize.org/  
- MikroORM docs / MetadataStorage — https://mikro-orm.io/  
- Objection.js / Knex — https://vincit.github.io/objection.js/  
- Kysely intro — https://kysely.dev/  
- Prisma / `@prisma/internals` context — Prisma blog + local package types  
- AdminJS resources & adapters — https://docs.adminjs.co/  
- Packaging patterns: Auth.js adapters, Better Auth adapters, Payload DB packages, Node `exports`  
- This repo: `src/core/introspector.ts`, `src/api/routerFactory.ts`, `src/core/types.ts`, `LIBRARY_PACKAGING_ROADMAP.md`
