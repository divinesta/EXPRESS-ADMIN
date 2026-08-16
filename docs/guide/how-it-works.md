# How it works

Two clocks. Almost every surprise in this library is mixing them up.

## Mount time

`await admin.mount(app)` is async because this is when the schema is read.

1. `register("User")` only stored intent. It did not talk to Prisma.
2. `mount` calls `getDMMF()` from `@prisma/internals` on your `schema.prisma`.
3. Every registered name is checked against the real models.
4. Field overrides, `listDisplay`, and `searchFields` are validated.
5. Missing config is filled from the schema (display field, columns, filters).
6. Express gets a router at `basePath` (default `/admin`):
   - `GET /admin/api/schema`
   - CRUD and actions under `/admin/api/:model`
   - the pre-built UI for every other path

If you `register("Users")` and the model is `User`, mount throws with the list of real names. Fail at boot, not on the first click.

That is why `mount` must be awaited, and why every `register` must happen **before** `mount`.

## Request time

The browser loads one HTML page. React reads the URL. Data comes from the API. There is no new HTML document per screen.

```
GET  /admin/api/schema
GET  /admin/api/users?page=1
GET  /admin/api/users/:id
POST /admin/api/users
PUT  /admin/api/users/:id
DELETE /admin/api/users/:id
POST /admin/api/users/actions/:action
```

Every `/admin/api/*` call runs this pipeline:

```
getCurrentUser → permission → scope → validate → Prisma → audit?
```

| Step | What it decides |
| --- | --- |
| `getCurrentUser` | Who is this? `null` → 401 |
| Permission | May this role list / view / create / update / delete / run the action? |
| `scope()` | Which rows? Combined with the id so guessing another tenant's id is 404 |
| Validate | Only known, visible, writable fields. No nested writes. |
| Prisma | `prisma.user.findMany` / `create` / `updateMany` / `deleteMany` |
| `audit.write` | Optional. After success only. No field values. |

The UI never talks to Prisma. It fetches `/admin/api/schema` once and renders lists and forms from that JSON.

## Why `/admin/posts/123` still works

There is no `posts/123.html`. Express serves `index.html` for any non-API path. React Router (basename `/admin`) shows the detail view. API routes are mounted first so they always win.

## What the schema endpoint is

`GET /admin/api/schema` is the brain of the UI. It returns registered models, visible fields, list columns, filters, and **this admin's** permissions as booleans.

It is behind the same auth middleware as CRUD. It exposes field names, enums, and relations. Do not serve it anonymously.

## The type the rest of the system uses

After mount, each model is a `FullRegisteredModel`:

- `meta` — from DMMF (`User`, `users`, `prisma.user`, fields)
- `resolved` — defaults filled in (`listDisplay`, `perPage`, …)
- `raw` — your functions (`scope`, hooks, actions). Functions are not sent to the browser.

The router reads all three. The UI only sees a JSON slice of `meta` + `resolved`.
