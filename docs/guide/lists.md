# Lists, search, and filters

These three options live on `admin.register("Model", { ... })` in **your** app. They only change that model’s list page.

A complete User + Post setup is on [Wire it into your app](/guide/in-your-app). This page is the detail for each option.

## `listDisplay` — columns

```ts
admin.register("User", {
  listDisplay: ["email", "fullName", "role", "isActive"],
});

admin.register("Post", {
  listDisplay: ["title", "author", "published", "createdAt"],
});
```

What you type is what the table shows, left to right.

| Value | What appears |
| --- | --- |
| `"email"`, `"title"`, `"published"` | That scalar |
| `"author"` (a `belongsTo` on Post) | Related User’s display field (`author.email`) |
| `"posts"` (a `hasMany` on User) | Not loaded — do not use as a column |

Omit `listDisplay` and the library picks the display field, other scalars (up to 6), then `createdAt`.

A name that is not on the model fails at `mount`, not at first click.

## `searchFields` — search box

```ts
admin.register("User", {
  searchFields: ["email", "fullName"],
});

admin.register("Post", {
  searchFields: ["title", "content"],
});
```

Only **String** fields. The box on `/admin/users` becomes:

```
WHERE email CONTAINS ? OR fullName CONTAINS ?
```

| If you… | Result |
| --- | --- |
| Omit `searchFields` | All non-id string scalars |
| Pass a non-string (`"isActive"`) | `mount` throws |
| Use PostgreSQL | Set `databaseProvider: "postgresql"` on `createAdmin` for case-insensitive match |
| Type more than 200 characters | `400 VALIDATION_ERROR` |

## `listFilter` — filters

```ts
admin.register("User", {
  listFilter: ["role", "isActive"],
});

admin.register("Post", {
  listFilter: ["published", "createdAt"],
});
```

**Opt-in.** No `listFilter` means no filter UI and no filter query params.

| Field | Control |
| --- | --- |
| enum (`role`) | Select of enum values |
| boolean (`isActive`, `published`) | True / false |
| date-time (`createdAt`) | From / to (`_gte` / `_lte`) |
| number / string | Exact value |

A filter that is not allowed is `400`, not silently ignored. Scope is always `AND`-ed in — Ada cannot filter her way into Contoso.

## `defaultSort` and `perPage`

```ts
admin.register("Post", {
  defaultSort: { field: "createdAt", direction: "desc" },
  perPage: 25,
});
```

| Option | Default if omitted |
| --- | --- |
| `defaultSort` | `createdAt desc`, else the id |
| `perPage` | `50` |

Operators can still change sort in the table. `?sort=` must be a visible scalar.

## `pluralName`

```ts
admin.register("Category", { pluralName: "categories" });
```

Drives `/admin/categories` and `/admin/api/categories`. The auto plural is usually fine (`User` → `users`).

## Minimal real file

This is enough for a useful User list after [install](/guide/getting-started):

```ts
admin.register("User", {
  listDisplay: ["email", "fullName", "role", "isActive"],
  listFilter: ["role", "isActive"],
  searchFields: ["email", "fullName"],
});
```

Add `scope`, permissions, and actions next on [Wire it into your app](/guide/in-your-app).
