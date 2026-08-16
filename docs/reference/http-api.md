# HTTP API

All routes sit under `basePath` (default `/admin`) and require a valid `AdminUser`.

`:model` is the **plural** admin name (`posts` for `Post`).

| Method | Route | Permission | Description |
| --- | --- | --- | --- |
| `GET` | `/api/schema` | authenticated | Models, visible fields, this user's permissions |
| `GET` | `/api/:model` | `list` | Paginated, scoped list |
| `GET` | `/api/:model/:id` | `view` | One scoped record. 404 if missing or out of scope |
| `POST` | `/api/:model` | `create` | Scalar create (+ `belongsTo` FK) |
| `PUT` | `/api/:model/:id` | `update` | Scalar update on a scoped row |
| `DELETE` | `/api/:model/:id` | `delete` | Delete a scoped row. `204` |
| `POST` | `/api/:model/actions/:action` | list + action | Bulk action on 1–100 scoped ids |

Pipeline on every call: authenticate → resolve model → permission → scope → validate → Prisma.

## List query

| Parameter | Example | Rule |
| --- | --- | --- |
| `page` | `?page=2` | Positive integer |
| `sort` | `?sort=title` | Visible scalar |
| `dir` | `?dir=asc` | `asc` or `desc` |
| `search` | `?search=quarterly` | `searchFields` only; max 200 chars |
| filter | `?published=true` | Must be in `listFilter` |
| range | `?createdAt_gte=` / `_lte=` | Date-time fields only |

List body:

```json
{
  "records": [],
  "total": 0,
  "page": 1,
  "perPage": 50,
  "totalPages": 0
}
```

`belongsTo` columns in `listDisplay` arrive as `{ author: { email: "…" } }`, not as a nested write object.

## Writes

JSON object of visible writable scalars. Rejected: unknown keys, ids, generated fields, relation objects, sensitive names without `expose`, scope-controlled fields on update.

Create inserts simple `scope` equalities. Update and delete use `AND: [scope, { id }]`. Zero matching rows → `404 RECORD_NOT_FOUND`.

## Actions

```json
{ "ids": ["post-1", "post-2"] }
```

See [Custom actions](/guide/actions).

## Schema

`GET /api/schema` returns `identity`, `siteName`, `basePath`, and each registered model’s visible `meta` plus resolved list/filter/search/sort/permissions. Functions (`scope`, hooks) are never serialized.

Error envelope: [Errors](/reference/errors).
