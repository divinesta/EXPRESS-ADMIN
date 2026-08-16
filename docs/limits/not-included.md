# What is not included

This page is the contract for `0.2.x`. When a feature ships, the bullet leaves this list.

## Writes

- Nested `create` / `connect` / `set` payloads
- Many-to-many editors
- `hasMany` inline tables on the parent form
- File / `Bytes` uploads
- Rich text or custom widgets

You can set a `belongsTo` foreign key. That is the full relation write model.

## Auth and UI

- No login page, session store, or password reset
- No dashboards beyond model counts
- No fieldsets, collapsed groups, or per-field help text
- No plugin API

## Schema

- Composite primary keys (`@@id([a, b])`) — skipped
- Models with no `@id` (views) — skipped
- `prisma.$queryRaw` / unmapped SQL — not introspected

## Operations

- CSV / JSON export
- Built-in audit table (you pass `audit.write`)
- Row-level history tab

## Deploy

- The Prisma schema file must ship with the app (or you pass `schemaPath`)
- The UI is the pre-built bundle inside the package. You do not run a React build in the consumer app

If you need something on this list, it is not a missing config key. It is not built.
