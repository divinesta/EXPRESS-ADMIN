# Lists, search, and filters

The list page is a table driven by `register()` plus the schema. The UI does not invent columns.

## Columns

```ts
admin.register("User", {
  listDisplay: ["email", "fullName", "role", "isActive"],
});
```

- Scalar fields render as text, badges, or toggles.
- A `belongsTo` / `hasOne` name in `listDisplay` (for example `"author"`) loads that relation's **display field** only (`author.email`). It does not load `hasMany` collections such as `posts`.
- Hidden and sensitive fields are stripped even if you list them.

## Search

```ts
admin.register("User", {
  searchFields: ["email", "fullName"],
});
```

Search becomes a Prisma `OR` of `contains` on those strings. On PostgreSQL, pass `databaseProvider: "postgresql"` so matching is case-insensitive. MySQL and SQLite get `contains` without `mode: "insensitive"` — that option is PostgreSQL-only.

Search is rejected if the model has no searchable string fields. The query is capped at 200 characters.

## Filters

```ts
admin.register("Post", {
  listFilter: ["published", "createdAt"],
});
```

Only names in `listFilter` are accepted. Anything else is `400 VALIDATION_ERROR`.

| Field type | Query |
| --- | --- |
| boolean, enum, string, number | `?published=true` |
| date-time range | `?createdAt_gte=2026-01-01T00:00:00.000Z&createdAt_lte=2026-12-31T23:59:59.999Z` |

Scope, filters, and search are combined with Prisma `AND`. A caller cannot filter their way out of a tenant.

## Sort and pagination

```ts
admin.register("Post", {
  defaultSort: { field: "createdAt", direction: "desc" },
  perPage: 25,
});
```

`?sort=` must be a visible scalar. `?dir=` is `asc` or `desc`. `?page=` is a positive integer.

Default page size is **50** if you omit `perPage`.

## URL name

Lists live at `/admin/{pluralName}`. Override a bad plural with `pluralName`. The API uses the same slug: `/admin/api/posts`.
