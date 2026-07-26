# Scalar CRUD API

This is the first, scalar-only version of the Prisma Express Admin API. It supports registered Prisma models and scalar create/update data. Nested relation writes, inline editing, bulk actions, and file uploads are not supported yet.

## Authentication and authorization

Every route below is mounted under the configured `basePath` (default: `/admin`) and requires `auth.getCurrentUser(req)` to return an `AdminUser`.

For every request, the API performs these checks in order:

1. Authenticate the caller.
2. Resolve the requested registered model.
3. Check the caller's permission for the operation.
4. Apply the model's `scope()` to the Prisma query.
5. Validate input before it reaches Prisma.

An omitted model permission allows every authenticated admin. `isSuperAdmin: true` bypasses role allowlists. A model `scope()` is applied to list, read, update, and delete operations. For create, simple equality scope fields are inserted into the data automatically; callers cannot supply a conflicting value.

## Endpoints

| Method | Route | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/api/:model` | `list` | Paginated list of scoped records. |
| `GET` | `/api/:model/:id` | `view` | One scoped record. Returns `404` when absent or outside the caller's scope. |
| `POST` | `/api/:model` | `create` | Create a scalar-only record. |
| `PUT` | `/api/:model/:id` | `update` | Update scalar writable fields on a scoped record. |
| `DELETE` | `/api/:model/:id` | `delete` | Delete a scoped record. |
| `GET` | `/api/schema` | authenticated | Return the schema metadata safe for the admin UI. |

`:model` is the model's plural admin name, for example `posts` for `Post`.

## List queries

The list endpoint accepts only these general parameters:

| Parameter | Example | Behaviour |
| --- | --- | --- |
| `page` | `?page=2` | Positive page number. |
| `sort` | `?sort=title` | A visible scalar field only. |
| `dir` | `?dir=asc` | `asc` or `desc`. |
| `search` | `?search=quarterly` | Searches only configured, visible string `searchFields`. PostgreSQL uses case-insensitive matching when `databaseProvider: "postgresql"` is configured. |

Filters must be listed in `admin.register(..., { listFilter: [...] })`; every other filter is rejected with `400 VALIDATION_ERROR`.

- Boolean, enum, string, and number filters use exact values: `?published=true`.
- Date-time filters support inclusive ranges: `?createdAt_gte=2026-01-01T00:00:00.000Z&createdAt_lte=2026-12-31T23:59:59.999Z`.
- The API combines scope, filters, and search with Prisma `AND`, so a caller cannot use filtering to escape a tenant boundary.

If `listDisplay` contains a visible `belongsTo` or `hasOne` relation, the API returns that relation's safe display field (for example, `author.email`). It does not automatically load list relations such as `posts` or other large collections.

## Write safety

Create and update requests must be JSON objects containing only visible, writable scalar fields. The API rejects:

- unknown fields;
- IDs, generated fields, and read-only fields;
- relation/nested-write objects;
- invalid scalar or enum values;
- sensitive fields such as password hashes, tokens, and secrets, unless a model explicitly sets `fields: { fieldName: { expose: true } }`;
- changes to any field controlled by the model scope.

## Responses and errors

List responses have this shape:

```json
{
  "records": [],
  "total": 0,
  "page": 1,
  "perPage": 25,
  "totalPages": 0
}
```

Every expected API failure uses the same shape:

```json
{
  "error": "Record not found",
  "code": "RECORD_NOT_FOUND"
}
```

| Status | Code | Meaning |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | Invalid query parameter or write payload. |
| `401` | `AUTHENTICATION_REQUIRED` | The auth adapter returned no valid admin user. |
| `403` | `PERMISSION_DENIED` | The admin lacks the configured role for the action. |
| `404` | `MODEL_NOT_FOUND` | The plural model name is not registered. |
| `404` | `RECORD_NOT_FOUND` | The record does not exist or is outside the caller's scope. |
| `500` | `INTERNAL_ERROR` | An unexpected server failure. Internal details are not sent to the caller. |

## Real PostgreSQL integration tests

The integration suite uses a real Prisma 7 client with `@prisma/adapter-pg` and a PostgreSQL database. It creates and removes only records whose IDs begin with `integration-`.

1. Set `DATABASE_URL` to a disposable PostgreSQL database.
2. Synchronize the schema: `bun run db:push`.
3. Run the suite: `bun run test:integration`.

Do not point this URL at production: `prisma db push` changes the database schema.
